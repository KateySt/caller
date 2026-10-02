import { Module } from '@nestjs/common';
import { LiveKitWebhookController } from './livekit-webhook.controller.js';
import { LiveKitService } from './livekit.service.js';

@Module({
  controllers: [LiveKitWebhookController],
  providers: [LiveKitService],
  exports: [LiveKitService],
})
export class LiveKitModule {}
