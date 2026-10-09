# caller

Monorepo-style workspace with three independent npm projects, no shared root `package.json`. Each has its own `AGENTS.md` with project-specific conventions — read it before working inside that folder.

## Structure

- `front/` — Next.js 16 (App Router, TypeScript, Tailwind CSS v4, shadcn/ui). See `front/AGENTS.md`.
- `back/` — NestJS (TypeScript, ESM). See `back/AGENTS.md`.
- `agent/` — the PSTN voice agent (`@livekit/agents`, TypeScript, ESM), deployed separately to **LiveKit Cloud Agents**; talks to `back/` only over its internal HTTP API. See `agent/AGENTS.md`.

## Running locally

- Infrastructure: `docker compose up -d` from the repo root starts **Postgres** (5432) and **Redis** (6379, currently unused by the code). LiveKit is **not** run locally — the project uses **LiveKit Cloud** (hosted SFU, SIP, and Connectors).
- Migrations: `cd back && npm run migration:run` (own step, never on app boot).
- Frontend dev server: `cd front && npm run dev` (defaults to port 3000)
- Backend dev server: `cd back && npm run start:dev` (defaults to port 3001, API under `/api`, Swagger at `/docs`)
- PSTN calling agent: either deployed to LiveKit Cloud (`cd agent && lk agent deploy`) or run locally with `cd agent && npm run dev` — one of them must be up for `POST /users/:id/calls` to actually converse with the callee. A Cloud-deployed agent needs a publicly reachable `BACKEND_URL`. See `agent/AGENTS.md`.

`LIVEKIT_AGENT_NAME` and `AGENT_INTERNAL_TOKEN` must be identical in `back/.env` and the agent's env/Cloud secrets. The backend's `CORS_ORIGIN` (in `back/.env`) must match the frontend's origin, and any URL the frontend uses to call the API must match the backend's `PORT` + `/api` prefix. The backend's `DATABASE_*` vars (in `back/.env`) must match the Postgres credentials/port in the root `docker-compose.yml`, and its `LIVEKIT_*` vars must come from the LiveKit Cloud project (Settings → API keys; `LIVEKIT_URL` is the project's `wss://<project>.livekit.cloud` URL).

## Conventions across projects

- Package manager: npm (lockfiles are committed in every project folder — don't switch to yarn/pnpm).
- Each project is linted independently (`npm run lint` inside `front/` or `back/`; `npm run typecheck` in `agent/`); there is no root-level lint/build script.
- Database: PostgreSQL, run via the root `docker-compose.yml`. Backend connects via TypeORM — see `back/AGENTS.md`.
- Real-time voice: **LiveKit Cloud**. Real outbound PSTN calls go through Cloud's managed SIP using an outbound SIP trunk created in the Cloud project (`LIVEKIT_SIP_TRUNK_ID`) — no `livekit-sip` container to run (`back/specs/SPEC-02-pstn-ai-calling-agent.md`). Cloud-only features (Connectors such as WhatsApp calls, Krisp noise cancellation, inference gateway) are available. See `.claude/skills/livekit-best-practices/SKILL.md`.

## Specs

Non-trivial features (multi-file, ambiguous requirements, >~2h of work) get a spec before implementation — a short EARS-format document describing behavior and boundaries, not implementation. Small fixes/spikes don't need one.

- `front/specs/` and `back/specs/` hold one file per feature (`SPEC-NN-<slug>.md`); see each folder's `README.md` for the convention and current index.
- `.claude/agents/spec-creator.md` — drafts/updates a spec through a clarifying dialogue.
- `.claude/agents/plan-verifier.md` — cross-checks a finished implementation against its spec's acceptance criteria before merge.
