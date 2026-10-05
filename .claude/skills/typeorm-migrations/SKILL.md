---
name: typeorm-migrations
description: Current (Oct 2026, TypeORM 1.x + PostgreSQL) best practices for schema migrations in `back/` — generate vs create, reviewing generated SQL, safe up/down, transactions, zero-downtime Postgres patterns (NOT NULL backfill, CONCURRENTLY indexes, renames, drops), data migrations, CI drift check, and deploy as a separate step. Use whenever adding/changing an `*.entity.ts`, writing or reviewing anything under `src/database/migrations/`, touching `data-source.ts`, or running `migration:*` scripts.
license: MIT
metadata:
  author: self
  version: "1.0.0"
---

# TypeORM Migrations (TypeORM 1.x, PostgreSQL)

Grounded in the TypeORM 1.0 docs and the CLI's own `--help` output. Project conventions in
`back/AGENTS.md` win over anything generic here.

## When to Apply

- You changed an entity (column, index, relation, enum, constraint) → a migration is required.
- Writing, editing, or reviewing a file in `src/database/migrations/`.
- Editing `src/database/data-source.ts` or the `migration:*` npm scripts.
- Planning a deploy that changes the schema.

## Repo facts (verify before relying on them)

- `typeorm` ^1.x, ESM, CLI run via `tsx` (`npm run typeorm` = `tsx ./node_modules/typeorm/cli.js -d ./src/database/data-source.ts`), so `.ts` migrations run directly — no compile step, and `-d` is already injected.
- `synchronize: false` everywhere. Schema changes happen **only** through migrations.
- Entities: `src/**/*.entity.ts`; migrations: `src/database/migrations/*.ts`.
- IDs use `uuid_generate_v4()` (the `uuid-ossp` extension; TypeORM's Postgres driver installs it on connect).

## Quick Reference

| # | Rule | Priority |
|---|------|----------|
| 1 | Never `synchronize`; one migration per logical change | HIGH |
| 2 | Generate, then **read and edit** the SQL | HIGH |
| 3 | Never edit a migration that has been applied/merged | HIGH |
| 4 | Write a real `down()` (or throw explicitly if irreversible) | HIGH |
| 5 | Backward-compatible (expand → migrate → contract) changes | HIGH |
| 6 | Run migrations as their own deploy step, never on boot | HIGH |
| 7 | Transactions: know `all` / `each` / `none` | MEDIUM |
| 8 | Data migrations via `migration:create`, in SQL | MEDIUM |
| 9 | CI drift check with `--check` | MEDIUM |
| 10 | Naming, hygiene, testing | LOW-MEDIUM |

---

### 1. Workflow (HIGH)

1. Change the entity.
2. `npm run migration:generate -- src/database/migrations/<PascalCaseName>` (diffs entities against the **live DB**, so the local DB must be at the latest migration first: `npm run migration:run`).
3. Open the generated file and review it (rule 2).
4. `npm run migration:run`, then `npm run migration:generate -- src/database/migrations/Check --dryrun` — it should find nothing to generate. Exit code `1` with "no changes" is the success case here.
5. `npm run migration:revert` then `migration:run` again to prove `down()` works.
6. Commit the entity change and the migration **together**.

Generate after **each** model change (TypeORM's own rule of thumb) — small migrations are easier to review and revert. Don't batch a week of entity edits into one file.

Useful commands (all take the already-injected `-d`):

| Command | Use |
|---|---|
| `migration:generate <path> [--dryrun] [--pretty]` | Diff entities vs DB. `--dryrun` prints instead of writing; `--pretty` multi-line SQL (easier review). |
| `migration:generate <path> --check` | Exit `1` if entities and DB differ → CI drift guard. |
| `migration:create <path>` | Empty scaffold: data migrations, extensions, anything not derivable from entities. |
| `migration:run [--transaction all\|each\|none]` | Apply pending, ordered by timestamp. |
| `migration:revert` | Reverts **one** (the latest) migration; repeat for more. |
| `migration:show` | `[X]` applied / `[ ]` pending. Run before and after a deploy. |
| `migration:run --fake` | Mark as applied without executing — only after the schema was changed out-of-band; never as a shortcut. |

### 2. Review the generated SQL (HIGH)

The generator is a diff engine, not a reviewer. Check for:

- **Renames become DROP + ADD** — data loss. Rewrite as `ALTER TABLE "t" RENAME COLUMN "old" TO "new"` (and `down()` the reverse). Same for table renames.
- **Type changes** that need a cast: `ALTER COLUMN ... TYPE x USING "col"::x`.
- **`NOT NULL` without a default** on a table that already has rows → fails in prod. See rule 5.
- **Unrelated drift** (indexes/constraints you didn't touch) → someone edited the DB by hand or an entity is out of sync. Resolve the cause; don't commit noise.
- Constraint/index names (`PK_…`, `IDX_…`, `UQ_…`, `FK_…`) are hash-derived by TypeORM's naming strategy. Keep them as generated so the next diff stays empty; don't hand-rename.
- Delete the `name = '...'` field only if the other migrations don't have it — stay consistent with neighbours.

### 3. Immutability (HIGH)

- A migration that ran anywhere shared (main, staging, prod) is **history**. Fix mistakes with a **new** migration, never by editing the old one — TypeORM tracks by name/timestamp, so edits silently diverge environments.
- Unmerged, never-applied-elsewhere migration on your branch: fine to delete and regenerate (`migration:revert` locally first).
- Don't import entities or services into migrations — they change over time and the migration would change meaning. Use raw SQL or `queryRunner` APIs only; a migration must be frozen in time.

### 4. `up()` / `down()` (HIGH)

- `down()` must undo `up()` exactly and in **reverse order**.
- If something genuinely can't be reversed (dropped column data, lossy cast), say so: `throw new Error('Irreversible: <why>')` — better than an empty `down()` that lies.
- Prefer `queryRunner.query(\`...\`)` with plain SQL (matches the existing files, reads like what runs on the DB) or the schema API (`createTable`, `addColumn`, `createIndex`…) when portability matters. Don't mix styles in one file.
- Use quoted identifiers (`"userId"`) — the project's columns are camelCase.
- Always `await` every query; a forgotten `await` leaves later statements racing.
- Never interpolate untrusted values into SQL; use parameters: `queryRunner.query('UPDATE "t" SET "x" = $1', [v])`.

### 5. Production-safe Postgres changes — expand / migrate / contract (HIGH)

Deploys overlap: the old app version runs against the new schema (and vice-versa on rollback). Every migration must work with **both** code versions.

| Change | Safe pattern |
|---|---|
| Add `NOT NULL` column | (1) add nullable (or with constant `DEFAULT`) → (2) backfill (batched for big tables) → (3) `SET NOT NULL` in a later migration once code always writes it. |
| Rename column/table | Add new + dual-write + backfill + switch reads + drop old across **separate deploys**. A bare `RENAME` breaks the old app version. |
| Drop column/table | Stop using it in code first, deploy, **then** drop in a later migration. |
| Add index on a big/hot table | `CREATE INDEX CONCURRENTLY` — needs the migration to run **outside a transaction** (see rule 7), one statement per migration. |
| Add FK / CHECK on populated table | `ADD CONSTRAINT … NOT VALID` then `VALIDATE CONSTRAINT` separately (avoids long locks). |
| Change enum / varchar+check values | Additive first; remove old values only after no rows/code use them. |
| Add unique constraint | Check duplicates first; a failing `up()` in prod is an outage of the deploy. |

Also: keep lock time short — set a `lock_timeout` for DDL on busy tables (`SET LOCAL lock_timeout = '5s'` inside the migration) so a blocked `ALTER` fails fast instead of queueing every request behind it. This repo is small today; apply the heavy patterns once tables are large, but the **ordering rules (never drop/rename in the same deploy that stops using it)** apply from day one.

### 6. Running migrations (HIGH)

- Run `npm run migration:run` as an explicit step **before** starting the new app version (CI/CD job or release command). Never `migrationsRun: true` and never from `main.ts`/module init — multiple instances (API + `agent:dev` worker reusing `AppModule`) would race, and a failing migration would crash-loop the app.
- Only one runner at a time; TypeORM does not take an advisory lock for you. Make the deploy job single-instance.
- Back up (or confirm PITR/snapshot) before destructive migrations in prod.
- Roll forward by default; `migration:revert` is for dev and for emergencies when `down()` was tested.
- CLI creds come from `back/.env` via `dotenv` in `data-source.ts` — TypeORM 1.0 **no longer auto-loads `.env`** and the `TYPEORM_*` env vars are gone. Don't rely on either; keep the explicit `import 'dotenv/config'`.

### 7. Transactions (MEDIUM)

`migrationsTransactionMode` (CLI: `--transaction`):

- `all` (default) — every pending migration in **one** transaction; any failure rolls back the whole run. Postgres DDL is transactional, so this is the safest default. Keep it.
- `each` — one transaction per migration; earlier migrations stay applied if a later one fails.
- `none` — no transaction; required for `CREATE INDEX CONCURRENTLY`, `ALTER TYPE … ADD VALUE` (on older PG), `VACUUM`.

Because `all` is a single transaction, a non-transactional statement can't live next to ordinary migrations. Put it in its own migration and run that one with `--transaction none` (or set `each`/`none` deliberately for the deploy and document it in the migration's header comment). Never silently flip the global mode in `data-source.ts`.

### 8. Data migrations (MEDIUM)

- Scaffold with `migration:create`; name it for what it does (`BackfillCallDurationSeconds`).
- Use set-based SQL (`UPDATE … FROM …`), not row-by-row loops; batch large updates (`WHERE id IN (SELECT id … LIMIT 5000)` loop) to avoid long locks and WAL spikes.
- Keep schema changes and large data backfills in **separate** migrations.
- Make it idempotent where cheap (`WHERE "col" IS NULL`, `ON CONFLICT DO NOTHING`) so a retry is harmless.
- Don't use the app's repositories/entities (see rule 3).

### 9. CI and drift (MEDIUM)

- CI job: start Postgres → `migration:run` → `migration:generate src/database/migrations/Drift --check`. A non-zero exit means someone changed an entity without a migration.
- Also run `migration:run` → `migration:revert` → `migration:run` on an empty DB for the newest migration.
- Tests/e2e must build their schema with `migration:run`, not `synchronize: true`, so the tests exercise the real migrations.

### 10. Naming, layout, hygiene (LOW-MEDIUM)

- File name: `<timestamp>-<PascalCaseIntent>.ts`, class `<PascalCaseIntent><timestamp>` (what the CLI emits). Names state the change (`AddCallEndReason`), not the date or ticket (`Update1`, `Fix`).
- One concern per migration. Don't mix new tables with unrelated backfills.
- Timestamps order execution: don't hand-set a timestamp older than an already-applied migration (use `-t` only to resolve merge-order issues, and only for unmerged work). After rebasing/merging two branches that both added migrations, re-check order and re-run on a fresh DB.
- Don't commit secrets or environment-specific values (hosts, IDs) in migrations.
- Format: `--pretty` for generated SQL you intend to keep reviewing; keep generated files otherwise untouched apart from the fixes in rule 2.

### TypeORM 1.0 gotchas

- `migration:run`/`revert` historically only loaded `.js`; here `tsx` handles `.ts` — don't swap the runner for plain `node`/`typeorm` without a compile step.
- Globs use `tinyglobby` (not `glob`): keep the plain `src/database/migrations/*.ts` style; don't rely on exotic `glob` syntax.
- `MigrationExecutor.getAllMigrations()` is removed — use `getPendingMigrations()` / `getExecutedMigrations()` or `dataSource.migrations`.
- `QueryRunner.loadedTables`/`loadedViews` are gone — use `await queryRunner.getTables()` / `getViews()`.
- `Connection`/`createConnection` are gone — use `DataSource` (`initialize()` / `destroy()`).
- `nullable: false` relations now load with `INNER JOIN` — if a migration backfill adds NOT NULL FKs, rows with NULLs disappear from queries until fixed.

## Review Checklist

- [ ] Entity change and migration in the same commit
- [ ] Generated SQL read; no accidental DROP+ADD for a rename; no unrelated drift
- [ ] `down()` real and tested (or explicitly throws as irreversible)
- [ ] Works with both the old and new app version (expand/contract)
- [ ] NOT NULL / FK / unique / index additions safe for populated tables
- [ ] Non-transactional statements isolated in their own migration
- [ ] No entity/service imports inside the migration
- [ ] Not run on app boot; deploy step order documented
- [ ] `--check` returns clean after `migration:run`

## References

- TypeORM migrations docs: https://typeorm.io/docs/migrations/why
- Generating / executing: https://typeorm.io/docs/migrations/generating, https://typeorm.io/docs/migrations/executing
- Upgrading 0.3 → 1.0: https://typeorm.io/docs/releases/1.0/upgrading-from-0.3/
- 1.0 release notes: https://typeorm.io/docs/releases/1.0/release-notes/
