# Spec: Scheduled calls and messages | Spec ID: SPEC-05 | Status: draft

## Problem & why

Staff can only send a message or place a call right now. They need to say "call / text this contact at 15:00 tomorrow" and have the system do it, with the ability to cancel before it fires and to see what happened afterwards. This spec covers the backend: storing one-off scheduled jobs, firing them at the right time through the existing channels, cancelling them, and exposing progress and history. Time-based triggering uses `@nestjs/schedule` (the chosen mechanism).

Cross-references: calls reuse `back/specs/SPEC-02-pstn-ai-calling-agent.md` (placing the call, one-call-per-User lock, transcript), WhatsApp reuses `SPEC-01`, SMS reuses `SPEC-03`, Telegram reuses `SPEC-04`. The UI is `front/specs/SPEC-04-scheduled-page.md`.

## Goals / Non-goals

- Goals:
  - Add hard deletion of a `User` (`DELETE /users/:id`) — required so scheduled jobs and history never outlive their contact.
  - Schedule a **one-off** job for an existing `User` on exactly one channel: `call`, `sms`, `whatsapp`, or `telegram`. Message jobs carry a text body; call jobs carry none.
  - Fire due jobs automatically by delegating to the existing channel behavior (no duplicate send/dial logic).
  - Cancel a job any time before it starts executing.
  - Expose each job's lifecycle status, live progress for calls, and a history of finished jobs.
  - Channels stay pluggable: adding a provider later must not change the schedule contract (channel is a value, not a separate API path).
- Non-goals:
  - Recurring jobs / cron rules.
  - Editing a scheduled job (cancel and create a new one instead).
  - One job fanning out to several channels or several Users (one job = one User + one channel).
  - Retries of failed jobs, including unanswered/busy calls.
  - Per-job agent prompt for calls: the global prompt at fire time is used (SPEC-02 AC-3/AC-5 semantics).
  - Interrupting a call that is already running.
  - Authentication, authorization, rate limiting — same accepted MVP limitation as SPEC-01..04.
  - Any user interface (see the frontend spec).

## User stories

- As an operator, I want to schedule a call or a text message for a specific date/time, so that it goes out when it should without me being there.
- As an operator, I want to cancel a scheduled item before it fires, so that I can correct a mistake.
- As an operator, I want to watch a running scheduled call's progress, so that I know what is happening now.
- As an operator, I want a history of past scheduled items and their outcomes, so that I can check what was sent or missed.

## Lifecycle

- `scheduled` → `running` → `completed` | `failed`
- `scheduled` → `cancelled`
- `scheduled` → `missed`

Terminal states: `completed`, `failed`, `cancelled`, `missed`. `cancelled` is only reachable from `scheduled`.

## Acceptance criteria (EARS)

### Creating

- AC-1: WHEN a client sends `POST /scheduled-jobs` with `userId`, `channel` (`call` | `sms` | `whatsapp` | `telegram`), `scheduledAt` (ISO 8601 with offset/UTC) and, for message channels, `body`, the system shall create a job with status `scheduled` and return it.
- AC-2: IF `userId` does not match an existing User, THEN the system shall return a "not found" error and create nothing.
- AC-3: IF `scheduledAt` is missing, not a valid timestamp, or less than the configured minimum lead time (default 60 seconds) in the future, THEN the system shall reject the request with a validation error and create nothing.
- AC-4: IF `channel` is a message channel and `body` is missing, empty/whitespace-only, or exceeds that channel's existing maximum length, THEN the system shall reject the request with a validation error and create nothing.
- AC-5: IF `channel` is `call` and `body` is provided, THEN the system shall reject the request with a validation error.
- AC-6: IF `channel` is not one of the supported values, THEN the system shall reject the request with a validation error.
- AC-3a: IF `scheduledAt` is more than 1 month in the future (default max horizon, configurable), THEN the system shall reject the request with a validation error and create nothing.
- AC-3b: IF `channel` is `telegram` and the User's Telegram is not linked, or the client is opted out or unreachable, THEN the system shall reject the request with a validation error stating the reason and create nothing.
- AC-7: The system shall allow several jobs for the same User and channel, including at the same time; it shall not deduplicate.

### Firing

- AC-8: WHEN a job's `scheduledAt` is reached while it is `scheduled`, the system shall atomically move it to `running`, record `startedAt`, and execute it through the corresponding channel's existing send/dial behavior.
- AC-9: The system shall execute each job at most once, including when the API runs as more than one instance or when a scheduler tick overlaps the previous one.
- AC-10: WHEN a message job's channel send succeeds, the system shall set the job to `completed`, record `finishedAt`, and link the resulting channel log entry (SMS/WhatsApp/Telegram message record).
- AC-11: IF the channel send fails (provider error, timeout, Telegram client not linked/opted-out/unreachable, WhatsApp/SMS rejection), THEN the system shall set the job to `failed` with a failure reason, record `finishedAt`, and link the channel log entry if one was written.
- AC-12: WHEN a call job fires, the system shall place the call exactly as `POST /users/:id/calls` does and link the resulting `Call` to the job; the job stays `running` until that `Call` is `completed` or `failed`, then takes the matching terminal status and `finishedAt`.
- AC-13: IF a call job fires while the User already has a call `in_progress`, THEN the system shall set the job to `failed` with reason "user already in a call" and not place a second call.
- AC-14: IF a call ends as `failed` (busy, no answer, dial error), THEN the job shall be `failed` and shall not be retried.
- AC-15: The destination (phone number / Telegram chat) used at fire time shall be resolved from the User at fire time, with the destination snapshot stored on the resulting channel log entry as each channel already does.

