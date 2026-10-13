import {
  BadGatewayException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { differenceInSeconds, subSeconds } from 'date-fns';
import { randomUUID } from 'node:crypto';
import { LessThan, Repository } from 'typeorm';
import { AgentSettingsService } from '../agent-settings/agent-settings.service.js';
import { isUniqueViolation } from '../common/postgres.util.js';
import { LiveKitService } from '../livekit/livekit.service.js';
import {
  AgentTestSession,
  testRoomName,
  type AgentTestEndReason,
  type AgentTestTranscriptTurn,
} from './entities/agent-test-session.entity.js';

/**
 * Owns the full lifecycle of a browser test session with the voice agent (SPEC-06): the
 * one-active-session lock (AC-11), room + agent dispatch + participant token (AC-6..AC-12),
 * the max-duration backstop (AC-18), and the transcript/status writes the voice agent makes
 * through `InternalAgentTestsController`. Logs only session id and room name — never the
 * prompt, the admin secret, or tokens (AC-5).
 */
@Injectable()
export class AgentTestsService {
  private readonly logger = new Logger(AgentTestsService.name);

  private readonly agentName: string;
  private readonly maxDurationSeconds: number;

  // Explicit @Inject: Vitest (esbuild) doesn't emit DI-reflection metadata.
  constructor(
    @Inject(ConfigService) configService: ConfigService,
    @InjectRepository(AgentTestSession)
    private readonly sessionsRepository: Repository<AgentTestSession>,
    @Inject(AgentSettingsService) private readonly agentSettingsService: AgentSettingsService,
    @Inject(LiveKitService) private readonly liveKitService: LiveKitService,
  ) {
    this.agentName = configService.getOrThrow<string>('LIVEKIT_AGENT_NAME');
    this.maxDurationSeconds = configService.getOrThrow<number>('CALL_MAX_DURATION_SECONDS');
  }

  /**
   * AC-6..AC-12: creates the session, its room, dispatches the agent, and mints the admin's
   * join token. `systemPrompt` is already trimmed/validated by `CreateAgentTestSessionDto`.
   */
  async create(
    systemPrompt: string,
  ): Promise<{ session: AgentTestSession; serverUrl: string; participantToken: string }> {
    // AC-11/AC-18: a session stuck past the max duration (e.g. backstop timer lost on restart)
    // must not block new ones.
    await this.expireStale();

    // AC-8: settings are only read, never written.
    const savedPrompt = await this.agentSettingsService.getActivePrompt();
    const promptSource = systemPrompt === savedPrompt.trim() ? 'saved' : 'draft';

    // Id and room name are set in the single insert, so no row can exist without its room.
    const id = randomUUID();
    const roomName = testRoomName(id);
    const session = this.sessionsRepository.create({
      id,
      status: 'in_progress',
      endReason: null,
      failureReason: null,
      systemPrompt,
      promptSource,
      transcript: [],
      roomName,
      endedAt: null,
      durationSeconds: null,
    });

    let saved: AgentTestSession;
    try {
      saved = await this.sessionsRepository.save(session);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('A test session is already in progress');
      }

      throw error;
    }

    this.logger.log(`Test session ${saved.id} created (room=${roomName})`);

    let step = 'Room creation';
    let credentials: { serverUrl: string; participantToken: string };
    try {
      await this.liveKitService.ensureCallRoom(roomName);
      step = 'Agent dispatch';
      await this.liveKitService.dispatchTestAgent(roomName, this.agentName, saved.id);
      step = 'Token minting';
      credentials = await this.liveKitService.createParticipantToken(
        roomName,
        `admin-test-${randomUUID()}`,
      );
    } catch (error) {
      // AC-12: mark failed (which also deletes the room) and surface a gateway error.
      this.logger.error(`Test session ${saved.id} (room=${roomName}): ${step} failed`);
      await this.markFailed(saved.id, `${step} failed: ${describeError(error)}`);
      throw new BadGatewayException('Could not start the test session');
    }

    // AC-18: hard backstop even if neither the admin nor the agent ever reports an end.
    // Races `markEnded`'s in_progress guard — first outcome wins (AC-20). Best-effort only:
    // on serverless (Vercel) the timer may never fire, so `expireStale()` also runs on every
    // create/list/findOne.
    setTimeout(() => {
      this.markCompleted(saved.id, 'max_duration_reached').catch((error: unknown) => {
        this.logger.error(
          `Test session ${saved.id}: max-duration backstop failed: ${describeError(error)}`,
        );
      });
    }, this.maxDurationSeconds * 1000).unref();

    return { session: saved, ...credentials };
  }

  /** AC-18: ends every `in_progress` session older than the max duration. */
  async expireStale(): Promise<void> {
    const cutoff = subSeconds(new Date(), this.maxDurationSeconds);
    const stale = await this.sessionsRepository.find({
      where: { status: 'in_progress', startedAt: LessThan(cutoff) },
      select: { id: true },
    });

    for (const { id } of stale) {
      this.logger.warn(`Test session ${id} exceeded the max duration; ending it`);
      await this.markCompleted(id, 'max_duration_reached');
    }
  }

  /** AC-13: most-recent-first, without the transcript (the summary never includes it). */
  async list(): Promise<AgentTestSession[]> {
    // AC-18 / edge case: lazy expiry so no row stays in_progress past the max duration.
    await this.expireStale();

    return this.sessionsRepository.find({
      select: {
        id: true,
        status: true,
        endReason: true,
        failureReason: true,
        promptSource: true,
        systemPrompt: true,
        startedAt: true,
        endedAt: true,
        durationSeconds: true,
      },
      order: { startedAt: 'DESC' },
    });
  }

  /** AC-14/AC-15. */
  async findOne(id: string): Promise<AgentTestSession> {
    // AC-18 / edge case: lazy expiry (age-based, so a live session is unaffected).
    await this.expireStale();

    const session = await this.findForAgent(id);
    if (!session) {
      throw new NotFoundException('Test session not found');
    }

    return session;
  }

  /** Used by the voice agent (via the internal API) to look up the session it was dispatched for. */
  findForAgent(id: string): Promise<AgentTestSession | null> {
    return this.sessionsRepository.findOne({ where: { id } });
  }

  /** AC-21/AC-22: idempotent per `seq` — the agent retries over the network. */
  async appendTranscriptTurn(id: string, turn: AgentTestTranscriptTurn): Promise<void> {
    await this.sessionsRepository.query(
      `UPDATE "agent_test_session" SET "transcript" = "transcript" || $1::jsonb
       WHERE "id" = $2 AND NOT "transcript" @> $3::jsonb`,
      [JSON.stringify([turn]), id, JSON.stringify([{ seq: turn.seq }])],
    );
  }

  /** AC-17/AC-20: ends the session idempotently — the first outcome wins — and deletes its room. */
  async markEnded(
    id: string,
    status: 'completed' | 'failed',
    endReason: AgentTestEndReason | null,
    failureReason: string | null,
  ): Promise<void> {
    const session = await this.sessionsRepository.findOne({ where: { id } });
    if (!session || session.status !== 'in_progress') {
      return;
    }

    const endedAt = new Date();
    const durationSeconds = differenceInSeconds(endedAt, session.startedAt, {
      roundingMethod: 'round',
    });

    // Conditional on still being in_progress so two concurrent end reports can't both win.
    const result = await this.sessionsRepository.update(
      { id, status: 'in_progress' },
      { status, endReason, failureReason, endedAt, durationSeconds },
    );
    if (!result.affected) {
      return;
    }
    this.logger.log(`Test session ${id} ended: ${status} (room=${session.roomName ?? 'none'})`);

    if (session.roomName) {
      await this.liveKitService.endRoom(session.roomName);
    }
  }

  markCompleted(id: string, endReason: AgentTestEndReason): Promise<void> {
    return this.markEnded(id, 'completed', endReason, null);
  }

  /** AC-12/AC-19. */
  markFailed(id: string, failureReason: string): Promise<void> {
    return this.markEnded(id, 'failed', null, failureReason);
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
