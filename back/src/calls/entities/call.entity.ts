import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type CallStatus = 'in_progress' | 'completed' | 'failed';
export type CallEndReason =
  | 'agent_completed'
  | 'callee_hangup'
  | 'callee_unresponsive'
  | 'max_duration_reached';

export interface CallTranscriptTurn {
  role: 'callee' | 'agent';
  text: string;
  /** ISO 8601 timestamp. */
  at: string;
  /** Agent-side turn counter used to dedupe retried appends; absent on turns written before it existed. */
  seq?: number;
}

/** Deterministic LiveKit room name for a call — shared by the dial, the agent dispatch, and the webhook/worker lookup. */
export function callRoomName(callId: string): string {
  return `pstn-call-${callId}`;
}

/**
 * One outbound PSTN call attempt (SPEC-02 AC-6..AC-21). `userId` is a plain column, not a
 * relation, matching the boundary already drawn for `WhatsAppMessage`/`SmsMessage`.
 *
 * The partial unique index enforces AC-8 (no second simultaneous call to the same User) at
 * the database layer — the same race-safe pattern `User.phoneNumber`'s unique index uses,
 * rather than a check-then-insert that a concurrent request could slip through.
 *
 * Column types are declared explicitly: the migration CLI runs through `tsx`, which does not
 * emit decorator metadata, so TypeORM cannot infer them from the TypeScript types.
 */
@Index('UQ_call_user_in_progress', ['userId'], { unique: true, where: `"status" = 'in_progress'` })
@Entity()
export class Call {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  /** Snapshot of the number actually dialed, independent of later edits to the User. */
  @Column({ type: 'varchar', length: 20 })
  phoneNumber: string;

  @Column({ type: 'varchar', length: 16 })
  status: CallStatus;

  @Column({ type: 'varchar', length: 32, nullable: true })
  endReason: CallEndReason | null;

  /** Set when `status` is `failed` — describes which step failed (AC-19, AC-20). */
  @Column({ type: 'text', nullable: true })
  failureReason: string | null;

  /** Snapshot of the global system prompt active when this call started (AC-5). */
  @Column({ type: 'text' })
  systemPrompt: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  transcript: CallTranscriptTurn[];

  /** The LiveKit room this call runs in — see `callRoomName`. Null for an instant never set up. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  roomName: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  startedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  endedAt: Date | null;

  @Column({ type: 'int', nullable: true })
  durationSeconds: number | null;
}
