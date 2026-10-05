import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelegramLinkToken } from './entities/telegram-link-token.entity.js';
import { TelegramLink } from './entities/telegram-link.entity.js';
import { TelegramMessage } from './entities/telegram-message.entity.js';
import { TelegramUpdate } from './entities/telegram-update.entity.js';
import { TelegramLinkService } from './telegram-link.service.js';
import { TelegramUpdatesService } from './telegram-updates.service.js';
import { TelegramWebhookController } from './telegram-webhook.controller.js';
import { TelegramService } from './telegram.service.js';

/**
 * Independent of `UsersModule` (it only knows user ids), so `UsersModule → TelegramModule`
 * stays acyclic. The `/users/:id/telegram*` routes live on `UsersController`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([TelegramLink, TelegramLinkToken, TelegramMessage, TelegramUpdate]),
  ],
  controllers: [TelegramWebhookController],
  providers: [TelegramLinkService, TelegramService, TelegramUpdatesService],
  exports: [TelegramLinkService, TelegramService, TelegramUpdatesService],
})
export class TelegramModule {}
