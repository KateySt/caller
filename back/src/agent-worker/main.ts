import 'reflect-metadata';
// Needed for the top-level `cli.runApp(...)` call below, which reads `LIVEKIT_AGENT_NAME`
// from `process.env` before any Nest application context (and so `ConfigService`) exists —
// mirrors `src/database/data-source.ts`, the other entrypoint that runs outside Nest's DI.
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  Agent,
  AgentSession,
  AgentSessionEventTypes,
  CloseReason,
  ServerOptions,
  cli,
  defineAgent,
  llm,
  type JobContext,
} from '@livekit/agents';
import * as anthropic from '@livekit/agents-plugin-anthropic';
import * as deepgram from '@livekit/agents-plugin-deepgram';
import * as elevenlabs from '@livekit/agents-plugin-elevenlabs';
import { AppModule } from '../app.module.js';
import { CallsService } from '../calls/calls.service.js';

/** How long to wait for the SIP callee to actually join before giving up (SPEC-02 AC-19/20). */
const PARTICIPANT_JOIN_TIMEOUT_MS = 90_000;
/** Grace period after the farewell line finishes playing before the room is torn down. */
const FAREWELL_GRACE_MS = 300;

/**
 * Runs as its own worker process (`npm run agent:dev` / `agent:start`) rather than inside the
 * Nest HTTP server — the LiveKit Agents framework dispatches jobs to a pool of worker
 * processes, it does not run as a Nest provider. Reuses `AppModule` via
 * `createApplicationContext` purely for DI (`CallsService`, DB access, validated config), not
 * for HTTP — no controller here is ever bound to a port.
 */
let contextPromise: Promise<{ callsService: CallsService; configService: ConfigService }> | undefined;

function getContext(): Promise<{ callsService: CallsService; configService: ConfigService }> {
  contextPromise ??= NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  }).then((app) => ({ callsService: app.get(CallsService), configService: app.get(ConfigService) }));

  return contextPromise;
}

export default defineAgent({
  entry: async (ctx: JobContext) => {
    const callId = parseCallId(ctx.job.metadata);
    const { callsService, configService } = await getContext();

    const call = await callsService.findOne(callId);
    if (!call) {
      ctx.shutdown(`Call ${callId} not found`);
      return;
    }

    let finalized = false;
    const finalize = async (
      outcome:
        | { status: 'completed'; endReason: 'agent_completed' | 'callee_hangup' | 'max_duration_reached' }
        | { status: 'failed'; failureReason: string },
    ): Promise<void> => {
      if (finalized) {
        return;
      }
      finalized = true;

      if (outcome.status === 'completed') {
        await callsService.markCompleted(callId, outcome.endReason);
      } else {
        await callsService.markFailed(callId, outcome.failureReason);
      }
    };

    try {
      await ctx.connect();

      // AC-19/20 backstop: `CallsService` already marks the call failed and tears the room
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
          apiKey: configService.getOrThrow<string>('DEEPGRAM_API_KEY'),
          model: configService.getOrThrow<string>('DEEPGRAM_MODEL'),
        }),
        llm: new anthropic.LLM({
          model: configService.getOrThrow<string>('ANTHROPIC_MODEL'),
          apiKey: configService.getOrThrow<string>('ANTHROPIC_API_KEY'),
        }),
        tts: new elevenlabs.TTS({
          apiKey: configService.getOrThrow<string>('ELEVENLABS_API_KEY'),
          voiceId: configService.getOrThrow<string>('ELEVENLABS_VOICE_ID'),
          model: configService.getOrThrow<string>('ELEVENLABS_MODEL'),
        }),
        // No bundled VAD/turn-detector model (those call LiveKit's inference gateway, which
        // this repo's self-hosted dev server has no Cloud project wired up for) — fall back
        // to STT-driven endpointing instead.
        vad: null,
        turnHandling: { turnDetection: 'stt' },
      });

      // AC-12/13: every transcribed callee turn and every agent reply, as they happen.
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

        void callsService.appendTranscriptTurn(callId, { role, text, at: new Date().toISOString() });
      });

      // AC-15/16/20: the single place that decides how the call ended.
      session.on(AgentSessionEventTypes.Close, (ev) => {
        if (ev.error) {
          void finalize({ status: 'failed', failureReason: `Pipeline error: ${describeError(ev.error)}` });
        } else if (ev.reason === CloseReason.PARTICIPANT_DISCONNECTED) {
          void finalize({ status: 'completed', endReason: 'callee_hangup' });
        } else {
          void finalize({ status: 'completed', endReason: 'agent_completed' });
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
      await finalize({ status: 'failed', failureReason: describeError(error) });
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
      agentName: process.env.LIVEKIT_AGENT_NAME || 'caller-voice-agent',
    }),
  );
}
