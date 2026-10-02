import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export const MAX_SMS_LENGTH = 1600;

export class SendSmsDto {
  @ApiProperty({
    example: 'Hi! Your appointment is confirmed for tomorrow at 10:00.',
    minLength: 1,
    maxLength: MAX_SMS_LENGTH,
  })
  // Trimming first makes a whitespace-only body fail `@IsNotEmpty` (AC-3 / edge case).
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_SMS_LENGTH)
  body: string;
}
