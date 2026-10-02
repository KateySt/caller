import { Module } from '@nestjs/common';
import { UsersModule } from '../../users/users.module.js';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller.js';

/**
 * Split out of `WhatsAppModule` on purpose: the webhook needs `UsersService`, while
 * `UsersModule` needs `WhatsAppService`. Keeping the controller in a third module that
 * depends on both directions' leaf removes the cycle without `forwardRef()`.
 */
@Module({
  imports: [UsersModule],
  controllers: [WhatsAppWebhookController],
})
export class WhatsAppWebhookModule {}
