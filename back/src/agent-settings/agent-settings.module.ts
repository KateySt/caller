import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentSettingsController } from './agent-settings.controller.js';
import { AgentSettingsService } from './agent-settings.service.js';
import { AgentSettings } from './entities/agent-settings.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([AgentSettings])],
  controllers: [AgentSettingsController],
  providers: [AgentSettingsService],
  exports: [AgentSettingsService],
})
export class AgentSettingsModule {}
