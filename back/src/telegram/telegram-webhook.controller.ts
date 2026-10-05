import {
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Post,
  Body,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { createHash, timingSafeEqual } from 'node:crypto';
import { TelegramUpdatesService } from './telegram-updates.service.js';

/** Telegram's webhook endpoint (`/api/telegram/webhook`), SPEC-04 AC-33 / AC-34. */
@ApiExcludeController()
@Controller('telegram/webhook')
export class TelegramWebhookController {
  constructor(@Inject(TelegramUpdatesService) private readonly updates: TelegramUpdatesService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  receive(
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Body() update: unknown,
  ): void {
    const expected = this.updates.expectedWebhookSecret;
    if (!expected) {
      throw new NotFoundException(); // polling mode: no webhook is served
    }
    if (typeof secret !== 'string' || !constantTimeEquals(secret, expected)) {
      throw new ForbiddenException('Invalid secret token');
    }

    // AC-34: acknowledge now; slow work must not make Telegram redeliver the update.
    void this.updates.handleWebhookUpdate(update);
  }
}

/** Hashing first gives equal-length buffers, so the comparison is constant-time overall. */
function constantTimeEquals(a: string, b: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();

  return timingSafeEqual(digest(a), digest(b));
}
