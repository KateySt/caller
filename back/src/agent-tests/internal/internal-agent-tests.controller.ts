import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { AgentTokenGuard } from '../../calls/internal/agent-token.guard.js';
import { AppendTranscriptTurnDto } from '../../calls/internal/internal-calls.dto.js';
import { AgentTestsService } from '../agent-tests.service.js';
import { AgentTestContextDto, EndAgentTestDto } from './internal-agent-tests.dto.js';

/**
 * Service-to-service API for the voice agent during a browser test session (SPEC-06 AC-21..23).
 * Guarded by the agent's bearer token (`AGENT_INTERNAL_TOKEN`), not the admin secret.
 */
@ApiExcludeController()
@UseGuards(AgentTokenGuard)
@Controller('internal/agent-tests/:testSessionId')
export class InternalAgentTestsController {
  constructor(@Inject(AgentTestsService) private readonly agentTestsService: AgentTestsService) {}

  @Get()
  async getContext(
    @Param('testSessionId', ParseUUIDPipe) testSessionId: string,
  ): Promise<AgentTestContextDto> {
    const session = await this.agentTestsService.findForAgent(testSessionId);
    if (!session) {
      throw new NotFoundException('Test session not found');
    }

    return { id: session.id, status: session.status, systemPrompt: session.systemPrompt };
  }

  @Post('transcript')
  @HttpCode(HttpStatus.NO_CONTENT)
  async appendTurn(
    @Param('testSessionId', ParseUUIDPipe) testSessionId: string,
    @Body() turn: AppendTranscriptTurnDto,
  ): Promise<void> {
    await this.agentTestsService.appendTranscriptTurn(testSessionId, turn);
  }

  @Post('end')
  @HttpCode(HttpStatus.NO_CONTENT)
  async end(
    @Param('testSessionId', ParseUUIDPipe) testSessionId: string,
    @Body() body: EndAgentTestDto,
  ): Promise<void> {
    if (body.status === 'completed') {
      await this.agentTestsService.markCompleted(testSessionId, body.endReason!);
    } else {
      await this.agentTestsService.markFailed(testSessionId, body.failureReason!);
    }
  }
}
