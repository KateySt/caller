import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A logged WhatsApp send attempt (SPEC-01 AC-32..AC-34). Deliberately holds `userId` as a
 * plain column rather than a TypeORM relation to `User` — `WhatsAppModule` stays independent
 * of `UsersModule`, matching the boundary `WhatsAppRecipient` already draws.
 *
 * Column types are declared explicitly: the migration CLI runs through `tsx`, which does not
 * emit decorator metadata, so TypeORM cannot infer them from the TypeScript types.
 */
@Entity()
export class WhatsAppMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  /** Snapshot of the number actually sent to, independent of later edits to the User. */
  @Column({ type: 'varchar', length: 20 })
  phoneNumber: string;

  /** The free-form body, or the fallback template name when `deliveryMode` is `template`. */
  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'varchar', length: 16 })
  deliveryMode: 'freeform' | 'template';

  @Column({ type: 'varchar', length: 16 })
  status: 'sent' | 'failed';

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
