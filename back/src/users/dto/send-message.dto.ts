import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export const MAX_MESSAGE_LENGTH = 4096;

export class SendMessageDto {
  @ApiProperty({
    example: 'Hi! Your appointment is confirmed for tomorrow at 10:00.',
    minLength: 1,
    maxLength: MAX_MESSAGE_LENGTH,
  })
  // Trimming first makes a whitespace-only body fail `@IsNotEmpty` (AC-12 / edge case).
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_MESSAGE_LENGTH)
  body: string;
}
