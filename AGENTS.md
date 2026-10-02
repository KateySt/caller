# caller

Monorepo-style workspace with two independent npm projects, no shared root `package.json`. Each has its own `AGENTS.md` with project-specific conventions — read it before working inside that folder.

## Structure

- `front/` — Next.js 16 (App Router, TypeScript, Tailwind CSS v4, shadcn/ui). See `front/AGENTS.md`.
- `back/` — NestJS (TypeScript, ESM). See `back/AGENTS.md`.

## Running both

- Infrastructure: `docker compose up -d` from the repo root starts **Postgres** (5432), a self-hosted **LiveKit SFU** (7880 HTTP/WS, 7881 TCP, 7882/udp, `livekit.yaml`), **Redis** (6379 — required for the SIP server to coordinate with the SFU), and the self-hosted **LiveKit SIP server** (5060/udp + 10000-10100/udp, `sip-config.yaml`) that bridges a SIP trunk vendor to the PSTN calling-agent feature.
- Migrations: `cd back && npm run migration:run` (own step, never on app boot).
- Frontend dev server: `cd front && npm run dev` (defaults to port 3000)
- Backend dev server: `cd back && npm run start:dev` (defaults to port 3001, API under `/api`, Swagger at `/docs`)
- PSTN calling agent worker: `cd back && npm run agent:dev` — a **separate process** from the API server; both must be running for `POST /users/:id/calls` to actually converse with the callee. See `back/AGENTS.md`.

The backend's `CORS_ORIGIN` (in `back/.env`) must match the frontend's origin, and any URL the frontend uses to call the API must match the backend's `PORT` + `/api` prefix. The backend's `DATABASE_*` vars (in `back/.env`) must match the Postgres credentials/port in the root `docker-compose.yml`, and its `LIVEKIT_*` vars must match the key/secret/port in `livekit.yaml`.

## Conventions across both projects

- Package manager: npm (lockfiles are committed in both folders — don't switch to yarn/pnpm).
- Each project is linted independently (`npm run lint` inside `front/` or `back/`); there is no root-level lint/build script.
- Database: PostgreSQL, run via the root `docker-compose.yml`. Backend connects via TypeORM — see `back/AGENTS.md`.
- Real-time voice: self-hosted LiveKit, run via the root `docker-compose.yml`. The dev key/secret in `livekit.yaml` are localhost-only placeholders. Note the capability split — WhatsApp **calls** need LiveKit's Connectors, which are LiveKit Cloud-only; the self-hosted server supports in-app (browser ↔ browser) voice and, with the added `livekit-sip` service, real outbound PSTN calls (`back/specs/SPEC-02-pstn-ai-calling-agent.md`). See `.claude/skills/livekit-best-practices/SKILL.md`.
- The `livekit-sip`/`sip-config.yaml` setup here is dev-only: a real SIP trunk vendor needs this server reachable from the public internet on its SIP + RTP ports, which a local Docker Desktop setup does not provide.

## Specs

Non-trivial features (multi-file, ambiguous requirements, >~2h of work) get a spec before implementation — a short EARS-format document describing behavior and boundaries, not implementation. Small fixes/spikes don't need one.

- `front/specs/` and `back/specs/` hold one file per feature (`SPEC-NN-<slug>.md`); see each folder's `README.md` for the convention and current index.
- `.claude/agents/spec-creator.md` — drafts/updates a spec through a clarifying dialogue.
- `.claude/agents/plan-verifier.md` — cross-checks a finished implementation against its spec's acceptance criteria before merge.
