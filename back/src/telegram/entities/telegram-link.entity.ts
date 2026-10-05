import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * The Telegram chat a `User` opted in from (SPEC-04 AC-8). Keyed by `userId` as a plain
 * column rather than a relation, so `TelegramModule` stays independent of `UsersModule` —
 * same boundary as `SmsMessage`. One row per User; one User per chat (unique `chatId`).
 *
 * Column types are declared explicitly: the migration CLI runs through `tsx`, which does not
 * emit decorator metadata.
 */
@Entity()
export class TelegramLink {
  @PrimaryColumn({ type: 'uuid' })
  userId: string;

  /** Telegram chat id (= user id for private chats). Exceeds 2^31, so kept as a string. */
  @Column({ type: 'bigint', unique: true })
  chatId: string;

  @Column({ type: 'timestamptz' })
  linkedAt: Date;

  /** Set by `/stop`; only the client clears it (by `/start` or a fresh link). */
  @Column({ type: 'timestamptz', nullable: true })
  optedOutAt: Date | null;

  /** Set when Telegram reports the client blocked the bot. */
  @Column({ type: 'timestamptz', nullable: true })
  unreachableAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
