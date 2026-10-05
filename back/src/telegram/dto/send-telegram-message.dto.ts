import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export const MAX_TELEGRAM_LENGTH = 4096;

export class SendTelegramMessageDto {
  @ApiProperty({ example: 'Hi! Following up on your appointment.', minLength: 1, maxLength: MAX_TELEGRAM_LENGTH })
  // Trimming first makes a whitespace-only text fail `@IsNotEmpty` (AC-26).
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_TELEGRAM_LENGTH)
  text: string;
}
