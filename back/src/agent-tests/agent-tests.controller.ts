import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminTokenGuard } from './admin-token.guard.js';
import { AgentTestsService } from './agent-tests.service.js';
import {
  AgentTestSessionDetailDto,
  AgentTestSessionSummaryDto,
  CreateAgentTestSessionDto,
  CreatedAgentTestSessionDto,
} from './dto/agent-test-session.dto.js';

/** Admin-only browser test sessions with the voice agent (SPEC-06). Every route needs `X-Admin-Token`. */
@ApiTags('agent-tests')
@ApiHeader({ name: 'X-Admin-Token', required: true, description: 'The ADMIN_DEBUG_TOKEN secret' })
@ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid admin token' })
@UseGuards(AdminTokenGuard)
@Controller('agent-tests')
export class AgentTestsController {
  // Explicit @Inject: Vitest (esbuild) doesn't emit DI-reflection metadata.
  constructor(@Inject(AgentTestsService) private readonly agentTestsService: AgentTestsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Start a browser voice test session with the agent',
    description:
      'Uses the given (possibly unsaved) prompt without touching the saved agent settings. ' +
      'Returns the LiveKit `server_url` + `participant_token` to join the session room.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: CreatedAgentTestSessionDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid system prompt' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'A test session is already in progress' })
  @ApiResponse({ status: HttpStatus.BAD_GATEWAY, description: 'LiveKit room/dispatch/token failed' })
  async create(@Body() body: CreateAgentTestSessionDto): Promise<CreatedAgentTestSessionDto> {
    const { session, serverUrl, participantToken } = await this.agentTestsService.create(
      body.systemPrompt,
    );

    return {
      session: AgentTestSessionDetailDto.fromEntity(session),
      server_url: serverUrl,
      participant_token: participantToken,
    };
  }

  @Get()
  @ApiOperation({ summary: 'List test sessions, most-recent-first' })
  @ApiResponse({ status: HttpStatus.OK, type: [AgentTestSessionSummaryDto] })
  async findAll(): Promise<AgentTestSessionSummaryDto[]> {
    const sessions = await this.agentTestsService.list();

    return sessions.map((session) => AgentTestSessionSummaryDto.fromEntity(session));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one test session with its full prompt and transcript' })
  @ApiResponse({ status: HttpStatus.OK, type: AgentTestSessionDetailDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'No such test session' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<AgentTestSessionDetailDto> {
    const session = await this.agentTestsService.findOne(id);

    return AgentTestSessionDetailDto.fromEntity(session);
  }

  @Post(':id/end')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'End a test session from the admin side' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Ended (or already ended)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'No such test session' })
  async end(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.agentTestsService.findOne(id);
    await this.agentTestsService.markCompleted(id, 'admin_ended');
  }
}
