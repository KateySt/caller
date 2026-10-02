import { ApiProperty } from '@nestjs/swagger';
import type { SmsMessage } from '../entities/sms-message.entity.js';

/** One logged SMS send attempt (SPEC-03 AC-1, AC-6). */
export class SmsMessageResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: '+380501234567' })
  phoneNumber: string;

  @ApiProperty()
  body: string;

  @ApiProperty({ enum: ['sent', 'failed'] })
  status: 'sent' | 'failed';

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  static fromEntity(message: SmsMessage): SmsMessageResponseDto {
    return {
      id: message.id,
      phoneNumber: message.phoneNumber,
      body: message.body,
      status: message.status,
      createdAt: message.createdAt,
    };
  }
}
