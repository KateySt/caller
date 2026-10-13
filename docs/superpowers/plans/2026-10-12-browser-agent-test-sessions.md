# Browser Agent Test Sessions (admin debug mode) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin, holding a shared secret, talks by voice from the browser to the same LiveKit voice agent used for PSTN calls, using the prompt currently in the settings form; every test conversation is persisted and reviewable.

**Architecture:** `back/` gets a new `agent-tests` module (entity + admin-guarded public API + agent-guarded internal API) that creates a room, explicitly dispatches the existing agent with `{ testSessionId }` metadata, and mints a mic-only participant token. `agent/` branches on job metadata (call vs test) and runs the same STT→LLM→TTS loop with a test profile (nova-3, 60 s silence). `front/` adds an admin-secret gate, an inline LiveKit Agents UI panel on the settings page, and an `/agent-tests` history route.

**Tech Stack:** NestJS 12 + TypeORM + Postgres, `livekit-server-sdk@2.19.1`, `@livekit/agents@1.9`, Next.js 16 + TanStack Query v5 + RHF/zod, `livekit-client@2.22`, `@livekit/components-react@2.9`, LiveKit Agents UI (shadcn registry `@agents-ui`).

**Spec:** `back/specs/SPEC-06-browser-agent-test-sessions.md` (back + agent) and `front/specs/SPEC-05-browser-agent-test-console.md` (UI). AC references below are `B-AC-n` (back) and `F-AC-n` (front).

## Global Constraints

- Admin secret env var: `ADMIN_DEBUG_TOKEN`, required, `@MinLength(32)`; sent by the browser in header `X-Admin-Token`; compared with `constantTimeEquals` (`back/src/common/crypto.util.ts`). Never logged, never returned, never `NEXT_PUBLIC_*`, never in a URL (B-AC-1/3/5, F-AC-2).
- No rate limit on session creation (B-AC-4 removed, F-AC-6 removed).
- At most one `in_progress` test session globally → 409 (B-AC-11).
- Max duration reuses `CALL_MAX_DURATION_SECONDS` (default 600) (B-AC-18).
- Test silence timeout: agent env `TEST_SILENCE_TIMEOUT_SECONDS`, default `60`; PSTN keeps `CALLEE_SILENCE_TIMEOUT_SECONDS` (B-AC-28).
- Test STT model: agent env `DEEPGRAM_TEST_MODEL`, default `nova-3`; PSTN keeps `DEEPGRAM_MODEL` (B-AC-25/26).
- Prompt validation identical to `UpdateAgentSettingsDto`: trimmed, non-empty, max `MAX_SYSTEM_PROMPT_LENGTH` = 8000 (B-AC-7, F-AC-9).
- Participant token: TTL `'10m'`, identity `admin-test-<uuid>` (not from request), room = that session's room only, `canPublishSources: [TrackSource.MICROPHONE]`, `canSubscribe: true`, `canPublishData: false`, no `roomAdmin/roomCreate/roomList/roomRecord` (B-AC-10).
- Room name `agent-test-<sessionId>`, `maxParticipants: 2` (B-AC-9).
- End reasons: `admin_ended | admin_disconnected | agent_completed | admin_unresponsive | max_duration_reached`; first outcome wins (B-AC-17/20).
- Admin transcript turns use role `callee` (B-AC-25); the UI labels them "You".
- History route `/agent-tests` linked from the settings page and site header; live panel inline next to the locked form (F-AC-7/10/24).
- Secret stored in `sessionStorage` key `caller.adminDebugToken` (F-AC-2).
- Native ESM in `back/` and `agent/`: relative imports end in `.js`. Explicit `@Inject(...)` on constructor params (Vitest has no DI metadata).
- No new LiveKit project/trunk/credentials (B-AC-29). Agent must be redeployed (`cd agent && lk agent deploy`) (B-AC-30).

## Review Focus

> **No automated tests in this iteration** (user decision, 2026-10-12): no new `*.spec.ts` / `*.e2e-spec.ts` files. Each task is verified by `lint` + `build`/`typecheck` and the manual checks listed in it; Task 8 runs the full manual pass. Existing test suites must still pass (`cd back && npm run test`).

