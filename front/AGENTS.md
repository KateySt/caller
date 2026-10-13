# front

Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 + shadcn/ui.

## Stack

- **Framework**: Next.js 16, App Router, React 19, Turbopack dev server.
- **Styling**: Tailwind CSS v4 (CSS-based config, no `tailwind.config.ts` — theme tokens live in `app/globals.css` via `@theme inline`).
- **UI components**: shadcn/ui, `base-nova` style, `neutral` base color, icons from `lucide-react`. Config in `components.json`.
- **Forms**: `react-hook-form` + `zod` (`@hookform/resolvers`) for every form — schemas in `lib/schemas/`, shared `components/form-field.tsx` (`FormField`, `CharacterCounter`). Never hand-roll field/error/submitting `useState`. See the `forms-best-practices` skill.
- **Server state**: `@tanstack/react-query` v5 for every client-side read, poll and mutation — query options in `lib/queries/`, hooks in `hooks/`, client/provider in `lib/query-client.ts` + `app/providers.tsx`. Never `useState` + `useEffect`/`setInterval` + `api.*`. See the `tanstack-query-best-practices` skill.
- **Import alias**: `@/*` → project root (see `tsconfig.json`).

## Structure

- `app/` — routes, layouts, global styles (App Router conventions). `app/page.tsx` is the Agent Settings page (home); `app/users/` is the contact list (server component, `force-dynamic`); `app/users/[id]/` is a contact's activity timeline (calls + WhatsApp + SMS + Telegram, merged and sorted). The root layout mounts `<SiteHeader />` (nav between the three top-level pages: Agent Settings, Users, Agent Tests) and `<Toaster />`.
- `components/ui/` — shadcn-generated components (owned by you once added — edit freely, these are not a library dependency).
- `components/users-list.tsx` — the list plus a per-row action group (Message/Call/SMS/Edit) and the "Add contact" button. `create-user-dialog.tsx`, `edit-user-dialog.tsx`, `send-message-dialog.tsx`, `send-sms-dialog.tsx`, and `call-dialog.tsx` (forms built per `forms-best-practices`) are lifted above the rows and mounted only while open, so each open starts clean. The users page loads the list on the server and hydrates it into the query cache (`HydrationBoundary`); create/edit mutations invalidate `userQueries.all()` so the list refetches (no `router.refresh()`). In-progress call status is tracked by `useTrackedCalls` (`hooks/use-calls.ts`, a polled `callQueries.detail` per call) rather than inside the dialog, so the "Call" button's disabled state survives the dialog being closed and reopened.
- `components/telegram-dialog.tsx` — per-contact Telegram view (`front/specs/SPEC-03`), opened from the row's "Telegram" button in `users-list.tsx`; a thin composition of `telegram-invite-panel.tsx` (status label, generate/copy link with confirm), `telegram-conversation-log.tsx` (history, load earlier, scroll-follow), `telegram-composer.tsx` (RHF + zod message form, gated by status) and the delete-history confirm. Server state and the 10 s poll (only while mounted) live in `hooks/use-telegram-conversation.ts` (queries) and `hooks/use-telegram-mutations.ts` (invite/send/delete).
- `components/agent-settings-form.tsx` — the system-prompt editor on the home page.
- `components/user-activity-timeline.tsx` — merges a contact's calls/WhatsApp/SMS/Telegram (latest 50) history into one chronological list; each source that failed to load reports its own error without hiding the others.
- Agent test console (`front/specs/SPEC-05`) — `components/agent-settings-workspace.tsx` puts the settings form and `agent-test-panel.tsx` (+ `-live`, `-transcript`, `-ended`) side by side; the panel uses the vendored Agents UI components in `components/` (`agent-session-provider`, `agent-control-bar`, `agent-track-*`, `agent-disconnect-button`, `agent-audio-visualizer-bar`, `start-audio-button`, plus `ui/{select,toggle}.tsx`). Access is gated by `components/admin-secret-gate.tsx`; the admin key lives in `sessionStorage` via `lib/admin-secret.ts` (`useAdminSecret`) and is never in a query key or URL. Queries: `lib/queries/agent-tests.ts` (a 401 forgets the key); hooks: `hooks/use-agent-tests.ts` (list, polled detail, create/end), `use-agent-control-bar`, `use-agent-audio-visualizer-bar`, `use-is-secure-context`; display helpers: `lib/agent-test-format.ts`. All backend text (prompt, transcript, failure reason) renders as plain text.
- `app/agent-tests/` — test history: `page.tsx` renders `components/agent-test-history.tsx` (list, polls while any session is in progress), `[id]/page.tsx` renders `components/agent-test-detail.tsx` (full prompt + transcript, polled while in progress). Both sit inside `AdminSecretGate`; linked from the site header ("Agent Tests") and the settings page.
- `lib/schemas/` — zod schemas (`fields.ts` helper, `user.ts`, `messages.ts`, `telegram.ts`, `agent-settings.ts`, `admin-secret.ts`) used by react-hook-form resolvers.
- `components/form-field.tsx` — label + control + accessible error wiring shared by all forms.
- `lib/queries/` — `queryOptions` + key factories per feature (`users`, `calls`, `telegram`, `agent-settings`, `agent-tests`); every `queryFn` goes through `lib/api.ts` and forwards the abort `signal`.
- `lib/query-client.ts` — `QueryClient` defaults (60 s `staleTime`, no retry on 4xx), `getQueryClient()` (browser singleton / per-request server client) and the `defaultError: ApiError` registration. `app/providers.tsx` mounts it (plus devtools) in the root layout.
- `hooks/` — client hooks wrapping queries/mutations (`use-calls`, `use-telegram-conversation`, `use-telegram-mutations`, `use-user-mutations`, `use-send-mutations`, `use-agent-settings`). Dialog/form components call `mutateAsync` inside the RHF submit handler and toast on failure; cache work (`setQueryData`/`invalidateQueries`) lives in the hook.
- `lib/api.ts` — the typed client for the backend. All API access goes through it; don't `fetch` the backend directly from a component.
- `lib/utils.ts` — shadcn's `cn()` helper and other shared utilities.

