import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Post,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { LiveKitService } from './livekit.service.js';

/**
 * Room and participant lifecycle events from the SFU (`/api/livekit/webhook`).
 *
 * The `Authorization` header carries LiveKit's signed JWT — that signature, checked
 * against the raw body, is the only authentication here. Events are at-least-once and
 * unordered, so handlers must stay idempotent; this one only logs.
 */
@ApiExcludeController()
@Controller('livekit/webhook')
export class LiveKitWebhookController {
  private readonly logger = new Logger(LiveKitWebhookController.name);

  // Explicit @Inject: see AppController's constructor comment — this whole module tree
  // also runs under Vitest (esbuild), which doesn't emit DI-reflection metadata.
  constructor(@Inject(LiveKitService) private readonly liveKitService: LiveKitService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers('authorization') authHeader?: string,
  ): Promise<string> {
    // Verification needs the exact bytes LiveKit signed — see `rawBody` in main.ts.
    const rawBody = request.rawBody?.toString('utf8');
    if (!rawBody) {
      this.logger.warn('LiveKit webhook received with no raw body — check the body parser setup');
      return 'ok';
    }

    try {
      const event = await this.liveKitService.verifyWebhook(rawBody, authHeader);
      this.logger.log(
        `LiveKit ${event.event} room=${event.room?.name ?? '-'} participant=${
          event.participant?.identity ?? '-'
        }`,
      );
    } catch (error) {
      // Never throw: a non-2xx just makes LiveKit retry.
      this.logger.warn(
        `Rejected LiveKit webhook: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return 'ok';
  }
}
