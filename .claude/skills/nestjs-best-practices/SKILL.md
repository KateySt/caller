---
name: nestjs-best-practices
description: Official and current (NestJS 12) backend best practices — architecture, DI, DTOs/validation, security, error handling, observability, testing, performance, graceful shutdown. Use whenever writing, reviewing, or refactoring NestJS code — controllers, services, modules, providers, DTOs, guards, interceptors, pipes, middleware, exception filters, config, auth, or tests (e.g. anything under back/).
license: MIT
metadata:
  author: self
  version: "1.0.0"
---

# NestJS Best Practices

Practical, current-as-of-2026 guidelines for building NestJS backends, grounded in the
official NestJS docs and the NestJS 12 toolchain (native ESM packages, Standard Schema
validation, Vitest, oxlint, `@nestjs/observe`). Apply these whenever writing or reviewing
backend code — tailor to the stack actually in use in a given project (check its own
`AGENTS.md`/`CLAUDE.md` first; project conventions win over generic defaults below).

## When to Apply

- Writing or editing a controller, service, module, provider, DTO, guard, interceptor,
  pipe, middleware, or exception filter.
- Adding config, env vars, auth, rate limiting, or logging to a Nest app.
- Writing unit/e2e tests for Nest code.
- Reviewing a PR that touches a NestJS backend.

## Quick Reference

| # | Category | Priority |
|---|----------|----------|
| 1 | Module & layer boundaries | HIGH |
| 2 | DTOs vs entities, validation | HIGH |
| 3 | Dependency injection & providers | HIGH |
| 4 | Error handling | HIGH |
| 5 | Security | HIGH |
| 6 | Config & fail-fast boot | HIGH |
| 7 | Guards / interceptors / pipes / middleware | MEDIUM |
| 8 | Observability & logging | MEDIUM |
| 9 | Testing | MEDIUM |
| 10 | Performance & resilience | MEDIUM |
| 11 | Graceful shutdown & deploy | MEDIUM |
| 12 | ESM specifics | LOW-MEDIUM |

---

### 1. Module & Layer Boundaries (HIGH)

- Controllers only route and translate HTTP ↔ DTOs. All business logic lives in
  services/providers — a controller method body should mostly be "call a service,
  return its result."
- Feature modules (`src/<feature>/`) export only what other modules actually need to
  inject; keep internals (repositories, helper providers) unexported.
- Reserve `@Global()` for genuinely cross-cutting concerns (config, logging) — using it
  for feature modules defeats module boundaries and hides real dependencies.
- Prefer the repository pattern to isolate persistence from business logic, even before
  a concrete ORM/DB is chosen — makes swapping storage later cheap.

### 2. DTOs vs Entities, Validation (HIGH)

