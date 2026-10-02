# back

NestJS (TypeScript, ESM) API.

## Stack

- **Framework**: NestJS 12, Express platform, native ESM (`"type": "module"` in `package.json` — internal relative imports use explicit `.js` extensions, e.g. `./app.module.js`).
- **Database**: PostgreSQL via TypeORM (`@nestjs/typeorm`), wired in `src/app.module.ts` (`TypeOrmModule.forRootAsync`). Run Postgres locally with `docker compose up -d` (root `docker-compose.yml`). `synchronize` is always off — schema changes go through migrations (see below), not auto-sync.
- **Validation**: `class-validator` / `class-transformer`, wired as a global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`) in `src/main.ts`.
- **Config**: `@nestjs/config`, global module, env validated against a typed class in `src/config/env.validation.ts`. Add new env vars there, not ad-hoc `process.env` reads.
- **Security**: `helmet()` applied globally; CORS restricted to `CORS_ORIGIN`.
- **Docs**: Swagger/OpenAPI served at `/docs` (`src/main.ts`, via `@nestjs/swagger`).
- **Errors**: `src/common/filters/all-exceptions.filter.ts` — global filter, normalizes every thrown error (Nest `HttpException` or not) into `{ statusCode, timestamp, path, message }`.
- **Testing**: Vitest (`vitest.config.ts` for unit, `vitest.config.e2e.ts` for e2e), not Jest.
- **Lint**: oxlint (`.oxlintrc.json`), not ESLint.

## Structure

- `src/app.module.ts` — root module, imports `ConfigModule`.
- `src/config/` — env validation/typing.
- `src/common/` — cross-cutting concerns (filters, and future guards/interceptors/pipes/decorators).
- `src/database/data-source.ts` — standalone TypeORM `DataSource` used only by the migration CLI (reads `.env` directly via `dotenv`, since the CLI runs outside Nest's DI/`ConfigModule`).
- `src/database/migrations/` — migration files, run via the TypeORM CLI (see Commands). Entities live next to their feature module as `*.entity.ts` (picked up by `autoLoadEntities` at runtime and by the glob in `data-source.ts` for the CLI).
- `src/main.ts` — bootstrap: `rawBody: true` + a JSON parser that also accepts `application/webhook+json` (LiveKit signs webhooks over the raw bytes), helmet, CORS, global pipe, global filter, global prefix (`/api`), Swagger setup, shutdown hooks.
- `src/users/` — the `User` entity (contact: name + E.164 `phoneNumber`), `GET`/`POST`/`PATCH /users(/:id)`, `POST /users/:id/messages`, `GET /users/:id/whatsapp-messages`, and the SMS routes re-exposed from `SmsService`. Exports `UsersService`.
- `src/whatsapp/` — `WhatsAppService` owns every Meta Cloud API detail (Graph URLs, token, templates), picks free-form vs. fallback-template delivery from the 24h session window, and logs every send attempt (`WhatsAppMessage` entity). `webhook/` holds Meta's verification handshake + event ingest in a **separate module** that imports `UsersModule`, so `UsersModule → WhatsAppModule` stays acyclic without `forwardRef()`.
- `src/sms/` — `SmsService` owns the Twilio SMS REST call and logs every attempt (`SmsMessage` entity), independent of WhatsApp's session-window logic. Routes live on `UsersController` (`POST`/`GET /users/:id/sms-messages`), same pattern as WhatsApp.
- `src/agent-settings/` — the single global `AgentSettings` row (system prompt) every call snapshots at start. `GET`/`PUT /agent-settings`.
- `src/calls/` — the `Call` entity + lifecycle (`CallsService`): places the outbound SIP call, enforces the one-call-per-user lock (partial unique index on `status = 'in_progress'`), dispatches the voice agent, and is the only writer the agent worker process talks to for transcript/status updates. `POST`/`GET /users/:id/calls`, `GET /users/:id/calls/:callId`.
- `src/livekit/` — `LiveKitService` owns the LiveKit credentials/`LiveKitAPI`: SIP dial-out (`dialOutboundSip`), explicit agent dispatch (`dispatchCallAgent`), room lifecycle, and webhook verification. `livekit-webhook.controller.ts` verifies the SFU's signature against the raw body (room/participant events, logged only).
- `src/agent-worker/main.ts` — a **separate process** (`npm run agent:dev` / `agent:start`), not part of the HTTP server. Registers with LiveKit as a named agent (`LIVEKIT_AGENT_NAME`) via `@livekit/agents`, and on each dispatched job runs the Deepgram STT → Claude (Anthropic) LLM → ElevenLabs TTS pipeline for one call, reusing `AppModule` via `NestFactory.createApplicationContext` purely for DI (`CallsService`, `ConfigService`) — never binds an HTTP port.
- Feature modules go alongside `app.module.ts` as `src/<feature>/` once added — generate with `nest g module/controller/service <feature>` to keep scaffolding consistent.

## Commands

- `npm run start:dev` — watch mode, default port 3001 (from `.env`, `PORT`).
- `npm run build` — compile via `nest build`.
- `npm run lint` — oxlint, type-aware.
- `npm run test` / `npm run test:e2e` — Vitest unit / e2e.
- `npm run migration:generate -- src/database/migrations/<Name>` — diff entities against the DB and generate a migration file (review the generated SQL before committing).
- `npm run migration:create -- src/database/migrations/<Name>` — scaffold an empty migration (for data migrations / anything not derivable from entity diffs).
- `npm run migration:run` — apply pending migrations. Run this as its own deploy step, never as a side effect of app boot.
- `npm run migration:revert` — roll back the last applied migration.
- `npm run agent:dev` / `npm run agent:start` — run the PSTN calling-agent worker (separate process from `start:dev`/`start:prod`; both need to be running for `POST /users/:id/calls` to actually hold a conversation).

## Env

Copy `.env.example` to `.env` (already done locally; `.env` is gitignored). Every var is validated at boot by `src/config/env.validation.ts` — a missing required one crashes the process rather than failing later.

- Core: `NODE_ENV`, `PORT` (default 3001), `CORS_ORIGIN` (must match the frontend's origin, default `http://localhost:3000`), `DATABASE_HOST`/`DATABASE_PORT`/`DATABASE_USER`/`DATABASE_PASSWORD`/`DATABASE_NAME` (must match the root `docker-compose.yml` Postgres service).
- WhatsApp (all required except where noted): `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_FALLBACK_TEMPLATE_NAME`, plus optional `WHATSAPP_API_VERSION` (default `v21.0`) and `WHATSAPP_FALLBACK_TEMPLATE_LANGUAGE` (default `en_US`).
- LiveKit (all required): `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` — must match the root `livekit.yaml`. `LIVEKIT_API_SECRET` must never reach the browser.
- PSTN calling agent (all required except where noted): `LIVEKIT_SIP_TRUNK_ID` (a stored LiveKit outbound SIP trunk id, created ahead of time against the SIP trunk vendor configured in the self-hosted `livekit-sip` service — see root `docker-compose.yml`/`sip-config.yaml`), `DEEPGRAM_API_KEY`, `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, plus optional `LIVEKIT_AGENT_NAME` (default `caller-voice-agent` — must match between the API and `npm run agent:dev`/`agent:start`), `CALL_MAX_DURATION_SECONDS` (default `600`), `DEEPGRAM_MODEL` (default `nova-2-phonecall`), `ANTHROPIC_MODEL` (default `claude-haiku-4-5-20251001`), `ELEVENLABS_MODEL` (default `eleven_turbo_v2_5`).
- SMS (all required): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM_NUMBER` — independent of the SIP trunk above (SMS and voice calling use different Twilio products).

## Conventions

- All HTTP routes are automatically prefixed with `/api` (`app.setGlobalPrefix('api')`) — don't repeat `api/` in `@Controller()` paths.
- DTOs for request bodies should use `class-validator` decorators — the global pipe strips/rejects unknown fields and rejects invalid ones automatically; no manual validation needed in handlers.
- Throw Nest's built-in `HttpException` subclasses (`BadRequestException`, `NotFoundException`, etc.) for expected error cases — the global filter formats them consistently.
