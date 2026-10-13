import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentSettingsModule } from '../agent-settings/agent-settings.module.js';
import { LiveKitModule } from '../livekit/livekit.module.js';
import { AgentTestsController } from './agent-tests.controller.js';
import { AgentTestsService } from './agent-tests.service.js';
import { AgentTestSession } from './entities/agent-test-session.entity.js';
import { InternalAgentTestsController } from './internal/internal-agent-tests.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([AgentTestSession]), AgentSettingsModule, LiveKitModule],
  controllers: [AgentTestsController, InternalAgentTestsController],
  providers: [AgentTestsService],
})
export class AgentTestsModule {}
