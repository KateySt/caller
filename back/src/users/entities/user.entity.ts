import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * A contact reachable over WhatsApp. `phoneNumber` is the one field the voice-calling
 * feature also builds on, so it stays stable and canonical (E.164).
 *
 * Column types are declared explicitly: the migration CLI runs through `tsx`, which does
 * not emit decorator metadata, so TypeORM cannot infer them from the TypeScript types.
 */
@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  /** E.164, e.g. `+380501234567`. Unique — one contact per number. */
  @Column({ type: 'varchar', length: 20, unique: true })
  phoneNumber: string;

  /** Drives the WhatsApp 24h free-form session window; null until they message first. */
  @Column({ type: 'timestamptz', nullable: true })
  lastInboundMessageAt: Date | null;

  /** Latest delivery status reported by Meta's status webhook (`sent`, `delivered`, …). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  lastWhatsAppMessageStatus: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
