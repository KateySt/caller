import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsAppMessage } from './entities/whatsapp-message.entity.js';
import { WhatsAppService } from './whatsapp.service.js';

/**
 * Deliberately depends on nothing besides its own entity: the webhook controller, which
 * does need `UsersService`, lives in its own module (`webhook/whatsapp-webhook.module.ts`)
 * so the two never form a cycle.
 */
@Module({
  imports: [TypeOrmModule.forFeature([WhatsAppMessage])],
  providers: [WhatsAppService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