1. **Backend restarts while a test is `in_progress`** — the in-process max-duration `setTimeout` is lost and the one-active unique index would block every future test forever. Expect: creating a new session first expires `in_progress` rows older than `CALL_MAX_DURATION_SECONDS` as `max_duration_reached`. Manual check in Task 3.
2. **Admin clicks disconnect** — the agent also sees the participant leave and would report `admin_disconnected`, racing the front's explicit end. Expect: front calls `POST /agent-tests/:id/end` *before* `session.end()`, backend stores `admin_ended`, the later agent report is ignored. Manual check in Task 8.
3. **Agent never joins** (stale deployment per B-AC-30, or dispatch lost) — the room sits empty, the lock is held. Expect: the panel shows "Agent did not join" when the Agents UI agent state reaches `failed`, and its end button still ends the session via the API, freeing the lock. Manual check in Task 3 (API) and Task 8 (UI).
4. **CORS preflight for the custom `X-Admin-Token` header** — a browser request from `CORS_ORIGIN` must not be blocked. Expect: `OPTIONS /api/agent-tests` with `Access-Control-Request-Headers: x-admin-token` returns an allow-headers list containing it; if not, add `allowedHeaders` to `enableCors` in `back/src/main.ts`. Manual check in Task 3.
5. **Draft prompt equal to saved prompt modulo surrounding whitespace** — Expect `promptSource: 'saved'` (DTO trims; saved prompt is stored trimmed). Manual check in Task 3.

---

### Task 0: Branch

- [ ] **Step 1:** `git checkout -b feat/browser-agent-test-sessions` (repo is on `main`).

### Task 1: Config + admin guard (back)

**Files:**
- Modify: `back/src/config/env.validation.ts` (add `ADMIN_DEBUG_TOKEN` next to `AGENT_INTERNAL_TOKEN`)
- Modify: `back/.env.example` (placeholder + comment), local `back/.env` (developer adds a generated ≥32-char value; do not commit)
- Create: `back/src/agent-tests/admin-token.guard.ts`

**Interfaces:**
- Produces: `AdminTokenGuard implements CanActivate` — reads header `x-admin-token` (raw value, no `Bearer`), throws `UnauthorizedException('Invalid admin token')` on missing/mismatch. `export const ADMIN_TOKEN_HEADER = 'x-admin-token'`. Mirrors `calls/internal/agent-token.guard.ts`.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** `cd back && npm run lint && npm run build` → clean; start with `ADMIN_DEBUG_TOKEN` removed / 10 chars → boot fails with a config error (B-AC-1); restore.
- [ ] **Step 3:** Commit `feat(back): ADMIN_DEBUG_TOKEN config and admin token guard`.

### Task 2: LiveKitService — test dispatch + participant token (back)

**Files:**
- Modify: `back/src/livekit/livekit.service.ts`

**Interfaces:**
- Produces:
  - `dispatchTestAgent(roomName: string, agentName: string, testSessionId: string): Promise<void>` — `createDispatch` with metadata `JSON.stringify({ testSessionId })`; on error log + throw plain `Error('Failed to dispatch the test agent: …')`.
  - `createParticipantToken(roomName: string, identity: string): Promise<{ serverUrl: string; participantToken: string }>` — `AccessToken(apiKey, apiSecret, { identity, ttl: '10m' })`, grants per Global Constraints (`TrackSource` from `livekit-server-sdk`); `serverUrl` = configured `LIVEKIT_URL`.
  - Existing `ensureCallRoom(roomName)` is reused unchanged for test rooms (same `maxParticipants: 2`, `emptyTimeout: 60`).

- [ ] **Step 1:** Implement (keep `apiKey`/`apiSecret`/`serverUrl` as private fields).
- [ ] **Step 2:** `npm run lint && npm run build && npm run test` → clean (existing `livekit.service.spec.ts` still passes).
- [ ] **Step 3:** Commit `feat(back): LiveKit test-agent dispatch and participant tokens`.

### Task 3: `agent-tests` module — entity, migration, service, public + internal API (back)

**Files:**
- Create: `back/src/agent-tests/entities/agent-test-session.entity.ts`
- Create: `back/src/agent-tests/agent-tests.service.ts`
- Create: `back/src/agent-tests/agent-tests.controller.ts`
- Create: `back/src/agent-tests/dto/agent-test-session.dto.ts` (request + response DTOs)
- Create: `back/src/agent-tests/internal/internal-agent-tests.controller.ts`, `internal-agent-tests.dto.ts`
- Create: `back/src/agent-tests/agent-tests.module.ts`; Modify: `back/src/app.module.ts` (import it)
- Create: `back/src/database/migrations/<ts>-AddAgentTestSessions.ts` (via `npm run migration:generate -- src/database/migrations/AddAgentTestSessions`; review SQL)

