---
name: tanstack-query-best-practices
description: Current (Oct 2026, @tanstack/react-query v5.104) best practices for server state in `front/` — QueryClient defaults and the Next.js 16 App Router provider, query-key/`queryOptions` factories over `lib/api.ts`, polling with `refetchInterval` (call status, Telegram log), mutations + invalidation, optimistic updates, error handling, SSR prefetch/hydration, ESLint plugin and devtools. Use whenever writing, reviewing, or refactoring client-side data fetching, polling, `setInterval` + `api.*` calls, `router.refresh()` after a mutation, or anything touching `useQuery`/`useMutation`/`QueryClient`.
---

# TanStack Query in `front/`

Server state in client components goes through **`@tanstack/react-query` v5**. Do not hand-roll
`useState` + `useEffect` + `setInterval` + request-counter refs for fetching/polling — that is exactly
what the library replaces (stale-response races, background polling, retries, dedupe, cache sharing).

Not for forms (see `forms-best-practices`) and not for first paint in Server Components: a plain
`await api.…` in a server component is still right for data that never changes on the client.

> Docs move fast (latest at time of writing: `5.104.1`, 2026-10-02). When unsure about an API,
> look it up instead of trusting memory: Context7 library id **`/tanstack/query`**, or the pages
> linked below. Check the installed version first: `npm ls @tanstack/react-query` in `front/`.

## Setup (once)

```bash
cd front
npm i @tanstack/react-query
npm i -D @tanstack/eslint-plugin-query @tanstack/react-query-devtools
```

Keep all `@tanstack/*` packages on the same version.

**Provider** — `app/providers.tsx` (`'use client'`), mounted in `app/layout.tsx` around `{children}`
(next to `<Toaster />`). Server: new client per request; browser: one singleton. Do **not**
`useState(() => new QueryClient())` unless a Suspense boundary sits below it.

```tsx
"use client";
import { environmentManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { staleTime: 60_000 } }, // >0 so SSR data isn't refetched at once
  });
}
let browserQueryClient: QueryClient | undefined;
function getQueryClient() {
  if (environmentManager.isServer()) return makeQueryClient();
  return (browserQueryClient ??= makeQueryClient());
}

export function Providers({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>;
}
```

Docs: [Advanced SSR (App Router)](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr) ·
[Important defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults)

## Where things live

- `lib/api.ts` — stays the **only** place that calls the backend (see `front/AGENTS.md`). The
  `queryFn`s call `api.*`; never `fetch` in a component or in a `queryFn` directly.
- `lib/queries/<feature>.ts` — `queryOptions` factories + key factories (`calls.ts`, `telegram.ts`, `users.ts`).
- `hooks/use-<feature>.ts` — thin hooks composing queries/mutations when a component needs more than one.

## Rules

1. **`queryOptions` factories, one per query.** Co-locates key + fn, type-safe in `useQuery`,
   `setQueryData`, `invalidateQueries`, prefetch. Keys are arrays, hierarchical (general → specific),
   containing **every variable** the `queryFn` uses (the `exhaustive-deps` lint rule enforces this).
   ```ts
   export const callQueries = {
     all: () => ["calls"] as const,
     detail: (userId: string, callId: string) =>
       queryOptions({
         queryKey: [...callQueries.all(), userId, callId] as const,
         queryFn: ({ signal }) => api.getCall(userId, callId, { signal }),
       }),
   };
   ```
   Thread `signal` through `lib/api.ts` into `fetch` so unmounting/key changes cancel in-flight requests.
2. **Server state lives in the query cache, not in `useState`.** No copying `data` into state.
   Derive with `select` (stable reference or `useCallback`), not with an effect.
