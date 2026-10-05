import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type TelegramDirection = 'inbound' | 'outbound';
export type TelegramMessageStatus = 'received' | 'sent' | 'failed';

/** One logged message in a User's bot conversation (SPEC-04 AC-16..AC-19). */
@Entity()
@Index(['userId', 'occurredAt', 'createdAt'])
export class TelegramMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 16 })
  direction: TelegramDirection;

  /** `text`, or a placeholder kind for inbound non-text content (`photo`, `voice`, …; AC-17). */
  @Column({ type: 'varchar', length: 32 })
  contentType: string;

  /** Null for non-text placeholders. Always plain text, never interpreted as markup. */
  @Column({ type: 'text', nullable: true })
  text: string | null;

  @Column({ type: 'varchar', length: 16 })
  status: TelegramMessageStatus;

  /** Short, client-safe reason; the full error detail stays in the server log (AC-30). */
  @Column({ type: 'varchar', length: 255, nullable: true })
  failureReason: string | null;

  @Column({ type: 'bigint', nullable: true })
  telegramMessageId: string | null;

  /** Telegram's timestamp for inbound messages, send time for outbound. */
  @Column({ type: 'timestamptz' })
  occurredAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
