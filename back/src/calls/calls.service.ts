import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { differenceInSeconds } from 'date-fns';
import { Repository } from 'typeorm';
import { AgentSettingsService } from '../agent-settings/agent-settings.service.js';
import { isUniqueViolation } from '../common/postgres.util.js';
import { LiveKitService } from '../livekit/livekit.service.js';
import { UsersService } from '../users/users.service.js';
import {
  Call,
  callRoomName,
  type CallEndReason,
  type CallTranscriptTurn,
} from './entities/call.entity.js';

/**
 * Owns the full lifecycle of a PSTN call (SPEC-02): placing it, the race-safe one-call-per-user
 * lock (AC-8), the background dial + agent dispatch, the hard max-duration backstop (AC-17,
 * AC-23), and the transcript/status writes the voice agent (`agent/`) makes through `InternalCallsController`.
 */
@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  private readonly sipTrunkId: string;
  private readonly agentName: string;
  private readonly maxDurationSeconds: number;

  // Explicit @Inject: see AppController's constructor comment — this whole module tree
  // also runs under Vitest (esbuild), which doesn't emit DI-reflection metadata.
  constructor(
    @Inject(ConfigService) configService: ConfigService,
    @InjectRepository(Call)
    private readonly callsRepository: Repository<Call>,
    @Inject(UsersService) private readonly usersService: UsersService,
    @Inject(AgentSettingsService) private readonly agentSettingsService: AgentSettingsService,
    @Inject(LiveKitService) private readonly liveKitService: LiveKitService,
  ) {
    this.sipTrunkId = configService.getOrThrow<string>('LIVEKIT_SIP_TRUNK_ID');
    this.agentName = configService.getOrThrow<string>('LIVEKIT_AGENT_NAME');
    this.maxDurationSeconds = configService.getOrThrow<number>('CALL_MAX_DURATION_SECONDS');
  }

  /** AC-6/AC-7/AC-8: creates the call record, then dials in the background. */
  async placeCall(userId: string): Promise<Call> {
    const user = await this.usersService.findOne(userId);
    const systemPrompt = await this.agentSettingsService.getActivePrompt();

    const call = this.callsRepository.create({
      userId: user.id,
      phoneNumber: user.phoneNumber,
      status: 'in_progress',
      endReason: null,
      failureReason: null,
      systemPrompt,
      transcript: [],
      roomName: null,
      endedAt: null,
      durationSeconds: null,
    });

    let saved: Call;
    try {
      saved = await this.callsRepository.save(call);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('A call to this user is already in progress');
      }

      throw error;
    }

    saved.roomName = callRoomName(saved.id);
    await this.callsRepository.update(saved.id, { roomName: saved.roomName });

    // Returns as soon as dialing starts rather than blocking on the whole call — the
    // client polls GET /users/:id/calls/:callId for live status/transcript (front SPEC-02).
    void this.startCall(saved).catch((error) => {
      this.logger.error(`Unhandled error starting call ${saved.id}: ${describeError(error)}`);
      void this.markFailed(saved.id, `Unexpected error: ${describeError(error)}`);
    });

    return saved;
  }

  /** AC-9: that User's calls, most-recent-first. */
  async listForUser(userId: string): Promise<Call[]> {
    await this.usersService.findOne(userId);

    return this.callsRepository.find({ where: { userId }, order: { startedAt: 'DESC' } });
  }

  /** AC-10/AC-11: a single call, scoped to its owning user. */
  async findOneForUser(userId: string, callId: string): Promise<Call> {
    await this.usersService.findOne(userId);
    const call = await this.callsRepository.findOne({ where: { id: callId } });

    if (!call || call.userId !== userId) {
      throw new NotFoundException('Call not found');
    }

    return call;
  }

  /** Used by the voice agent (via the internal API) to look up the call it was dispatched for. */
  findOne(callId: string): Promise<Call | null> {
    return this.callsRepository.findOne({ where: { id: callId } });
  }

  /**
   * AC-12/AC-13: appends one transcript turn as the conversation happens. Idempotent per
   * `seq` — the agent retries over the network, so a turn may arrive more than once.
   */
  async appendTranscriptTurn(callId: string, turn: Required<CallTranscriptTurn>): Promise<void> {
    await this.callsRepository.query(
      `UPDATE "call" SET "transcript" = "transcript" || $1::jsonb
       WHERE "id" = $2 AND NOT "transcript" @> $3::jsonb`,
      [JSON.stringify([turn]), callId, JSON.stringify([{ seq: turn.seq }])],
    );
  }

  /** AC-15/AC-16/AC-17/AC-18: ends the call, idempotently — the first caller wins (edge case). */
  async markEnded(
    callId: string,
    status: 'completed' | 'failed',
    endReason: CallEndReason | null,
    failureReason: string | null,
  ): Promise<void> {
    const call = await this.callsRepository.findOne({ where: { id: callId } });
    if (!call || call.status !== 'in_progress') {
      return;
    }

    const endedAt = new Date();
    const durationSeconds = differenceInSeconds(endedAt, call.startedAt, { roundingMethod: 'round' });

    await this.callsRepository.update(callId, {
      status,
      endReason,
      failureReason,
      endedAt,
      durationSeconds,
    });

    if (call.roomName) {
      await this.liveKitService.endRoom(call.roomName);
    }
  }

  markCompleted(callId: string, endReason: CallEndReason): Promise<void> {
    return this.markEnded(callId, 'completed', endReason, null);
  }

  /** AC-19/AC-20: failed before or during the conversation. */
  markFailed(callId: string, failureReason: string): Promise<void> {
    return this.markEnded(callId, 'failed', null, failureReason);
  }

  /**
   * Room -> agent dispatch -> dial. Runs detached from the HTTP request (see `placeCall`).
   * A dial failure (AC-19) and the max-duration backstop (AC-17) are both handled here;
   * everything that happens once the callee has picked up is the voice agent's job.
   */
  private async startCall(call: Call): Promise<void> {
    const roomName = call.roomName;
    if (!roomName) {
      throw new Error('Call has no room name');
    }

    await this.liveKitService.ensureCallRoom(roomName);
    await this.liveKitService.dispatchCallAgent(roomName, this.agentName, call.id);

    try {
      await this.liveKitService.dialOutboundSip({
        trunkId: this.sipTrunkId,
        phoneNumber: call.phoneNumber,
        roomName,
        maxCallDurationSeconds: this.maxDurationSeconds,
      });
    } catch (error) {
      // AC-19: never connected — busy, no answer, trunk failure, etc.
      await this.markFailed(call.id, describeError(error));
      await this.liveKitService.endRoom(roomName);
      return;
    }

    // AC-17/AC-23: hard backstop even if the agent/callee never end the call themselves.
    // The voice agent and the callee hangup path both race this via `markEnded`'s
    // in_progress guard — whichever observes the end first wins (edge case).
    setTimeout(() => {
      void this.markCompleted(call.id, 'max_duration_reached');
    }, this.maxDurationSeconds * 1000).unref();
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