3. **Polling = `refetchInterval`, as a function that stops itself.** Return `false` at a terminal state.
   Default is to pause in background tabs (`refetchIntervalInBackground: false`) — keep that.
   ```ts
   useQuery({
     ...callQueries.detail(userId, callId),
     refetchInterval: (query) => (query.state.data?.status === "in_progress" ? 2500 : false),
   });
   ```
   Poll **while mounted** by mounting the observing component, not by ad-hoc intervals. If the
   status must outlive a dialog (the Call button lock), use the same query key from the list row —
   the cache is shared and requests are deduped. Docs: [Polling / Query retries](https://tanstack.com/query/latest/docs/framework/react/guides/query-retries).
4. **Retries.** Default is 3 retries with exponential backoff (1s → 30s cap). Keep it for reads.
   A *transient poll failure* needs **no empty `catch`**: the previous `data` stays and `isError`/
   `error` is set — render a subtle "reconnecting" hint only if `isError && data` (use
   `isRefetchError`), a full error only when there is no `data`. Never retry mutations by default
   (`retry: false` is the mutation default; sending an SMS twice is a bug). Don't retry 4xx:
   `retry: (n, err) => !(err instanceof ApiError && err.status < 500) && n < 3`.
5. **`staleTime` is the main tuning knob** (default `0` = always stale). Set it per query by how
   fresh the data must be; `gcTime` (default 5 min; v4's `cacheTime`) is only about memory.
   `refetchOnWindowFocus`/`refetchOnReconnect` stay on — they are free correctness.
6. **Status flags (v5):** `isPending` (no data yet), `isFetching` (any request), `isLoading` =
   `isPending && isFetching`. Mutations use `isPending` too (v4's `isLoading` is gone). Paginated /
   key-changing lists: `placeholderData: keepPreviousData` and gate "next" on `isPlaceholderData`.
7. **Conditional queries:** `enabled: Boolean(id)`, or `queryFn: id ? () => … : skipToken` for type safety.
   Never call hooks conditionally.
8. **Mutations: `useMutation` + invalidate in `onSuccess`**, return the promise so `isPending`
   stays true until the refetch finishes. Replaces `router.refresh()` for client-owned data:
   ```ts
   const place = useMutation({
     mutationFn: (userId: string) => api.placeCall(userId),
     onSuccess: (call, userId) => {
       queryClient.setQueryData(callQueries.detail(userId, call.id).queryKey, call); // seed
       return queryClient.invalidateQueries({ queryKey: callQueries.all() });
     },
     onError: (error) => toast.error(error.message),
   });
   ```
   Call `mutate`/`mutateAsync` from handlers; per-call callbacks (`mutate(vars, { onSuccess })`)
   don't fire if the component unmounted — put cache work in the hook-level callbacks.
   Mutations that change **server-rendered** data (the `app/users/` list is a `force-dynamic`
   Server Component) still need `router.refresh()`; do both or move that list to a query.
9. **Optimistic updates** only for cheap, low-risk UI (e.g. appending a sent Telegram message).
   Prefer the simple variant: render `mutation.variables` while `isPending` (or `useMutationState`).
   The cache variant: `onMutate` → `cancelQueries` → snapshot `getQueryData` → `setQueryData`;
   `onError` roll back; `onSettled` `invalidateQueries`. Docs: [Optimistic updates](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates).
10. **Errors.** `lib/api.ts` throws `ApiError` — register it so `error` is typed:
    `declare module "@tanstack/react-query" { interface Register { defaultError: ApiError } }`
    (v5 default is `Error`; use `unknown` if non-`ApiError` can escape). Cross-cutting toasts go in
    `new QueryCache({ onError })` / `MutationCache({ onError })` — **only** when you want it for
    every query; a global toast on a poll fires every interval. Prefer `meta: { errorMessage }`
    and toast only when `query.state.data === undefined`. Use `throwOnError` + an Error Boundary
    only for queries whose failure should blank the section.
11. **Query callbacks are gone.** `onSuccess`/`onError`/`onSettled` were removed from `useQuery` in
    v5 (still exist on mutations). Reacting to fetched data = derive during render or `useEffect`
    keyed on `data`; side effects belong in mutations.
12. **React Compiler / lint compat (this repo runs it):** don't read `query.data` into refs during
    render; no `setState` synchronously in an effect to mirror query data.
13. **SSR / hydration (optional).** Prefetch in a Server Component with a per-request `QueryClient`,
    pass `dehydrate(queryClient)` to `<HydrationBoundary>`, and read it via the **same
    `queryOptions`** in a Client Component. Treat the server component only as a prefetch site —
    don't render the awaited result there (it won't update on client refetch). Set `staleTime > 0`.
    Prefetch with `queryClient.prefetchQuery(...)` (works in every v5); newer docs also show
    `queryClient.query({...}).catch(noop)` as its replacement and mark `fetchQuery`/`prefetchQuery`/
    `ensureQueryData` as deprecated — **grep the installed `@tanstack/query-core` types for `query(`
    before using it**, and follow whatever the installed version exports. Don't put user-specific
    data in a module-level `QueryClient` on the server (cross-request leak). Docs: [Advanced SSR](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr).
14. **Tooling.** `@tanstack/eslint-plugin-query` recommended rules in `eslint.config.mjs`
    (`exhaustive-deps`, `no-rest-destructuring`, `stable-query-client`, `no-unstable-deps`,
    `prefer-query-options` where available) — [ESLint plugin docs](https://tanstack.com/query/latest/docs/eslint/eslint-plugin-query).
    `<ReactQueryDevtools initialIsOpen={false} />` inside the provider (dev-only, tree-shaken in prod).
15. **Tests.** Fresh `QueryClient` per test with `retry: false`, `gcTime: Infinity`; wrap in a
    provider; never share the singleton.

## How this repo applies it (done)

- Pages that must show a page-level error on load failure (`app/page.tsx`, `app/users/page.tsx`) fetch in
  the Server Component, `queryClient.setQueryData(options.queryKey, data)` on a `makeQueryClient()`, and wrap
  the client component in `<HydrationBoundary state={dehydrate(queryClient)}>`; the client reads it with
  `useSuspenseQuery(options)` (data is guaranteed, so no loading state). Newer server data re-hydrates on
  navigation.
- Mutations are consumed with `mutateAsync` inside the RHF submit handler (so `formState.isSubmitting`
  still drives disabled/blocked-close per `forms-best-practices`) and the component toasts on failure; the hook
  does only cache work.
- Telegram queries use `staleTime: 0` so each dialog open refetches immediately (cached data shows meanwhile).
- "Load earlier" pages are a user-initiated mutation accumulated in local state — not part of the polled query.

## Original migration map (kept for reference)

| Today | Becomes |
|---|---|
| `users-list.tsx` `setInterval` + `callsRef` + empty `.catch` | `useQuery` per in-progress call with function `refetchInterval`; `placeCall` as `useMutation` that seeds the cache |
| `use-telegram-conversation.ts` request-counter refs, `isPoll` flag, manual `loadState` | `useQuery` (`refetchInterval: 10_000`) for status + recent page; `useInfiniteQuery` (or a second query) for "load earlier"; `isPending`/`isError && !data` replace `LoadState`; send/delete as mutations (`setQueryData` / `invalidateQueries`), which removes the `latestRequestRef++` hacks |
| `router.refresh()` after create/edit | invalidate the users query (if the list moves to a query) or keep `router.refresh()` while the list stays a Server Component |

## Reading list (load only the page you need — don't paste whole docs into context)

- Overview & quick start: https://tanstack.com/query/latest/docs/framework/react/overview
- Important defaults: https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults
- Query keys / `queryOptions`: https://tanstack.com/query/latest/docs/framework/react/guides/query-options
- Mutations & invalidation: https://tanstack.com/query/latest/docs/framework/react/guides/mutations · https://tanstack.com/query/latest/docs/framework/react/guides/invalidations-from-mutations
- Query retries: https://tanstack.com/query/latest/docs/framework/react/guides/query-retries
- Query cancellation: https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation
- Paginated / infinite queries: https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries
- Advanced SSR (Next App Router): https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr
- TypeScript (`Register`, error/meta types): https://tanstack.com/query/latest/docs/framework/react/typescript
- Migrating to v5 (renames: `cacheTime→gcTime`, `isLoading→isPending`, `useErrorBoundary→throwOnError`, no query callbacks): https://tanstack.com/query/latest/docs/framework/react/guides/migrating-to-v5
- ESLint plugin: https://tanstack.com/query/latest/docs/eslint/eslint-plugin-query
- Releases / changelog: https://github.com/TanStack/query/releases
- Practical patterns (maintainer blog, TkDodo): https://tkdodo.eu/blog/practical-react-query

## Checklist before finishing

- [ ] No `setInterval`/`useEffect` fetching or request-counter refs left in the touched code
- [ ] Every query is a `queryOptions` factory; keys contain all `queryFn` variables
- [ ] Polling uses a `refetchInterval` function that returns `false` at terminal state
- [ ] `queryFn` goes through `lib/api.ts` and forwards `signal`
- [ ] Mutations invalidate/seed the cache; nothing mirrors `data` into `useState`
- [ ] No global error toast that would fire on every poll
- [ ] `npm run lint && npx tsc --noEmit` pass (eslint-plugin-query + React Compiler rules)