## Commands

- `npm run dev` — start dev server (Turbopack), default port 3000.
- `npm run build` / `npm run start` — production build/serve.
- `npm run lint` — ESLint (flat config in `eslint.config.mjs`).

## Adding shadcn components

Use `npx shadcn@latest add <component>` rather than hand-writing primitives — it respects the config in `components.json` and keeps styling consistent.

## Skills

When writing, reviewing, or refactoring code in this project, use these skills proactively (no need to wait for the user to ask):

- `vercel-react-best-practices` — React/Next.js performance (components, pages, data fetching, bundling).
- `vercel-composition-patterns` — component API design (compound components, render props, context) when refactoring prop-heavy components or building reusable UI.
- `vercel-react-view-transitions` — page/route animations and enter/exit transitions via the View Transition API.
- `tanstack-query-best-practices` — client-side data fetching, polling, mutations (`@tanstack/react-query`); use instead of `setInterval` + `api.*` + manual state.
- `forms-best-practices` — any form or input validation (react-hook-form + zod + `FormField`); always use it for forms.
- `livekit-best-practices` — anything touching `livekit-client` / `@livekit/components-react` (see `.claude/skills/`).

## Backend

The API lives in `../back` (NestJS). It's not in this project's dependency tree — call it over HTTP. Default dev URL: `http://localhost:3001/api`, overridable with `NEXT_PUBLIC_API_BASE_URL` (see `.env.local.example`). Backend CORS is locked to the frontend's origin via `CORS_ORIGIN` in `back/.env`.

## Calling

`call-dialog.tsx` is a **live view**, not a calling client — it does not join any room itself. `POST /users/:id/calls` tells the backend to place a real outbound PSTN call (LiveKit Cloud SIP + an AI voice agent own the actual call, in `back/`); the frontend only polls `GET /users/:id/calls/:callId` for status/transcript and renders it. The one exception is the admin **test console** (`front/specs/SPEC-05-browser-agent-test-console.md`): `agent-test-panel*.tsx`, next to the settings form, joins a test room from the browser with `livekit-client` and the vendored Agents UI components (`agent-session-provider`, `agent-control-bar`, … in `components/`). `call-dialog.tsx` and real calls are unchanged, and the previous in-app browser-to-browser demo call stays retired (`back/specs/SPEC-02-pstn-ai-calling-agent.md`, `front/specs/SPEC-02-pstn-call-and-agent-settings.md`).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
