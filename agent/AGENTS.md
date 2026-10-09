# agent

The PSTN calling voice agent (`back/specs/SPEC-02`), deployed on its own to **LiveKit Cloud Agents**. TypeScript, native ESM, `@livekit/agents` 1.9 — no NestJS, no database.

## How it fits

- `back/` creates the call, then dispatches this agent **explicitly by name** (`LIVEKIT_AGENT_NAME`, default `caller-voice-agent`) into the call's room with job metadata `{ "callId": "<uuid>" }`, and dials the callee over SIP.
- On each job the agent runs Deepgram STT → Claude (Anthropic) LLM → ElevenLabs TTS for one call.
- **All call state goes through `back/`'s internal API** (`src/backend-client.ts`), authenticated with the shared `AGENT_INTERNAL_TOKEN` bearer token:
  - `GET /api/internal/calls/:callId` — status + snapshotted system prompt.
  - `POST /api/internal/calls/:callId/transcript` — one turn `{ seq, role, text, at }`; idempotent per `seq`.
  - `POST /api/internal/calls/:callId/end` — `{ status: 'completed', endReason }` or `{ status: 'failed', failureReason }`; the first outcome wins. The backend tears the room down.
- Writes are queued in order and never block the conversation; the job's shutdown callback waits for them to flush. Requests time out after 5 s and retry network errors/429/5xx with backoff.
- Because it runs on LiveKit Cloud, **`BACKEND_URL` must be publicly reachable** (a deployed API, or a tunnel such as ngrok/cloudflared to a local one).

## Structure

- `src/main.ts` — `defineAgent` entry + `cli.runApp` (dispatch name from config).
- `src/config.ts` — zod-validated env, parsed at module load (missing secret → crash on boot).
- `src/backend-client.ts` — the only code that talks to `back/`.
- `Dockerfile` / `.dockerignore` — built by the LiveKit Cloud build service (Node 24 slim, `ca-certificates`, non-root `appuser`, `CMD node dist/main.js start`).
- `livekit.toml` — written by `lk agent create` (project subdomain + agent id). Commit it.

## Commands

- `npm run dev` — run the worker locally against the Cloud project (reads `agent/.env`). Use this **or** the Cloud deployment, not both at once, otherwise jobs are split between them.
- `npm run build` / `npm run start` — compile to `dist/` / run the compiled worker (what the container does).
- `npm run typecheck` — `tsc --noEmit`.

## Deploying (manual, via the LiveKit CLI)

1. `lk cloud auth` (once), then `lk project set-default "<project>"` if you have several.
2. Put production secrets in `agent/.env.production` (gitignored; copy `.env.example`, set `BACKEND_URL` to the public API URL, drop the `LIVEKIT_*` lines — Cloud injects those).
3. First time: `cd agent && lk agent create --secrets-file .env.production` — registers the agent, writes `livekit.toml`, builds and deploys.
4. New version: `cd agent && lk agent deploy` (rolling; old instances get up to 1 h to finish active calls).
5. Change secrets: `lk agent update-secrets --secrets-file .env.production` (triggers a rolling restart).
6. Inspect: `lk agent status`, `lk agent logs`.

## Env

`LIVEKIT_AGENT_NAME` (optional, must match `back/`), `BACKEND_URL` (API base incl. `/api`), `AGENT_INTERNAL_TOKEN` (≥32 chars, same value as in `back/`), `DEEPGRAM_API_KEY`, `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, optional `DEEPGRAM_MODEL` / `ANTHROPIC_MODEL` / `ELEVENLABS_MODEL`, and `CALLEE_SILENCE_TIMEOUT_SECONDS` (default `300` — hang up with `callee_unresponsive` after that long without any callee speech). Locally also `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`; never set those as Cloud secrets.

## Conventions

- npm (lockfile committed), native ESM — relative imports use explicit `.js` extensions.
- Never log phone numbers or other PII; correlate by `callId` and room name.
- See `.claude/skills/livekit-best-practices/SKILL.md`.
