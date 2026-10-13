# Spec: Browser agent test sessions (admin debug mode) | Spec ID: SPEC-06 | Status: draft

## Problem & why

Today the only way to see how the voice agent behaves with a given system prompt is to place a real, billable PSTN call to a real contact. Admins need a safe, cheap way to talk to the same agent by voice from their browser microphone, using the prompt they are currently editing (even unsaved), before it is used on real calls. This is an admin-only debug tool, not a feature for end clients. This spec covers the backend session lifecycle, the admin-secret protection, the LiveKit join credentials, persistence of test conversations, and the matching voice-agent (`agent/`) behaviour. The UI is specified in `front/specs/SPEC-05-browser-agent-test-console.md`.

Builds on `back/specs/SPEC-02-pstn-ai-calling-agent.md` (same agent, same STT -> LLM -> TTS loop, same internal agent API conventions). PSTN call behaviour is unchanged by this spec.

## Goals / Non-goals

- Goals:
  - Let an admin start a voice session with the agent from a browser, using a caller-supplied (draft) system prompt, without modifying the saved agent settings.
  - Protect every test-session endpoint with a shared admin secret.
  - Persist each test conversation (prompt snapshot, transcript turns, status/outcome, timestamps) in a store separate from real call history, so it can be reviewed later and is unambiguously a test.
  - Reuse the same deployed agent (same name, same STT/LLM/TTS stack), distinguishing a test session from a PSTN call by dispatch metadata only.
  - Bound every session by a hard maximum duration.
- Non-goals:
  - A general user/admin login system. A single shared secret is the whole auth model for this feature.
  - Exposing test sessions to end clients or contacts.
  - Telephony of any kind; no SIP, no phone number, no `User` association.
  - Audio recording or storage (text transcript only, consistent with SPEC-02).
  - Editing or saving the agent settings through this feature.
  - Per-session voice, model, or language selection.
  - Deleting or editing past test sessions.
  - Protecting any other existing endpoint with the new secret (see Edge cases).

## User stories

- As an admin, I want to talk to the agent through my browser using the prompt I am drafting, so I can check its behaviour before saving it and before real calls go out.
- As an admin, I want past test conversations kept and clearly marked as tests, so I can compare prompt versions without mixing them into real call history.
- As the operator, I want test endpoints locked behind a secret, so strangers cannot burn my LLM/TTS/STT credits.

## Acceptance criteria (EARS)

### Admin protection

- AC-1: The system shall require a configured `ADMIN_DEBUG_TOKEN` of at least 32 characters at startup; IF it is missing or shorter, THEN the application shall fail to start and report a configuration error.
- AC-2: WHEN a request to any test-session endpoint carries the correct admin secret in the designated request header, the system shall process it normally.
- AC-3: IF a request to any test-session endpoint has a missing or incorrect admin secret, THEN the system shall respond with 401 and perform no work (no session created, no room, no token, no data returned). The comparison shall be constant-time.
- AC-4: (Removed — session creation is not rate-limited; see Non-functional › Cost control.)
- AC-5: The system shall never include the admin secret, the LiveKit API secret, or the internal agent token in any response body, log line, or persisted record.

### Creating a session

- AC-6: WHEN an authorized client sends a session-create request with a `systemPrompt`, the system shall create a test session record with status `in_progress`, `startedAt` set, the prompt stored as an immutable snapshot, and a `promptSource` of `saved` (the snapshot is identical to the currently saved agent-settings prompt) or `draft` (it differs), and shall return the session id together with the standard LiveKit token-endpoint response shape (`server_url`, `participant_token`).
- AC-7: IF the supplied `systemPrompt` is missing, empty/whitespace-only, or exceeds the same maximum length enforced for the saved agent-settings prompt, THEN the system shall return a validation error and create nothing.
- AC-8: WHEN a session is created, the system shall read the saved agent settings only to determine `promptSource` (AC-6), and shall not write or otherwise alter them.
- AC-9: WHEN a session is created, the system shall create a dedicated LiveKit room whose name is derived only from the session id (no PII) and dispatch the same named agent used for PSTN calls into it, with job metadata that identifies a test session (by session id) rather than a call.
- AC-10: The participant token shall (a) carry an opaque, PII-free identity not taken from the request, (b) be valid for no more than 10 minutes, (c) allow joining only that session's room, (d) permit publishing the microphone source only and subscribing, and (e) grant no room-admin, room-create, room-list, or recording permissions.
- AC-11: IF an admin-initiated session already has status `in_progress` at creation time, THEN the system shall reject the new request with a conflict error (at most one active test session at a time); a session that has ended or been force-ended by the backstop no longer counts.
- AC-12: IF the room creation, agent dispatch, or token minting fails, THEN the system shall mark the session `failed` with a descriptive failure reason, clean up the room, and return a gateway-type error to the client.

### Reading sessions

- AC-13: WHEN an authorized client lists test sessions, the system shall return them most-recent-first with id, status, end/failure reason, `startedAt`, `endedAt`, `durationSeconds`, `promptSource`, and a prompt preview, never mixed into any calls listing.
- AC-14: WHEN an authorized client requests one test session by id, the system shall return its status, end/failure reason, timestamps, `promptSource`, full prompt snapshot, and every transcript turn recorded so far (including while `in_progress`).
- AC-15: IF the id does not match a test session, THEN the system shall return a "not found" error.
- AC-16: The system shall not expose test sessions through any `Call` endpoint, and a `Call` record shall never be created for a test session.

### Ending a session

