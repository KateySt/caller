import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { LiveKitAPI, SipCallError, WebhookReceiver, type WebhookEvent } from 'livekit-server-sdk';

const REQUEST_TIMEOUT_SECONDS = 10;
/** Agent + callee. */
const MAX_PARTICIPANTS = 2;
/** Tear the room down a minute after the last participant leaves. */
const EMPTY_TIMEOUT_SECONDS = 60;

/**
 * Owns every LiveKit credential and SDK type. No other module touches the API key,
 * the secret, or `livekit-server-sdk` directly.
 */
@Injectable()
export class LiveKitService {
  private readonly logger = new Logger(LiveKitService.name);

  private readonly api: LiveKitAPI;
  private readonly webhookReceiver: WebhookReceiver;

  // Explicit @Inject: see AppController's constructor comment — this whole module tree
  // also runs under Vitest (esbuild), which doesn't emit DI-reflection metadata.
  constructor(@Inject(ConfigService) configService: ConfigService) {
    const serverUrl = configService.getOrThrow<string>('LIVEKIT_URL');
    const apiKey = configService.getOrThrow<string>('LIVEKIT_API_KEY');
    const apiSecret = configService.getOrThrow<string>('LIVEKIT_API_SECRET');

    this.api = new LiveKitAPI({
      host: serverUrl,
      apiKey,
      secret: apiSecret,
      requestTimeout: REQUEST_TIMEOUT_SECONDS,
    });
    this.webhookReceiver = new WebhookReceiver(apiKey, apiSecret);
  }

  /** Verifies a LiveKit webhook against the raw request body (a parsed object will fail). */
  verifyWebhook(rawBody: string, authHeader: string | undefined): Promise<WebhookEvent> {
    return this.webhookReceiver.receive(rawBody, authHeader);
  }

  /**
   * Creates (or no-ops onto the existing) room a PSTN call runs in, up front, so the agent
   * dispatch and the SIP dial both target a room that is guaranteed to already exist.
   */
  async ensureCallRoom(roomName: string): Promise<void> {
    try {
      await this.api.room.createRoom({
        name: roomName,
        emptyTimeout: EMPTY_TIMEOUT_SECONDS,
        maxParticipants: MAX_PARTICIPANTS,
      });
    } catch (error) {
      this.logger.error(`LiveKit createRoom failed for ${roomName}: ${describeError(error)}`);
      throw new Error(`Failed to create the call room: ${describeError(error)}`);
    }
  }

  /** Explicit agent dispatch (SPEC-02 §9) — `agentName` must match the worker's registration. */
  async dispatchCallAgent(roomName: string, agentName: string, callId: string): Promise<void> {
    try {
      await this.api.agentDispatch.createDispatch(roomName, agentName, {
        metadata: JSON.stringify({ callId }),
      });
    } catch (error) {
      this.logger.error(`Agent dispatch failed for room=${roomName}: ${describeError(error)}`);
      throw new Error(`Failed to dispatch the calling agent: ${describeError(error)}`);
    }
  }

  /**
   * Dials `phoneNumber` over the configured SIP trunk into `roomName` and waits for the
   * callee to answer. Throws a plain `Error` (not an `HttpException` — this runs off the
   * HTTP request path, in `CallsService`'s background dial) describing the telephony
   * outcome (busy, no answer, trunk failure, …) on anything but a pickup (SPEC-02 AC-19).
   */
  async dialOutboundSip(options: {
    trunkId: string;
    phoneNumber: string;
    roomName: string;
    maxCallDurationSeconds: number;
  }): Promise<void> {
    try {
      await this.api.sip.createSipParticipant(
        options.trunkId,
        options.phoneNumber,
        options.roomName,
        {
          participantIdentity: `callee-${randomUUID()}`,
          participantName: 'Callee',
          waitUntilAnswered: true,
          maxCallDuration: options.maxCallDurationSeconds,
        },
      );
    } catch (error) {
      throw new Error(describeSipFailure(error));
    }
  }

  /** Ends every participant's connection, used to enforce the hard call-duration backstop. */
  async endRoom(roomName: string): Promise<void> {
    try {
      await this.api.room.deleteRoom(roomName);
    } catch (error) {
      this.logger.warn(`LiveKit deleteRoom failed for ${roomName}: ${describeError(error)}`);
    }
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/** AC-19: a human-readable telephony outcome — busy, no answer, trunk failure, etc. */
function describeSipFailure(error: unknown): string {
  if (error instanceof SipCallError) {
    const code = error.sipStatusCode;
    const reason = error.sipStatus ?? error.message;

    if (code === 486 || code === 600) {
      return `Busy (SIP ${code} ${reason})`;
    }
    if (code === 603) {
      return `Declined (SIP ${code} ${reason})`;
    }
    if (code === 408 || code === 480) {
      return `No answer (SIP ${code} ${reason})`;
    }

    return `SIP call failed (${code ?? '?'} ${reason})`;
  }

  return describeError(error);
}