**Interfaces:**
- Entity `AgentTestSession` (table `agent_test_session`), columns typed explicitly like `Call`: `id uuid`, `status varchar(16): AgentTestStatus = 'in_progress'|'completed'|'failed'`, `endReason varchar(32) null: AgentTestEndReason`, `failureReason text null`, `systemPrompt text`, `promptSource varchar(8): 'saved'|'draft'`, `transcript jsonb default '[]': AgentTestTranscriptTurn[]` (`{ seq: number; role: 'callee'|'agent'; text: string; at: string }`), `roomName varchar(64) null`, `startedAt timestamptz (CreateDate)`, `endedAt timestamptz null`, `durationSeconds int null`. `@Index('UQ_agent_test_session_in_progress', ['status'], { unique: true, where: \`"status" = 'in_progress'\` })`. Export `testRoomName(id) => \`agent-test-${id}\``.
- `AgentTestsService` (deps: repo, `ConfigService`, `AgentSettingsService`, `LiveKitService`):
  - `create(systemPrompt: string): Promise<{ session: AgentTestSession; serverUrl: string; participantToken: string }>` — order: `expireStale()` → `promptSource` by comparing to `agentSettingsService.getActivePrompt()` → insert (`isUniqueViolation` → `ConflictException('A test session is already in progress')`) → set `roomName` → `ensureCallRoom`, `dispatchTestAgent(room, LIVEKIT_AGENT_NAME, id)`, `createParticipantToken(room, \`admin-test-${randomUUID()}\`)`; any failure → `markFailed(id, \`<step> failed: …\`)` + `BadGatewayException('Could not start the test session')` → schedule backstop `setTimeout(markCompleted(id,'max_duration_reached'), max*1000).unref()`.
  - `expireStale(): Promise<void>` — `in_progress` rows with `startedAt < now - CALL_MAX_DURATION_SECONDS` → `markCompleted(id, 'max_duration_reached')`.
  - `list(): Promise<AgentTestSession[]>` (startedAt DESC), `findOne(id): Promise<AgentTestSession>` (404 `'Test session not found'`), `findForAgent(id): Promise<AgentTestSession | null>`.
  - `appendTranscriptTurn(id, turn)` — same idempotent jsonb `UPDATE` as `CallsService.appendTranscriptTurn`, table `"agent_test_session"`.
  - `markEnded(id, status, endReason, failureReason)` first-wins + `endRoom`; `markCompleted(id, reason)`, `markFailed(id, reason)`.
- Public controller `@Controller('agent-tests') @UseGuards(AdminTokenGuard) @ApiHeader({ name: 'X-Admin-Token' })`:
  - `POST /agent-tests` body `CreateAgentTestSessionDto { systemPrompt }` (same decorators as `UpdateAgentSettingsDto`, reuse `MAX_SYSTEM_PROMPT_LENGTH`) → 201 `{ session: AgentTestSessionDetailDto; server_url: string; participant_token: string }`.
  - `GET /agent-tests` → `AgentTestSessionSummaryDto[]` = `{ id, status, endReason, failureReason, promptSource, promptPreview (first 120 chars), startedAt, endedAt, durationSeconds }`.
  - `GET /agent-tests/:id` (`ParseUUIDPipe`) → `AgentTestSessionDetailDto` = summary fields minus `promptPreview` plus `systemPrompt`, `transcript: { role, text, at }[]`.
  - `POST /agent-tests/:id/end` → 204, `markCompleted(id, 'admin_ended')`; 404 if unknown.
- Internal controller `@Controller('internal/agent-tests/:testSessionId') @UseGuards(AgentTokenGuard)` (import guard from `../../calls/internal/agent-token.guard.js`), `@ApiExcludeController()`:
  - `GET` → `{ id, status, systemPrompt }` (404 if none) — same shape as `AgentCallContextDto`.
  - `POST transcript` → reuse `AppendTranscriptTurnDto` from `calls/internal/internal-calls.dto.js`, 204.
  - `POST end` → `EndAgentTestDto { status; endReason ∈ agent_completed|admin_disconnected|admin_unresponsive|max_duration_reached; failureReason }`, 204.

