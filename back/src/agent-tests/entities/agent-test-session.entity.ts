import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type AgentTestStatus = 'in_progress' | 'completed' | 'failed';
export type AgentTestEndReason =
  | 'admin_ended'
  | 'admin_disconnected'
  | 'agent_completed'
  | 'admin_unresponsive'
  | 'max_duration_reached';
export type AgentTestPromptSource = 'saved' | 'draft';

export interface AgentTestTranscriptTurn {
  /** Agent-side turn counter used to dedupe retried appends. */
  seq: number;
  /** The admin speaking through the browser is recorded as `callee`, like a PSTN callee (SPEC-06 AC-25). */
  role: 'callee' | 'agent';
  text: string;
  /** ISO 8601 timestamp. */
  at: string;
}

/** Deterministic LiveKit room name for a test session — derived only from its id, no PII (SPEC-06 AC-9). */
export function testRoomName(id: string): string {
  return `agent-test-${id}`;
}

/**
 * One browser voice session with the agent (SPEC-06). Deliberately a separate table from
 * `Call` so test conversations never mix into real call history (AC-16).
 *
 * The partial unique index enforces AC-11 (at most one `in_progress` test session globally)
 * at the database layer — the same race-safe pattern as `Call`'s one-call-per-user lock.
 *
 * Column types are declared explicitly: the migration CLI runs through `tsx`, which does not
 * emit decorator metadata, so TypeORM cannot infer them from the TypeScript types.
 */
@Index('UQ_agent_test_session_in_progress', ['status'], {
  unique: true,
  where: `"status" = 'in_progress'`,
})
@Entity()
export class AgentTestSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 16 })
  status: AgentTestStatus;

  @Column({ type: 'varchar', length: 32, nullable: true })
  endReason: AgentTestEndReason | null;

  /** Set when `status` is `failed` — describes which step failed (AC-12, AC-19). */
  @Column({ type: 'text', nullable: true })
  failureReason: string | null;

  /** Immutable snapshot of the prompt the session runs with (AC-6). */
  @Column({ type: 'text' })
  systemPrompt: string;

  /** Whether the snapshot matched the saved agent-settings prompt at creation (AC-6). */
  @Column({ type: 'varchar', length: 8 })
  promptSource: AgentTestPromptSource;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  transcript: AgentTestTranscriptTurn[];

  /** The LiveKit room this session runs in — see `testRoomName`. Null until set right after insert. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  roomName: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  startedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  endedAt: Date | null;

  @Column({ type: 'int', nullable: true })
  durationSeconds: number | null;
}