### Cancelling

- AC-16: WHEN a client sends `POST /scheduled-jobs/:id/cancel` for a job with status `scheduled`, the system shall set it to `cancelled`, record `cancelledAt`, ensure it never fires, and return it.
- AC-17: IF the job's status is `running`, THEN the system shall reject the cancel with a conflict error ("already in progress") and leave the job and any running call untouched.
- AC-18: IF the job's status is `completed`, `failed`, `cancelled` or `missed`, THEN the system shall reject the cancel with a conflict error.
- AC-19: IF a cancel request and the fire moment race, THEN exactly one shall win: either the job becomes `cancelled` and does not fire, or it becomes `running` and the cancel gets AC-17's conflict.
- AC-20: IF `:id` does not match any job, THEN the system shall return a "not found" error.

### User deletion

- AC-20a: WHEN a client sends `DELETE /users/:id` for an existing User with no `in_progress` call and no `running` scheduled job, the system shall permanently delete the User together with all of that User's data in one atomic operation: scheduled jobs (any status), calls and transcripts, WhatsApp, SMS and Telegram message logs, the Telegram link and its invitation tokens. It shall return success with no content.
- AC-20b: IF the User has a call with status `in_progress` or a scheduled job with status `running`, THEN the system shall reject the deletion with a conflict error ("contact has an active call or job") and delete nothing.
- AC-20c: IF `:id` does not match any User, THEN the system shall return a "not found" error.
- AC-20d: IF any part of the deletion fails, THEN the system shall roll back and leave the User and all their data intact.
- AC-20e: IF a deletion races with a job starting, THEN exactly one shall win: either the deletion succeeds and the job never fires, or the job becomes `running` and the deletion gets AC-20b's conflict.
- AC-20f: After deletion, a `GET /users` listing shall not include the User and a new User may be created with the same phone number.

### Missed jobs (downtime)

- AC-21: WHEN the application starts or a scheduler tick runs and finds a `scheduled` job whose `scheduledAt` is in the past by no more than the configured grace period (default 5 minutes), the system shall execute it as in AC-8.
- AC-22: WHEN it finds a `scheduled` job overdue by more than the grace period, THEN the system shall set it to `missed` with a reason, record `finishedAt`, and not execute it.

### Listing, progress, history

- AC-23: WHEN a client sends `GET /scheduled-jobs`, the system shall return jobs with `id`, `userId` plus a User name/phone snapshot, `channel`, `body`, `scheduledAt`, `status`, `failureReason`, `startedAt`, `finishedAt`, `cancelledAt`, and linked `callId` where applicable.
- AC-24: WHERE a `status` filter (one or more statuses), `userId` filter or `channel` filter is supplied, the system shall return only matching jobs.
- AC-25: The system shall order upcoming jobs (`scheduled`, `running`) by `scheduledAt` ascending and finished jobs (`completed`, `failed`, `cancelled`, `missed`) by end time descending; the listing shall be paginated.
- AC-26: WHEN a client sends `GET /scheduled-jobs/:id`, the system shall return the job and, for a call job with a linked `Call`, that call's current status, `startedAt`, elapsed duration, and every transcript turn recorded so far (same data as SPEC-02 AC-10) — reflecting new turns while the call is `in_progress`.
- AC-27: WHILE a message job is executing, `GET /scheduled-jobs/:id` shall report `running`; once the send resolves it shall report the terminal status.

### Configuration & resilience

- AC-28: The system shall validate scheduler configuration at startup (minimum lead time, grace period, tick interval — all optional with defaults); IF a value is invalid, THEN the application shall fail to start with a configuration error.
- AC-29: IF the application stops or crashes while a job is `running`, THEN on next start the system shall reconcile it: a call job follows its `Call`'s final state; a message job with no recorded send outcome becomes `failed` with reason "interrupted" and is not re-sent automatically.
- AC-30: The scheduler shall run only in the API process, never in the voice agent worker process (which reuses `AppModule`).

## Edge cases

- Deletion is irreversible and removes history too (no soft delete, no restore); the frontend must confirm before calling it.
- A Telegram invitation link issued for a deleted User stops working (its token is deleted).
- `scheduledAt` is stored and compared in UTC; displaying in the viewer's timezone is a frontend concern.
- A User is edited (phone number changed) after the job was created: fire-time data is used (AC-15). A User with no usable destination at fire time → `failed`.
- WhatsApp message job fired outside the 24h window falls back to the template exactly as SPEC-01 does; the job is `completed` if the fallback was sent.
- Calls scheduled at night are allowed; quiet-hours restrictions are out of scope.
- Known MVP limitation: no authentication/authorization/rate limiting on `/scheduled-jobs`.

## Non-functional

- Tick interval default about 15–30 s, so a job fires within one tick of `scheduledAt`.
- Cancel and list responses must not depend on provider calls.

## Out of scope

- Recurring schedules, editing, multi-channel/multi-recipient jobs, retries, mid-call interruption, per-job prompts, quiet hours, auth/rate limiting, any UI.

## Changelog

- 2026-10-05 — created
- 2026-10-05 — added `DELETE /users/:id` (AC-20a..f): hard delete of the User with all data, 409 while a call/job is active; replaces the earlier "keep history" assumption
- 2026-10-05 — max horizon 1 month (AC-3a); Telegram availability validated at creation (AC-3b); scheduled jobs deleted with their User (AC-20a/b)