- [ ] **Step 1:** Write the entity, then generate + review the migration; `npm run migration:run` against local Postgres. The generated SQL must contain the partial unique index `WHERE "status" = 'in_progress'`.
- [ ] **Step 2:** Implement service, DTOs, controllers, module.
- [ ] **Step 3:** `npm run lint && npm run build && npm run test` → clean.
- [ ] **Step 4: Manual API checks** (`npm run start:dev`, Swagger `/docs` or curl; LiveKit is real, agent may be off):
  - no / wrong `X-Admin-Token` on all four public routes → 401, nothing created (B-AC-3).
  - `curl -i -X OPTIONS http://localhost:3001/api/agent-tests -H "Origin: http://localhost:3000" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: x-admin-token,content-type"` → allow-headers include `x-admin-token` (Review Focus 4).
  - POST with a draft prompt → 201 with `server_url`, `participant_token`, `session.promptSource: 'draft'`; room `agent-test-<id>` visible in the LiveKit Cloud dashboard; `GET /api/agent-settings` unchanged (B-AC-6/8/9).
  - POST the saved prompt padded with spaces → `promptSource: 'saved'` (Review Focus 5). Empty / whitespace / 8001-char prompt → 400 (B-AC-7).
  - second POST while one is `in_progress` → 409 (B-AC-11); `POST /:id/end` → 204, `admin_ended`, room deleted; then POST works again (Review Focus 3).
  - `UPDATE agent_test_session SET "startedAt" = now() - interval '11 minutes'` on an `in_progress` row, then POST → 201 and the old row is `max_duration_reached` (Review Focus 1).
  - internal routes: `Authorization: Bearer <AGENT_INTERNAL_TOKEN>` works, admin token → 401; repeat a transcript `seq` → no duplicate; end after `admin_ended` → stored outcome unchanged (B-AC-20/21/22).
  - `GET /api/agent-tests` newest first, no transcript; `GET /:id` full prompt + transcript; unknown id → 404 (B-AC-13..15).
- [ ] **Step 5:** Update `back/AGENTS.md` (Structure: `src/agent-tests/`; Env: `ADMIN_DEBUG_TOKEN`). Commit `feat(back): browser agent test sessions API (SPEC-06)`.

### Task 4: Agent — test-session mode (agent)

**Files:**
- Modify: `agent/src/config.ts` (`DEEPGRAM_TEST_MODEL` optional `'nova-3'`, `TEST_SILENCE_TIMEOUT_SECONDS` default `60`, same preprocess style)
- Modify: `agent/src/backend-client.ts`
- Modify: `agent/src/main.ts`
- Modify: `agent/.env.example`, `agent/AGENTS.md`

**Interfaces:**
- `backend-client.ts`:
  - `export type JobTarget = { kind: 'call'; id: string } | { kind: 'test'; id: string }`.
  - `type EndReason = CallEndReason | 'admin_disconnected' | 'admin_unresponsive'`; `CallOutcome` → `{ status: 'completed'; endReason: EndReason } | { status: 'failed'; failureReason: string }`.
  - Methods become `getContext(target): Promise<AgentCallContext | null>`, `appendTranscriptTurn(target, turn)`, `end(target, outcome)`; base path `/internal/calls/:id` for `call`, `/internal/agent-tests/:id` for `test`.
- `main.ts`:
  - `parseJobTarget(metadata: string): JobTarget | null` — `{callId}` → call, `{testSessionId}` → test, anything else → `null`.
  - A per-kind profile `{ sttModel, silenceTimeoutSeconds, silenceEndReason, hangupEndReason }`: call = `(DEEPGRAM_MODEL, CALLEE_SILENCE_TIMEOUT_SECONDS, 'callee_unresponsive', 'callee_hangup')`, test = `(DEEPGRAM_TEST_MODEL, TEST_SILENCE_TIMEOUT_SECONDS, 'admin_unresponsive', 'admin_disconnected')`. Everything else in the entry stays as is, parameterised by target + profile.
  - `null` target → `ctx.shutdown('Job metadata identifies neither a call nor a test session')` and return, no backend call (B-AC-27).

- [ ] **Step 1:** Implement; PSTN path must produce byte-identical backend requests and the same models/timeouts as before (B-AC-26) — diff review: every `call` code path uses the old constants.
- [ ] **Step 2:** `cd agent && npm run typecheck && npm run build` → clean.
- [ ] **Step 3:** Local smoke (with `npm run dev` and the Cloud deployment stopped, per agent/AGENTS.md): create a test session via Swagger `/docs` with the admin header, join with the LiveKit Agents Playground or the Task 8 UI, confirm: agent greets with the draft prompt, transcript turns land in `GET /api/agent-tests/:id`, closing the tab yields `admin_disconnected`, 60 s silence yields `admin_unresponsive`. Then place one real PSTN call and confirm unchanged behaviour.
- [ ] **Step 4:** Commit `feat(agent): browser test-session mode (SPEC-06 AC-24..28)`. Redeploy is a release step: `cd agent && lk agent update-secrets --secrets-file .env.production` (new optional vars only if overriding defaults) then `lk agent deploy`.

