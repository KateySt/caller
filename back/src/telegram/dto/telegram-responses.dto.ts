import { ApiProperty } from '@nestjs/swagger';
import type { TelegramMessage } from '../entities/telegram-message.entity.js';
import type {
  TelegramInvite,
  TelegramStatus,
  TelegramStatusInfo,
} from '../telegram-link.service.js';
import type { TelegramMessagePage } from '../telegram.service.js';

const STATUSES: TelegramStatus[] = ['not_linked', 'linked', 'opted_out', 'unreachable'];

export class TelegramStatusResponseDto {
  @ApiProperty({ enum: STATUSES })
  status: TelegramStatus;

  @ApiProperty({ format: 'date-time', nullable: true })
  linkedAt: Date | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  optedOutAt: Date | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  unreachableAt: Date | null;

  @ApiProperty({ description: 'An unused, unexpired invitation exists for this contact' })
  hasPendingInvite: boolean;

  static fromInfo(info: TelegramStatusInfo): TelegramStatusResponseDto {
    return { ...info };
  }
}

export class TelegramInviteResponseDto {
  @ApiProperty({ example: 'https://t.me/my_bot?start=abc123', description: 'Shown once; not retrievable later' })
  link: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt: Date;

  @ApiProperty({ type: TelegramStatusResponseDto })
  status: TelegramStatusResponseDto;

  static fromInvite(invite: TelegramInvite): TelegramInviteResponseDto {
    return {
      link: invite.link,
      expiresAt: invite.expiresAt,
      status: TelegramStatusResponseDto.fromInfo(invite.status),
    };
  }
}

export class TelegramMessageResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: ['inbound', 'outbound'] })
  direction: 'inbound' | 'outbound';

  @ApiProperty({ example: 'text', description: '`text`, or a placeholder kind such as `photo`' })
  contentType: string;

  @ApiProperty({ nullable: true, type: String })
  text: string | null;

  @ApiProperty({ enum: ['received', 'sent', 'failed'] })
  status: 'received' | 'sent' | 'failed';

  @ApiProperty({ nullable: true, type: String })
  failureReason: string | null;

  @ApiProperty({ format: 'date-time' })
  occurredAt: Date;

  static fromEntity(message: TelegramMessage): TelegramMessageResponseDto {
    return {
      id: message.id,
      direction: message.direction,
      contentType: message.contentType,
      text: message.text,
      status: message.status,
      failureReason: message.failureReason,
      occurredAt: message.occurredAt,
    };
  }
}

export class TelegramMessagesPageResponseDto {
  @ApiProperty({ type: [TelegramMessageResponseDto], description: 'Oldest first' })
  messages: TelegramMessageResponseDto[];

  @ApiProperty({ description: 'Older entries exist; pass the first id as `before`' })
  hasMore: boolean;

  static fromPage(page: TelegramMessagePage): TelegramMessagesPageResponseDto {
    return {
      messages: page.messages.map((message) => TelegramMessageResponseDto.fromEntity(message)),
      hasMore: page.hasMore,
    };
  }
}
