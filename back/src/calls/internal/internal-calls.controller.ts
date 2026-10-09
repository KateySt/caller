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
import { CallsService } from '../calls.service.js';
import { AgentTokenGuard } from './agent-token.guard.js';
import { AgentCallContextDto, AppendTranscriptTurnDto, EndCallDto } from './internal-calls.dto.js';

/**
 * Service-to-service API for the voice agent (`agent/`, deployed on LiveKit Cloud). The agent
 * has no database access of its own — every read/write about a call goes through here.
 */
@ApiExcludeController()
@UseGuards(AgentTokenGuard)
@Controller('internal/calls/:callId')
export class InternalCallsController {
  constructor(@Inject(CallsService) private readonly callsService: CallsService) {}

  @Get()
  async getContext(@Param('callId', ParseUUIDPipe) callId: string): Promise<AgentCallContextDto> {
    const call = await this.callsService.findOne(callId);
    if (!call) {
      throw new NotFoundException('Call not found');
    }

    return { id: call.id, status: call.status, systemPrompt: call.systemPrompt };
  }

  @Post('transcript')
  @HttpCode(HttpStatus.NO_CONTENT)
  async appendTurn(
    @Param('callId', ParseUUIDPipe) callId: string,
    @Body() turn: AppendTranscriptTurnDto,
  ): Promise<void> {
    await this.callsService.appendTranscriptTurn(callId, turn);
  }

  @Post('end')
  @HttpCode(HttpStatus.NO_CONTENT)
  async end(
    @Param('callId', ParseUUIDPipe) callId: string,
    @Body() body: EndCallDto,
  ): Promise<void> {
    if (body.status === 'completed') {
      await this.callsService.markCompleted(callId, body.endReason!);
    } else {
      await this.callsService.markFailed(callId, body.failureReason!);
    }
  }
}
