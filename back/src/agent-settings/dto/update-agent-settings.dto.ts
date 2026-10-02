import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export const MAX_SYSTEM_PROMPT_LENGTH = 8000;

export class UpdateAgentSettingsDto {
  @ApiProperty({
    example:
      "You are a friendly outbound voice agent calling on behalf of Acme Inc. Greet the " +
      'contact, briefly introduce what is new, and offer to help.',
    minLength: 1,
    maxLength: MAX_SYSTEM_PROMPT_LENGTH,
  })
  // Trimming first makes a whitespace-only prompt fail `@IsNotEmpty` (AC-4).
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_SYSTEM_PROMPT_LENGTH)
  systemPrompt: string;
}