- Never return a DB entity directly from a controller — it leaks internal fields, locks
  the API to the schema, and makes changes expensive. Map to a response DTO (or use
  `class-transformer`'s `@Exclude`/serialization) at the boundary.
- Two validation strategies exist in NestJS 12 — pick one per project (don't mix styles
  within the same module):
  - **class-validator + `ValidationPipe`** (classic, decorator-based):
    ```ts
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,            // strip properties without decorators
      forbidNonWhitelisted: true, // reject instead of silently stripping
      transform: true,            // coerce primitives to DTO types
    }));
    ```
  - **Standard Schema** (new in v12 — Zod/Valibot/ArkType, schema-first, type inferred):
    ```ts
    app.useGlobalPipes(new StandardSchemaValidationPipe());

    export const createUserSchema = z.object({
      email: z.email(),
      password: z.string().min(8),
    });
    export type CreateUserDto = z.infer<typeof createUserSchema>;

    @Post()
    create(@Body({ schema: createUserSchema }) dto: CreateUserDto) {}
    ```
  - Both pipes can coexist during a migration (`ValidationPipe` only touches
    class-typed params, `StandardSchemaValidationPipe` only touches schema-declared
    ones) — don't force a rewrite just to "modernize."
- Cap list/page sizes server-side (don't trust a client-supplied `limit`) to avoid
  memory exhaustion on large collections.

### 3. Dependency Injection & Providers (HIGH)

- Prefer constructor injection; keep constructors thin (just assignment).
- Default to singleton scope. Reach for `REQUEST`-scoped providers only when you truly
  need per-request state, and know the cost: a request-scoped provider forces every
  provider in its injection chain to become request-scoped too, which hurts throughput.
  Prefer `AsyncLocalStorage` for per-request context instead.
- Break circular dependencies by extracting the shared piece into its own
  module/provider rather than reaching for `forwardRef()` as a default fix.

### 4. Error Handling (HIGH)

- Throw Nest's built-in `HttpException` subclasses (`BadRequestException`,
  `NotFoundException`, `ConflictException`, etc.) for expected failure cases — don't
  hand-roll status codes.
- Centralize formatting in a global exception filter so every error (Nest
  `HttpException` or not) comes back in one consistent shape; catch-all filters should
  still log the original error server-side even when they normalize the client response.
- Don't leak internal error detail (stack traces, DB error text) to clients in
  production — set `disableErrorMessages` or filter it in the exception filter.

### 5. Security (HIGH)

- Apply `helmet()` globally in `main.ts`.
- Configure CORS with an explicit allow-list origin — never `origin: '*'` in production.
- Rate-limit with `@nestjs/throttler` (`ThrottlerModule.forRoot(...)`), and apply
  stricter limits on sensitive endpoints (login, password reset, signup).
- Default to **deny-by-default auth**: make a global `AuthGuard` the default and opt
  individual routes out with an explicit `@Public()` decorator, rather than opting
  routes in one by one — forgetting to guard a new route becomes impossible to miss in
  review.
- Hashing: never use bcrypt's default cost factor of 10 in production; 12 is a
  realistic 2026 minimum, 14 if traffic can absorb the extra latency per login.
- Require `Idempotency-Key` on mutating endpoints that clients may retry (payments,
  order creation), backed by a shared store, so retries can't double-apply a write.
- Don't expose Swagger UI/JSON publicly in production unless intentionally documented
  as a public API — gate it behind env check or auth.

### 6. Config & Fail-Fast Boot (HIGH)

- Validate all env vars against a typed schema/class at startup (`@nestjs/config` +
  a validation schema) — a missing or malformed var should crash the process before it
  accepts traffic, not fail mysteriously on first use.
- Use `configService.getOrThrow('KEY')` for required values instead of `process.env.KEY`
  with an implicit `undefined` fallback.
- Keep secrets in the platform's secret store / env, never baked into images or
  committed files.

### 7. Guards / Interceptors / Pipes / Middleware (MEDIUM)

Execution order on a request: **middleware → guards → interceptors (before) → pipes →
route handler → interceptors (after) → exception filters (on throw)**. Pick the right
layer for the job:
- **Middleware** — framework-agnostic, no access to the execution context's handler
  metadata (logging, body parsing extras).
- **Guards** — authorization/authentication decisions (`canActivate` returns
  true/false) — the only layer that should block a request based on who's calling.
- **Interceptors** — cross-cutting behavior around the handler: logging, timeout,
  response mapping/serialization, caching.
- **Pipes** — transform/validate the specific arguments bound to a handler.

### 8. Observability & Logging (MEDIUM)

- Use structured (JSON) logging in production — Nest's built-in `ConsoleLogger`
  supports a JSON mode and custom prefixes; avoid ad-hoc `console.log`.
- For distributed tracing / auto-instrumentation (HTTP, queues, cron, microservice
  transports), NestJS 12 ships `@nestjs/observe`: wire `createObserveModule()`, import
  `ObserveModule.forRoot({...})` in the root module, and pass the returned
  `ObserveInstrument` to `NestFactory.create(AppModule, { instrument })`.
- Separate liveness from readiness checks (don't make liveness depend on downstream
  services — that causes unnecessary restarts).

### 9. Testing (MEDIUM)

- Use `@nestjs/testing`'s `Test.createTestingModule({...})` to build a real DI
  container for unit tests, overriding only the providers you need to fake
  (`overrideProvider`) — don't hand-construct services with `new`.
- Keep unit tests fast and isolated (mock repositories/HTTP clients); reserve e2e tests
  (`supertest`-style, hitting the Nest app via `app.getHttpServer()`) for verifying
  routing, guards, and validation pipes wired together.
- If the project uses Vitest (NestJS 12 default) rather than Jest, use `vi.fn()` /
  `vi.mock()` — don't mix Jest globals into a Vitest config.

### 10. Performance & Resilience (MEDIUM)

- Put a timeout on every outbound call (HTTP clients, DB queries) — a few seconds is a
  reasonable default; an un-timed-out dependency can hang the whole request.
- Size DB connection pools with real numbers: `pool size × peak replica count` must stay
  under the database's max connections, or add a pooler (e.g. PgBouncer).
- For calls to flaky external dependencies, use circuit breakers/bulkheads/fallbacks
  (e.g. `@nestjs/resilience`) instead of letting one failing dependency cascade.
- Avoid accidentally request-scoped provider chains (see §3) — they silently disable
  singleton reuse and hurt throughput under load.

### 11. Graceful Shutdown & Deploy (MEDIUM)

- Enable shutdown hooks (`app.enableShutdownHooks()`) so `OnModuleDestroy` /
  `OnApplicationShutdown` cleanup actually runs on `SIGTERM` during deploys/rolling
  restarts.
- Add a short `preStop` delay and use `return503OnClosing` so in-flight traffic drains
  before the process exits, instead of dropping connections immediately.
- Guard scheduled jobs (`@Cron`, etc.) against double-execution across replicas with a
  shared lock — don't assume only one instance is running.
- Run DB migrations as a separate deploy step before new replicas start, never as a
  side effect of app bootstrap; keep schema changes backward-compatible with the
  previous app version during rollout.

### 12. ESM Specifics (LOW-MEDIUM)

Relevant when a project's `package.json` has `"type": "module"` (NestJS 12 default):
- Internal relative imports need explicit extensions: `import { AppModule } from
  './app.module.js'` (not `.ts`, and not extensionless) — this trips people up moving
  from CommonJS Nest projects.
- `__dirname`/`__filename` aren't available — use `import.meta.url` with
  `fileURLToPath` if a file path is genuinely needed.
- CommonJS-only third-party packages may need `createRequire` or a dynamic `import()`
  workaround; check for an ESM build first before reaching for that.

## Project-Specific Notes

Always check the target repo's own `AGENTS.md`/`CLAUDE.md` for the actual stack choices
(validation library, test runner, linter, DB/ORM, auth strategy) — those override the
generic defaults above. For example, a project may already have a global exception
filter, a typed env-validation class, or a chosen validation library; extend what
exists rather than introducing a second, competing pattern.
