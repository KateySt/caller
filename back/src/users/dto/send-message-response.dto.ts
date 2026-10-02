import { ApiProperty } from '@nestjs/swagger';
import type { DeliveryMode } from '../../whatsapp/whatsapp.service.js';

export class SendMessageResponseDto {
  @ApiProperty({
    enum: ['freeform', 'template'],
    description:
      '`freeform` — the typed text was delivered as-is. `template` — the contact is outside ' +
      'the 24h WhatsApp session window, so the configured fallback template was sent instead.',
  })
  deliveryMode: DeliveryMode;
}
