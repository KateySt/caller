// Local development only: loads `agent/.env`. On LiveKit Cloud there is no .env file —
// secrets and the LIVEKIT_* credentials are injected as environment variables.
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import {
  Agent,
  AgentSession,
  AgentSessionEventTypes,
  CloseReason,
  ServerOptions,
  cli,
  defineAgent,
  llm,
  log,
  type JobContext,
} from '@livekit/agents';
import * as anthropic from '@livekit/agents-plugin-anthropic';
import * as deepgram from '@livekit/agents-plugin-deepgram';
import * as elevenlabs from '@livekit/agents-plugin-elevenlabs';
import { BackendClient, type CallOutcome } from './backend-client.js';
import { config } from './config.js';

/** How long to wait for the SIP callee to actually join before giving up (SPEC-02 AC-19/20). */
const PARTICIPANT_JOIN_TIMEOUT_MS = 90_000;
/** Grace period after the farewell line finishes playing before the room is torn down. */
const FAREWELL_GRACE_MS = 300;

const backend = new BackendClient(config.BACKEND_URL, config.AGENT_INTERNAL_TOKEN);

/**
 * The PSTN calling agent (SPEC-02), deployed on its own to LiveKit Cloud Agents. `back/`
 * dispatches it explicitly by name into each call's room with `{ callId }` metadata; all call
 * state is read and written through the backend's internal API, never a database.
 */
export default defineAgent({
  entry: async (ctx: JobContext) => {
    const logger = log().child({ room: ctx.room.name });
    const callId = parseCallId(ctx.job.metadata);

    const call = await backend.getCall(callId);
    if (!call || call.status !== 'in_progress') {
      ctx.shutdown(`Call ${callId} is ${call ? call.status : 'not found'}`);
      return;
    }

    // Writes go out in order (transcript turns, then the outcome) without blocking the
    // conversation; the job does not exit until they have been flushed.
    let pendingWrites: Promise<void> = Promise.resolve();
    const enqueueWrite = (write: () => Promise<void>): void => {
      pendingWrites = pendingWrites.then(write).catch((error: unknown) => {
        logger.error({ callId, error: describeError(error) }, 'backend write failed');
      });
    };
    ctx.addShutdownCallback(() => pendingWrites);

    let finalized = false;
    const finalize = (outcome: CallOutcome): void => {
      if (finalized) {
        return;
      }
      finalized = true;
      enqueueWrite(() => backend.endCall(callId, outcome));
    };

    try {
      await ctx.connect();

      // AC-19/20 backstop: the backend already marks the call failed and tears the room
      // down when the SIP dial itself never connects, which disconnects this job too — this
      // timeout only guards the (should-not-happen) case where that never arrives.
      await withTimeout(
        ctx.waitForParticipant(),
        PARTICIPANT_JOIN_TIMEOUT_MS,
        'Callee never joined the call room',
      );

      let endRequestedByAgent = false;

      const endCallTool = llm.tool({
        description:
          'Call this once the conversation has naturally concluded, right after saying a ' +
          'brief goodbye to the person on the call.',
        execute: async () => {
          endRequestedByAgent = true;
          return 'Acknowledged — the call will end shortly.';
        },
      });

      const agent = new Agent({
        instructions: call.systemPrompt,
        tools: { endCall: endCallTool },
      });

      const session = new AgentSession({
        stt: new deepgram.STT({
          apiKey: config.DEEPGRAM_API_KEY,
          model: config.DEEPGRAM_MODEL as deepgram.STTModels,
        }),
        llm: new anthropic.LLM({
          model: config.ANTHROPIC_MODEL,
          apiKey: config.ANTHROPIC_API_KEY,
        }),
        tts: new elevenlabs.TTS({
          apiKey: config.ELEVENLABS_API_KEY,
          voiceId: config.ELEVENLABS_VOICE_ID,
          model: config.ELEVENLABS_MODEL as elevenlabs.TTSModels,
        }),
        // No bundled VAD/turn-detector model — fall back to STT-driven endpointing instead.
        vad: null,
        turnHandling: { turnDetection: 'stt' },
      });

      // Hang up if the callee stays silent too long (e.g. phone put down, line left open), so
      // the call doesn't hold the line until the much longer max-duration backstop.
      let silenceTimer: NodeJS.Timeout | undefined;
      const resetSilenceTimer = (): void => {
        clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => {
          finalize({ status: 'completed', endReason: 'callee_unresponsive' });
          void session.close();
        }, config.CALLEE_SILENCE_TIMEOUT_SECONDS * 1000);
      };
      resetSilenceTimer();
      session.on(AgentSessionEventTypes.UserInputTranscribed, (ev) => {
        if (ev.transcript.trim()) {
          resetSilenceTimer();
        }
      });

      // AC-12/13: every transcribed callee turn and every agent reply, as they happen.
      let seq = 0;
      session.on(AgentSessionEventTypes.ConversationItemAdded, (ev) => {
        const item = ev.item;
        if (item.type !== 'message') {
          return;
        }

        const role = item.role === 'user' ? 'callee' : item.role === 'assistant' ? 'agent' : null;
        const text = item.textContent;
        if (!role || !text) {
          return;
        }

        const turn = { seq: seq++, role, text, at: new Date().toISOString() } as const;
        enqueueWrite(() => backend.appendTranscriptTurn(callId, turn));
      });

      // AC-15/16/20: the single place that decides how the call ended.
      session.on(AgentSessionEventTypes.Close, (ev) => {
        clearTimeout(silenceTimer);
        if (ev.error) {
          finalize({ status: 'failed', failureReason: `Pipeline error: ${describeError(ev.error)}` });
        } else if (ev.reason === CloseReason.PARTICIPANT_DISCONNECTED) {
          finalize({ status: 'completed', endReason: 'callee_hangup' });
        } else {
          finalize({ status: 'completed', endReason: 'agent_completed' });
        }
      });

      // AC-15: once the agent has spoken its farewell after calling `endCall`, hang up.
      session.on(AgentSessionEventTypes.AgentStateChanged, (ev) => {
        if (endRequestedByAgent && ev.oldState === 'speaking' && ev.newState !== 'speaking') {
          setTimeout(() => void session.close(), FAREWELL_GRACE_MS);
        }
      });

      await session.start({ agent, room: ctx.room });
    } catch (error) {
      finalize({ status: 'failed', failureReason: describeError(error) });
    }
  },
});

function parseCallId(metadata: string): string {
  try {
    const parsed = JSON.parse(metadata || '{}') as { callId?: unknown };
    if (typeof parsed.callId !== 'string' || !parsed.callId) {
      throw new Error('metadata has no callId');
    }

    return parsed.callId;
  } catch (error) {
    throw new Error(`Job dispatched without a valid callId in metadata: ${describeError(error)}`);
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cli.runApp(
    new ServerOptions({
      agent: fileURLToPath(import.meta.url),
      agentName: config.LIVEKIT_AGENT_NAME,
    }),
  );
}