### Task 5: Front — LiveKit deps, API client, secret store, queries (front)

**Files:**
- Install: `cd front && npx shadcn@latest registry add @agents-ui && npx shadcn@latest add @agents-ui/agent-session-provider @agents-ui/agent-control-bar @agents-ui/agent-audio-visualizer-bar @agents-ui/agent-chat-transcript @agents-ui/start-audio-button` (pulls `livekit-client`, `@livekit/components-react`; ensure versions ≥ `2.22` / `2.9`; commit `package-lock.json` and generated `components/agents-ui/*`)
- Modify: `front/lib/api.ts`
- Create: `front/lib/admin-secret.ts`, `front/lib/queries/agent-tests.ts`, `front/hooks/use-agent-tests.ts`, `front/lib/schemas/admin-secret.ts`

**Interfaces:**
- `api.ts` types: `AgentTestStatus`, `AgentTestEndReason`, `PromptSource = 'saved'|'draft'`, `AgentTestSessionSummary`, `AgentTestSessionDetail`, `CreatedAgentTestSession = { session: AgentTestSessionDetail; server_url: string; participant_token: string }` — fields exactly as Task 3 DTOs.
- `api` methods (all send `X-Admin-Token: adminToken`): `createAgentTestSession(systemPrompt, adminToken)`, `endAgentTestSession(id, adminToken)`, `listAgentTestSessions(adminToken, opts?)`, `getAgentTestSession(id, adminToken, opts?)`. Error messages from the secret must not include the header value.
- `admin-secret.ts`: `getAdminSecret(): string | null`, `setAdminSecret(v: string)`, `clearAdminSecret()`, `useAdminSecret(): string | null` (`useSyncExternalStore` over `sessionStorage` key `caller.adminDebugToken` + a module-level listener set; server snapshot `null`).
- `schemas/admin-secret.ts`: `adminSecretSchema = z.object({ secret: z.string().trim().min(32, 'The admin key is at least 32 characters.') })`.
- `queries/agent-tests.ts`: `agentTestQueries.all() = ['agent-tests']`, `.list(token)` key `['agent-tests','list']`, `.detail(id, token)` key `['agent-tests','detail', id]` — the token is captured by the `queryFn` closure, **never** placed in a key.
- `hooks/use-agent-tests.ts`: `useAgentTestSessions()`, `useAgentTestSession(id)` (`refetchInterval: (q) => q.state.data?.status === 'in_progress' ? 3000 : false`, F-AC-26), `useCreateAgentTestSession()`, `useEndAgentTestSession()` (invalidates `all()`); all `enabled: !!token`; a shared `onError` that calls `clearAdminSecret()` when `ApiError.status === 401` (F-AC-5).

- [ ] **Step 1:** Install + implement.
- [ ] **Step 2:** `npm run lint && npm run build` → clean (front has no unit test runner; correctness is exercised in Tasks 6–8).
- [ ] **Step 3:** Commit `feat(front): agent-test API client, admin secret store, LiveKit Agents UI`.

### Task 6: Front — admin secret gate + live test panel + settings page (front)

**Files:**
- Create: `front/components/admin-secret-gate.tsx` — RHF + zod form (`forms-best-practices`), password `Input` with label; renders `children` when a secret is held, plus a "Forget admin key" button (F-AC-1/4).
- Create: `front/components/agent-test-panel.tsx`
- Modify: `front/components/agent-settings-form.tsx` (add "Test in browser", lock while active)
- Modify: `front/app/page.tsx` (two-column layout ≥ `lg`: form | panel; widen `max-w`), add link to `/agent-tests`

