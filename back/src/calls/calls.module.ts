import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentSettingsModule } from '../agent-settings/agent-settings.module.js';
import { LiveKitModule } from '../livekit/livekit.module.js';
import { UsersModule } from '../users/users.module.js';
import { CallsController } from './calls.controller.js';
import { CallsService } from './calls.service.js';
import { Call } from './entities/call.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Call]), UsersModule, AgentSettingsModule, LiveKitModule],
  controllers: [CallsController],
  providers: [CallsService],
  exports: [CallsService],
})
export class CallsModule {}
