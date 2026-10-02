import { Body, Controller, Get, Inject, Put } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AgentSettingsService } from './agent-settings.service.js';
import { AgentSettingsResponseDto } from './dto/agent-settings-response.dto.js';
import { UpdateAgentSettingsDto } from './dto/update-agent-settings.dto.js';

@ApiTags('agent-settings')
@Controller('agent-settings')
export class AgentSettingsController {
  // Explicit @Inject: see AppController's constructor comment — this whole module tree
  // also runs under `tsx` (agent-worker), which doesn't emit DI-reflection metadata.
  constructor(
    @Inject(AgentSettingsService) private readonly agentSettingsService: AgentSettingsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get the global calling-agent system prompt' })
  @ApiResponse({ status: 200, type: AgentSettingsResponseDto })
  async get(): Promise<AgentSettingsResponseDto> {
    const settings = await this.agentSettingsService.get();

    return AgentSettingsResponseDto.fromEntity(settings);
  }

  @Put()
  @ApiOperation({
    summary: 'Replace the global calling-agent system prompt',
    description: 'Applies to every call placed from this point on; calls already in progress keep using whichever prompt was active when they started.',
  })
  @ApiResponse({ status: 200, type: AgentSettingsResponseDto })
  @ApiResponse({ status: 400, description: 'Missing, empty, or too-long systemPrompt' })
  async update(@Body() dto: UpdateAgentSettingsDto): Promise<AgentSettingsResponseDto> {
    const settings = await this.agentSettingsService.update(dto);

    return AgentSettingsResponseDto.fromEntity(settings);
  }
}
