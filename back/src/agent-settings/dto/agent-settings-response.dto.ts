import { ApiProperty } from '@nestjs/swagger';
import type { AgentSettings } from '../entities/agent-settings.entity.js';

export class AgentSettingsResponseDto {
  @ApiProperty()
  systemPrompt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;

  static fromEntity(settings: AgentSettings): AgentSettingsResponseDto {
    return {
      systemPrompt: settings.systemPrompt,
      updatedAt: settings.updatedAt,
    };
  }
}