**Interfaces:**
- `AgentTestPanel({ created, onEnded }: { created: CreatedAgentTestSession; onEnded: () => void })`:
  - `TokenSource.literal({ serverUrl: created.server_url, participantToken: created.participant_token })` memoised per session id → `useSession(source)` → `<AgentSessionProvider session={session}>`; `session.start()` in an effect, `session.end()` in its cleanup (F-AC-19); `room.prepareConnection` is handled by the session.
  - Shows `AgentAudioVisualizerBar`, `AgentControlBar` with camera/screen-share/chat controls hidden (mic only, F-AC-13/14), `AgentChatTranscript` (plain text, F-AC-22; label admin turns "You"), `StartAudioButton` (F-AC-16).
  - Disconnect = `await endMutation.mutateAsync(id)` **then** `session.end()` (Review Focus 2), then show ended state + final transcript from `useAgentTestSession(id)` and a "Start new test" action (F-AC-18/20).
  - Mic failure (`onMediaDeviceFailure` / permission denied) → explicit how-to-allow message (F-AC-15). `!window.isSecureContext` → "Microphone access requires HTTPS" before connecting (F-AC-23). Unexpected disconnect → disconnected state, no auto-reconnect (F-AC-21). Agent state `failed` → "Agent did not join — it may need redeploying" + end button still works (Review Focus 3).
  - End reasons in plain language map: `admin_ended` "You ended the test", `admin_disconnected` "Connection closed", `agent_completed` "The agent ended the conversation", `admin_unresponsive` "Ended after 60 s of silence", `max_duration_reached` "Reached the maximum duration", `failed` → `failureReason`.
- `AgentSettingsForm` additions: `onStartTest` = `trigger('systemPrompt')` → if valid `createMutation.mutateAsync(getValues('systemPrompt'))` (form is not submitted/saved, F-AC-8/9); "Using unsaved draft prompt" note when `formState.isDirty` (F-AC-10); `Textarea` and Save `disabled` while a session is connecting/live (F-AC-10/11); 409 → "Another test session is already running", 502/other → `ApiError.message` (F-AC-12).

- [ ] **Step 1:** Implement (`vercel-composition-patterns`: the page owns `created` state and passes `testActive` to the form; no prop sprawl).
- [ ] **Step 2:** `npm run lint && npm run build` → clean.
- [ ] **Step 3:** Commit `feat(front): inline browser test panel on agent settings (SPEC-05)`.

### Task 7: Front — history route + nav (front)

**Files:**
- Create: `front/app/agent-tests/page.tsx` (client list inside `AdminSecretGate`), `front/app/agent-tests/[id]/page.tsx` (detail)
- Create: `front/components/agent-test-history.tsx`, `front/components/agent-test-detail.tsx`
- Modify: `front/components/site-header.tsx` (`NAV_ITEMS` += `{ href: '/agent-tests', label: 'Agent Tests' }`; active match uses `startsWith` for this item)
- Modify: `front/AGENTS.md` (Structure + replace the "no livekit-client dependency" sentence in **Calling** with the test-console exception)

**Interfaces:**
- List rows: "Test" badge, `promptSource` badge ("Saved prompt"/"Draft prompt"), start time, duration, status, end/failure reason, prompt preview; most-recent-first; empty state + error with retry (F-AC-24/27).
- Detail: full prompt (`whitespace-pre-wrap`, plain text), labels, timestamps, full transcript; polls while `in_progress` (F-AC-25/26).
- No secret → `AdminSecretGate` prompt, not an error page (F-AC-28).

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** `npm run lint && npm run build` → clean.
- [ ] **Step 3:** Commit `feat(front): agent test history at /agent-tests (SPEC-05)`.

### Task 8: End-to-end manual verification + spec check

- [ ] **Step 1:** Stack up: `docker compose up -d`, `cd back && npm run migration:run && npm run start:dev`, `cd agent && npm run dev` (Cloud agent stopped or redeployed), `cd front && npm run dev`.
- [ ] **Step 2:** In Chrome at `http://localhost:3000`: enter admin key → edit prompt without saving → "Test in browser" → allow mic → converse; confirm: draft note shown, textarea + Save disabled, live transcript, visualizer, mute works; press disconnect → history entry `admin_ended`, `Draft prompt`; saved settings unchanged after reload.
- [ ] **Step 3:** Negative paths: deny mic (message shown); wrong key (401 → key cleared, re-prompt); start a second tab's test while one runs (409 message); stop the agent worker and start a test (agent-did-not-join message, end works, next test can start); stay silent 60 s (`admin_unresponsive`).
- [ ] **Step 4:** Regression: place one real PSTN call from `/users` → behaviour and transcript as before.
- [ ] **Step 5:** Dispatch `plan-verifier` against `back/specs/SPEC-06-browser-agent-test-sessions.md` and `front/specs/SPEC-05-browser-agent-test-console.md`; fix any unmet AC.
- [ ] **Step 6:** Set both specs' status to `implemented` in their `specs/README.md` index rows (if that is the folder's convention at merge time) and commit.
