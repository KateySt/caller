import { CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** Update ids already handled, so a redelivered update is processed exactly once (AC-20). */
@Entity()
export class TelegramUpdate {
  @PrimaryColumn({ type: 'bigint' })
  updateId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  receivedAt: Date;
}
