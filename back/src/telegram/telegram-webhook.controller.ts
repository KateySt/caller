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
import { constantTimeEquals } from '../common/crypto.util.js';
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
