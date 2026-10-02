import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * The single global row governing every PSTN call's system prompt (SPEC-02 AC-1..AC-5).
 * Always read/written at the fixed id `SETTINGS_ROW_ID` — there is exactly one row, ever.
 *
 * Column types are declared explicitly: the migration CLI runs through `tsx`, which does not
 * emit decorator metadata, so TypeORM cannot infer them from the TypeScript types.
 */
@Entity()
export class AgentSettings {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id: string;

  @Column({ type: 'text' })
  systemPrompt: string;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
