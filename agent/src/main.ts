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
import {
  BackendClient,
  type CallOutcome,
  type EndReason,
  type JobTarget,
} from './backend-client.js';
import { config } from './config.js';

/** How long to wait for the SIP callee / browser admin to join before giving up (SPEC-02 AC-19/20). */
const PARTICIPANT_JOIN_TIMEOUT_MS = 90_000;
/** Grace period after the farewell line finishes playing before the room is torn down. */
const FAREWELL_GRACE_MS = 300;

const backend = new BackendClient(config.BACKEND_URL, config.AGENT_INTERNAL_TOKEN);

/** What differs between a PSTN call and a browser test session; everything else is shared. */
interface JobProfile {
  /** Human label for log/shutdown messages. */
  label: string;
  /** Log field the target id is recorded under. */
  idField: 'callId' | 'testSessionId';
  sttModel: string;
  silenceTimeoutSeconds: number;
  silenceEndReason: EndReason;
  hangupEndReason: EndReason;
  joinTimeoutMessage: string;
}

function profileFor(target: JobTarget): JobProfile {
  return target.kind === 'call'
    ? {
        label: 'Call',
        idField: 'callId',
        sttModel: config.DEEPGRAM_MODEL,
        silenceTimeoutSeconds: config.CALLEE_SILENCE_TIMEOUT_SECONDS,
        silenceEndReason: 'callee_unresponsive',
        hangupEndReason: 'callee_hangup',
        joinTimeoutMessage: 'Callee never joined the call room',
      }
    : {
        // SPEC-06 AC-25/28: wideband STT and a shorter, separate silence timeout.
        label: 'Test session',
        idField: 'testSessionId',
        sttModel: config.DEEPGRAM_TEST_MODEL,
        silenceTimeoutSeconds: config.TEST_SILENCE_TIMEOUT_SECONDS,
        silenceEndReason: 'admin_unresponsive',
        hangupEndReason: 'admin_disconnected',
        joinTimeoutMessage: 'Admin never joined the test session room',
      };
}

/**
 * The calling agent, deployed on its own to LiveKit Cloud Agents. `back/` dispatches it
 * explicitly by name either into a PSTN call's room with `{ callId }` metadata (SPEC-02) or
 * into a browser test session's room with `{ testSessionId }` metadata (SPEC-06); all state
 * is read and written through the backend's internal API, never a database.
 */
export default defineAgent({
  entry: async (ctx: JobContext) => {
    const logger = log().child({ room: ctx.room.name });
    const target = parseJobTarget(ctx.job.metadata);
    if (!target) {
      // SPEC-06 AC-27: nothing to talk to the backend about.
      ctx.shutdown('Job metadata identifies neither a call nor a test session');
      return;
    }
    const profile = profileFor(target);
    const logIds = { [profile.idField]: target.id };

    const call = await backend.getContext(target);
    if (!call || call.status !== 'in_progress') {
      ctx.shutdown(`${profile.label} ${target.id} is ${call ? call.status : 'not found'}`);
      return;
    }

    // Writes go out in order (transcript turns, then the outcome) without blocking the
    // conversation; the job does not exit until they have been flushed.
    let pendingWrites: Promise<void> = Promise.resolve();
    const enqueueWrite = (write: () => Promise<void>): void => {
      pendingWrites = pendingWrites.then(write).catch((error: unknown) => {
        logger.error({ ...logIds, error: describeError(error) }, 'backend write failed');
      });
    };
    ctx.addShutdownCallback(() => pendingWrites);

    let finalized = false;
    const finalize = (outcome: CallOutcome): void => {
      if (finalized) {
        return;
      }
      finalized = true;
      enqueueWrite(() => backend.end(target, outcome));
    };

    try {
      await ctx.connect();

      // AC-19/20 backstop: the backend already marks the call failed and tears the room
      // down when the SIP dial itself never connects, which disconnects this job too — this
      // timeout only guards the (should-not-happen) case where that never arrives.
      await withTimeout(
        ctx.waitForParticipant(),
        PARTICIPANT_JOIN_TIMEOUT_MS,
        profile.joinTimeoutMessage,
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
          model: profile.sttModel as deepgram.STTModels,
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

      // Hang up if the callee/admin stays silent too long (e.g. phone put down, line left open,
      // tab left idle), so it doesn't hold on until the much longer max-duration backstop.
      let silenceTimer: NodeJS.Timeout | undefined;
      const resetSilenceTimer = (): void => {
        clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => {
          finalize({ status: 'completed', endReason: profile.silenceEndReason });
          void session.close();
        }, profile.silenceTimeoutSeconds * 1000);
      };
      resetSilenceTimer();
      session.on(AgentSessionEventTypes.UserInputTranscribed, (ev) => {
        if (ev.transcript.trim()) {
          resetSilenceTimer();
        }
      });

      // AC-12/13: every transcribed callee turn and every agent reply, as they happen. In a
      // test session the admin's turns are recorded under the same `callee` role (SPEC-06 AC-25).
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
        enqueueWrite(() => backend.appendTranscriptTurn(target, turn));
      });

      // AC-15/16/20: the single place that decides how the call ended.
      session.on(AgentSessionEventTypes.Close, (ev) => {
        clearTimeout(silenceTimer);
        if (ev.error) {
          finalize({ status: 'failed', failureReason: `Pipeline error: ${describeError(ev.error)}` });
        } else if (ev.reason === CloseReason.PARTICIPANT_DISCONNECTED) {
          finalize({ status: 'completed', endReason: profile.hangupEndReason });
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

/** `{ callId }` → call, `{ testSessionId }` → test session, anything else → `null`. */
function parseJobTarget(metadata: string): JobTarget | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(metadata || '{}');
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }

  const { callId, testSessionId } = parsed as { callId?: unknown; testSessionId?: unknown };
  if (typeof callId === 'string' && callId) {
    return { kind: 'call', id: callId };
  }
  if (typeof testSessionId === 'string' && testSessionId) {
    return { kind: 'test', id: testSessionId };
  }

  return null;
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
