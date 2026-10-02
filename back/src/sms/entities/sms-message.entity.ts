import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A logged SMS send attempt (SPEC-03 AC-1). Holds `userId` as a plain column rather than a
 * TypeORM relation to `User`, so `SmsModule` stays independent of `UsersModule` — same
 * boundary as `WhatsAppMessage`.
 *
 * Column types are declared explicitly: the migration CLI runs through `tsx`, which does not
 * emit decorator metadata, so TypeORM cannot infer them from the TypeScript types.
 */
@Entity()
export class SmsMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  /** Snapshot of the number actually sent to, independent of later edits to the User. */
  @Column({ type: 'varchar', length: 20 })
  phoneNumber: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'varchar', length: 16 })
  status: 'sent' | 'failed';

  /** Set when `status` is `failed` — provider error detail, logged server-side only. */
  @Column({ type: 'text', nullable: true })
  failureReason: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
