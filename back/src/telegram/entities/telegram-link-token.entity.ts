import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** A single-use invitation (SPEC-04 AC-1..4). Only the SHA-256 of the token is stored (AC-3). */
@Entity()
export class TelegramLinkToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'char', length: 64, unique: true })
  tokenHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  /** Set when a newer invitation for the same User replaces this one (AC-4). */
  @Column({ type: 'timestamptz', nullable: true })
  invalidatedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
