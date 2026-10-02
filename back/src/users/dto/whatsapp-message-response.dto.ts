import { ApiProperty } from '@nestjs/swagger';
import type { WhatsAppMessage } from '../../whatsapp/entities/whatsapp-message.entity.js';

/** One logged WhatsApp send attempt (SPEC-01 AC-32..AC-34). */
export class WhatsAppMessageResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: '+380501234567' })
  phoneNumber: string;

  @ApiProperty({ description: 'The free-form body, or the fallback template name used' })
  content: string;

  @ApiProperty({ enum: ['freeform', 'template'] })
  deliveryMode: 'freeform' | 'template';

  @ApiProperty({ enum: ['sent', 'failed'] })
  status: 'sent' | 'failed';

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  static fromEntity(message: WhatsAppMessage): WhatsAppMessageResponseDto {
    return {
      id: message.id,
      phoneNumber: message.phoneNumber,
      content: message.content,
      deliveryMode: message.deliveryMode,
      status: message.status,
      createdAt: message.createdAt,
    };
  }
}
