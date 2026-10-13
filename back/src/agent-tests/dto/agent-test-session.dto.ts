import { ApiProperty, OmitType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { MAX_SYSTEM_PROMPT_LENGTH } from '../../agent-settings/dto/update-agent-settings.dto.js';
import type {
  AgentTestEndReason,
  AgentTestPromptSource,
  AgentTestSession,
  AgentTestStatus,
} from '../entities/agent-test-session.entity.js';

const PROMPT_PREVIEW_LENGTH = 120;
const STATUSES: AgentTestStatus[] = ['in_progress', 'completed', 'failed'];
const END_REASONS: AgentTestEndReason[] = [
  'admin_ended',
  'admin_disconnected',
  'agent_completed',
  'admin_unresponsive',
  'max_duration_reached',
];
const PROMPT_SOURCES: AgentTestPromptSource[] = ['saved', 'draft'];

/** Same validation as `UpdateAgentSettingsDto.systemPrompt` (SPEC-06 AC-7). */
export class CreateAgentTestSessionDto {
  @ApiProperty({
    example: 'You are a friendly outbound voice agent calling on behalf of Acme Inc.',
    minLength: 1,
    maxLength: MAX_SYSTEM_PROMPT_LENGTH,
  })
  // Trimming first makes a whitespace-only prompt fail `@IsNotEmpty`.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_SYSTEM_PROMPT_LENGTH)
  systemPrompt: string;
}

export class AgentTestTranscriptTurnDto {
  @ApiProperty({ enum: ['callee', 'agent'] })
  role: 'callee' | 'agent';

  @ApiProperty()
  text: string;

  @ApiProperty({ format: 'date-time' })
  at: string;
}

/** One row of the test-session history list — no transcript, prompt truncated (AC-13). */
export class AgentTestSessionSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: STATUSES })
  status: AgentTestStatus;

  @ApiProperty({ enum: END_REASONS, nullable: true })
  endReason: AgentTestEndReason | null;

  @ApiProperty({ nullable: true })
  failureReason: string | null;

  @ApiProperty({ enum: PROMPT_SOURCES })
  promptSource: AgentTestPromptSource;

  @ApiProperty({ description: `First ${PROMPT_PREVIEW_LENGTH} characters of the prompt snapshot` })
  promptPreview: string;

  @ApiProperty({ format: 'date-time' })
  startedAt: Date;

  @ApiProperty({ format: 'date-time', nullable: true })
  endedAt: Date | null;

  @ApiProperty({ nullable: true })
  durationSeconds: number | null;

  static fromEntity(session: AgentTestSession): AgentTestSessionSummaryDto {
    return {
      id: session.id,
      status: session.status,
      endReason: session.endReason,
      failureReason: session.failureReason,
      promptSource: session.promptSource,
      promptPreview: session.systemPrompt.slice(0, PROMPT_PREVIEW_LENGTH),
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      durationSeconds: session.durationSeconds,
    };
  }
}

/** One test session with its full prompt snapshot and transcript so far (AC-14). */
export class AgentTestSessionDetailDto extends OmitType(AgentTestSessionSummaryDto, [
  'promptPreview',
] as const) {
  @ApiProperty()
  systemPrompt: string;

  @ApiProperty({ type: [AgentTestTranscriptTurnDto] })
  transcript: AgentTestTranscriptTurnDto[];

  static fromEntity(session: AgentTestSession): AgentTestSessionDetailDto {
    return {
      id: session.id,
      status: session.status,
      endReason: session.endReason,
      failureReason: session.failureReason,
      promptSource: session.promptSource,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      durationSeconds: session.durationSeconds,
      systemPrompt: session.systemPrompt,
      transcript: session.transcript.map(({ role, text, at }) => ({ role, text, at })),
    };
  }
}

/** The created session plus the standard LiveKit token-endpoint fields (AC-6). */
export class CreatedAgentTestSessionDto {
  @ApiProperty({ type: AgentTestSessionDetailDto })
  session: AgentTestSessionDetailDto;

  @ApiProperty({ example: 'wss://example.livekit.cloud' })
  server_url: string;

  @ApiProperty({ description: 'Short-lived (10 min) LiveKit join token scoped to this session room' })
  participant_token: string;
}