- AC-17: WHEN the admin client reports it is done (explicit end request), or the agent ends the conversation via its end tool, or the admin participant disconnects from the room, the system shall set the session to `completed` with an end reason of `admin_ended`, `agent_completed`, or `admin_disconnected` respectively, record `endedAt`, compute `durationSeconds`, and delete the room.
- AC-18: IF a session remains `in_progress` longer than the configured maximum call duration (`CALL_MAX_DURATION_SECONDS`, default 600 s), THEN the system shall end it with status `completed` and end reason `max_duration_reached`, regardless of conversation state, even if no client or agent ever reports in.
- AC-19: IF the speech-to-text, LLM, or text-to-speech step fails unrecoverably during a session, THEN the system shall end it with status `failed` and a failure reason naming the failed step.
- AC-20: WHEN a session has already reached a terminal status, any later end report shall be ignored (first outcome wins) and shall not alter the stored outcome.

### Agent-facing internal API

- AC-21: The system shall expose internal endpoints for the agent to (a) fetch a test session's status and prompt snapshot, (b) append a transcript turn `{seq, role, text, at}`, and (c) report the end outcome, all guarded by the same bearer token as the existing internal call endpoints (`AGENT_INTERNAL_TOKEN`) and not by the admin secret.
- AC-22: WHEN the agent appends a turn with a `seq` already stored for that session, the system shall accept it idempotently without creating a duplicate.
- AC-23: IF the agent fetches a session that is not `in_progress`, THEN the system shall indicate so, and the agent shall not start a conversation for it.

### Voice agent behaviour (`agent/`)

- AC-24: WHEN the agent receives a job whose metadata identifies a test session, it shall load that session's prompt snapshot from the backend and run the conversation with that prompt using the same LLM and TTS as PSTN calls.
- AC-25: WHEN running a test session, the agent shall use a speech-to-text model suited to browser/wideband microphone audio (default `nova-3`, configurable) instead of the phone-call model, and shall record transcript turns with the admin attributed under the same role label used for the callee in call transcripts.
- AC-26: WHEN the agent receives a job whose metadata identifies a PSTN call, its behaviour (model, turn detection, transcript writing, outcome reporting, silence timeout) shall be identical to before this feature.
- AC-27: IF job metadata contains neither a valid call id nor a valid test-session id, THEN the agent shall end the job without starting a conversation.
- AC-28: WHILE in a test session, if no admin speech is detected for the test silence timeout (a separate optional agent setting, default 60 s — not `CALLEE_SILENCE_TIMEOUT_SECONDS`), the agent shall end the session with an end reason of `admin_unresponsive`.

### Configuration & deployment

- AC-29: The system shall add no new LiveKit project, SIP trunk, or LiveKit credential requirements; existing `LIVEKIT_*` and `AGENT_INTERNAL_TOKEN` settings suffice.
- AC-30: The agent must be redeployed to LiveKit Cloud for test sessions to work; WHILE the deployed agent predates this feature, a test session shall end via the backstop (AC-18) or a failure rather than hang, and the docs shall state this redeploy requirement.

## Edge cases

- Admin closes the browser tab abruptly: the participant-disconnect path (AC-17) or the backstop (AC-18) ends the session; there is no orphaned `in_progress` row beyond the max duration.
- Admin and agent both end it at nearly the same moment: first outcome wins (AC-20).
- A token expires mid-session: LiveKit refreshes it for connected participants; a re-join after expiry requires creating a new session (tokens are not re-issued for an existing session).
- The prompt contains instructions aimed at the LLM: it is the admin's own deliberate input and is used as-is; no sanitising beyond length/non-empty.
- Untrusted input: the admin's transcribed speech and the draft prompt are data fed to the LLM and stored as plain text; they must never be interpreted as instructions to the backend, a shell, or a query, and must be rendered as plain text by clients.
- The secret is a single shared credential with no per-admin identity; there is no audit of who ran a session. Accepted limitation; rotating it means changing the env var and restarting.
- No other endpoint is protected by this secret; existing endpoints remain unauthenticated per prior specs.

## Non-functional

- Security: constant-time secret comparison; the secret is sent only over HTTPS in non-local deployments.
- Every outbound LiveKit API call made for sessions uses a request timeout, as in SPEC-02.
- Cost control: there is deliberately no rate limit on session creation; the admin secret (AC-2/3), the one-active-session cap (AC-11), and max duration (AC-18) together bound spend if the secret leaks.
- Max duration reuses `CALL_MAX_DURATION_SECONDS` rather than a new variable: a test should hit the same cap as a real call, and it keeps configuration surface minimal.
- The silence timeout, by contrast, gets its own shorter default (60 s): a forgotten browser tab should stop billing quickly, while a phone callee may legitimately pause longer.
- One active test session at a time (AC-11) is sufficient for a single-admin debug tool; a stuck session frees itself via the backstop (AC-18).
- Retention: test sessions and transcripts are kept indefinitely in v1; pruning can be added later if volume warrants it.
- Per project convention, never log phone numbers or PII; log session id and room name for correlation.

## Out of scope

- Real login, roles, or per-admin tokens.
- Comparing/diffing sessions, scoring, or prompt versioning.
- Replaying audio.
- Deleting test sessions or retention/pruning policy.
- Video, screen share, or text chat with the agent.
- The browser UI (`front/specs/SPEC-05-browser-agent-test-console.md`).

## Open questions

None.

## Changelog

- 2026-10-12 — created
- 2026-10-12 — resolved open questions: one active session cap kept, rate limit 5/min per IP, indefinite retention, separate 60 s test silence timeout; added `promptSource` (saved vs draft)
- 2026-10-12 — removed the session-creation rate limit (AC-4)
