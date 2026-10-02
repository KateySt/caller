---
name: livekit-best-practices
description: Current (Oct 2026) LiveKit best practices for this repo — access tokens & grants, server APIs via LiveKitAPI, webhook verification in NestJS, Next.js client connection, SIP telephony, the WhatsApp/Twilio Connectors, and the Cloud-vs-self-hosted capability split. Use whenever writing, reviewing, or planning code that touches LiveKit — token endpoints, rooms, participants, egress, SIP, connectors, agents, or `livekit-client`/`@livekit/components-react` in the frontend.
license: MIT
metadata:
  author: self
  version: "1.0.0"
  verified-against: "livekit-server-sdk 2.19.1 · livekit-client 2.22.3 · @livekit/components-react 2.9.24 · @livekit/agents 1.9.1 · docs.livekit.io as of 2026-10-02"
---

# LiveKit Best Practices

Everything below was checked against the **published** package typings and the current docs
(not from memory). LiveKit's docs were restructured in 2026 into `/intro/`, `/frontends/`,
`/transport/`, `/telephony/`, `/agents/`, `/deploy/`, `/reference/` — old `/home/...` URLs
still resolve but are stale. Project conventions in `AGENTS.md` / `back/AGENTS.md` /
`front/AGENTS.md` win over anything generic here.

## When to Apply

- Adding or reviewing a token-minting endpoint, or anything that signs a LiveKit JWT.
- Calling LiveKit server APIs (rooms, participants, egress, ingress, SIP, connectors).
- Receiving LiveKit webhooks.
- Wiring `livekit-client` / `@livekit/components-react` into `front/`.
- Planning telephony (PSTN/SIP) or WhatsApp/Twilio calling — see §2 first, it decides feasibility.

---

## 0. Cheap documentation lookup (read this before searching)

Don't guess LiveKit APIs and don't crawl the docs site. In rough cost order:

1. **Exact types, zero ambiguity** — fetch the shipped `.d.ts` from unpkg. Fastest and
   authoritative; this is how every fact in this skill was verified:
   ```bash
   curl -s https://unpkg.com/livekit-server-sdk@2.19.1/dist/index.d.ts          # full export list
   curl -s https://unpkg.com/livekit-server-sdk@2.19.1/dist/SipClient.d.ts      # one class
   curl -s https://unpkg.com/livekit-server-sdk@2.19.1/dist/ConnectorClient.d.ts
   ```
2. **Per-section `llms.txt` index** — each docs section publishes a compact URL index. Fetch
   the index, then the one page you need. Never fetch the root `llms-full.txt` (enormous):

   | Index | Covers |
   |---|---|
   | `https://docs.livekit.io/intro/llms.txt` | rooms/participants/tracks, webhooks & events, Cloud overview |
   | `https://docs.livekit.io/frontends/llms.txt` | tokens, sessions, React quickstart, media/data/RPC, agent state |
   | `https://docs.livekit.io/reference/llms.txt` | server SDK + client SDK typedocs, RoomService API, egress/ingress API |
   | `https://docs.livekit.io/telephony/llms.txt` | SIP trunks, dispatch rules, outbound calls, providers, DTMF, transfers, **connectors** |
   | `https://docs.livekit.io/transport/llms.txt` | self-hosting (local/VM/k8s/distributed), SIP server, ports & firewall, benchmarking |
   | `https://docs.livekit.io/agents/llms.txt` | agents framework, sessions, tools, workflows |
   | `https://docs.livekit.io/deploy/llms.txt` | Cloud deployment, secrets, quotas & limits |

3. **context7** — library id `/websites/livekit_io` (29k snippets) for conceptual "how do I X"
   questions. `/websites/livekit_io_agents` for the agents framework specifically.

Gotchas: appending `.md` to a docs URL works for *some* paths and 404s on others — if `.md`
404s, retry without it. Typedoc lives under `https://docs.livekit.io/reference/server-sdk-js/`
and `.../client-sdk-js/`.

## Quick Reference

| # | Category | Priority |
|---|----------|----------|
| 1 | Packages & env vars | HIGH |
| 2 | Cloud vs self-hosted capability split | HIGH |
| 3 | Access tokens & grants | HIGH |
| 4 | Server API access | HIGH |
| 5 | Webhooks in NestJS | HIGH |
| 6 | Frontend (Next.js) connection | HIGH |
| 7 | Telephony: SIP & Connectors | MEDIUM-HIGH |
| 8 | Media, bandwidth, quality | MEDIUM |
| 9 | Agents | MEDIUM |
| 10 | Testing | MEDIUM |
| 11 | Ops & observability | MEDIUM |

---

### 1. Packages & Env Vars (HIGH)

Backend (`back/`) needs exactly one package for everything except joining a room as a bot:

```
livekit-server-sdk@^2.19       # tokens, room/egress/ingress/SIP/connector APIs, webhook verification
@livekit/protocol              # transitive, but import RoomConfiguration/RoomAgentDispatch from it directly
@livekit/rtc-node@^1.1         # ONLY if the server itself must join a room and handle media
```

Frontend (`front/`):

```
livekit-client@^2.22
@livekit/components-react@^2.9     # peers: react >=18, livekit-client ^2.20.1
@livekit/components-styles
```

Notes verified from the packages:
- `livekit-server-sdk` is **ESM-first** (`"type": "module"`, dual `import`/`require` exports) and
  declares `engines.node >= 19`. That lines up with `back/`'s ESM setup — remember the `.js`
  extension rule on *your own* relative imports (see `nestjs-best-practices` §12).
- The published package is `livekit-server-sdk`. A rename to `@livekit/server-sdk` appears in the
  GitHub monorepo README but **is not on npm** — don't use that name.
- Standard env var names, which the SDK reads automatically when you omit constructor args:
  `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_TOKEN`.
- One `LIVEKIT_URL` is enough for both sides. Set it to the `wss://` URL and hand that to the
  browser; the server SDK rewrites `ws*` → `http*` internally for its Twirp calls.
- Add all three to `back/src/config/env.validation.ts` so a missing secret crashes at boot, per
  the project's fail-fast config convention. Only `LIVEKIT_URL` may ever be exposed as
  `NEXT_PUBLIC_*`. **`LIVEKIT_API_SECRET` must never reach the browser or a client bundle.**

### 2. Cloud vs Self-Hosted Capability Split (HIGH)

This is the first thing to check for any new LiveKit feature — it has already redirected this
repo's plan once (see `PLAN.md`).

| Capability | Self-hosted `livekit-server` | LiveKit Cloud |
|---|---|---|
| Core SFU: rooms, tracks, data, RPC | ✅ | ✅ |
| Egress / Ingress | ✅ (extra services + Redis) | ✅ |
| Agents framework | ✅ | ✅ |
| PSTN calling via SIP | ✅ — run `livekit-sip` + a trunk provider (Twilio/Telnyx/Plivo/Sinch) | ✅ |
| **Connectors (WhatsApp, Twilio Media Streams)** | ❌ **"Connectors are available in LiveKit Cloud only. Self-hosted LiveKit servers are not supported."** | ✅ (outbound WhatsApp limited to certain regions; must be enabled per project) |
| Token revocation on `RemoveParticipant` | ❌ existing JWTs stay valid | ✅ via `nbf` cutoff |
| Regional failover (`failover` option) | ❌ ignored | ✅ |
| Enhanced noise cancellation (Krisp) | ❌ | ✅ |
| Multi-region | ✅ possible, via shared Redis (`/transport/self-hosting/distributed`) | ✅ built in |

Consequence for this repo: in-app voice (browser ↔ browser) works fine on the local Docker
`livekit-server`. A real WhatsApp call needs a LiveKit Cloud project. A plain phone call needs
`livekit-sip` + a SIP trunk. Don't design a feature that silently assumes Cloud.

### 3. Access Tokens & Grants (HIGH)

```ts
import { AccessToken, type VideoGrant } from 'livekit-server-sdk';

const at = new AccessToken(apiKey, apiSecret, {
  identity: user.id,        // opaque, stable, unique per participant
  name: user.displayName,   // display-only
  ttl: '10m',
});
at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true } satisfies VideoGrant);
const jwt = await at.toJwt();   // async — await it
```

Rules:
- **Mint tokens server-side only**, and derive `identity` and `room` from the authenticated
  session — never from the request body. A token endpoint that trusts client-supplied identity
  lets any caller impersonate any participant and join any room. In `back/` this means the
  endpoint sits behind the normal auth guard, not `@Public()`.
- **Short TTL.** `10m` is the documented default for a join token. The server auto-refreshes
  tokens mid-session (refreshed tokens last 10 min or the original remaining lifetime, whichever
  is longer), so a short TTL costs nothing. Long TTLs are the whole security story on
  self-hosted, where removing a participant does **not** invalidate their token.
- **No PII in `identity` or `room`.** Straight from the docs: these fields are logged throughout
  LiveKit's infrastructure and are *not* covered by PII redaction. Use UUIDs — e.g. `User.id`,
  not `User.phoneNumber`. Put anything human-readable in `name`/`metadata`/`attributes`.
- **Least privilege.** Grant only what the participant needs. Note the footgun: *if neither
  `canPublish` nor `canSubscribe` is set, both are enabled.* Be explicit. Prefer
  `canPublishSources: [TrackSource.MICROPHONE]` over a blanket `canPublish` for an audio-only
  feature — it supersedes `canPublish`. Keep `roomCreate`/`roomList`/`roomAdmin`/`roomRecord`
  out of participant tokens entirely; those belong to backend service calls.
- `canUpdateOwnMetadata` is off by default — leave it off unless the client genuinely needs it.
- Grant groups: `VideoGrant` (rooms/tracks), `SIPGrant` (`admin` = manage trunks/rules,
  `call` = `CreateSIPParticipant`), plus `InferenceGrant` / `ObservabilityGrant`.
- Change permissions mid-session with the `UpdateParticipant` API rather than reissuing a token
  and reconnecting.
- Reference: `https://docs.livekit.io/frontends/reference/tokens-grants` ·
  `https://docs.livekit.io/frontends/build/authentication`

### 4. Server API Access (HIGH)

Prefer the unified `LiveKitAPI` entry point over constructing each client by hand:

```ts
import { LiveKitAPI } from 'livekit-server-sdk';

// All of host/apiKey/secret fall back to LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET
const api = new LiveKitAPI({ requestTimeout: 10 });   // seconds

await api.room.createRoom({ name: 'room-1', emptyTimeout: 300 });
await api.sip.createSipParticipant(/* … */);
await api.connector.dialWhatsAppCall(/* … */);
```

`api` exposes `.room` (`RoomServiceClient`), `.egress`, `.ingress`, `.sip`, `.agentDispatch`,
`.connector`. Two auth modes, mutually exclusive: `{ apiKey, secret }` (backend — use this) or
`{ token }` (pre-signed, client-side).

- Wrap it in a single injectable Nest provider (e.g. `LiveKitService` in `back/src/livekit/`) so
  no other module touches keys or SDK classes directly — the same boundary the plan already uses
  for `WhatsAppService`. Instantiate once (singleton), not per request.
- **Always set `requestTimeout`.** Per project convention every outbound call needs a timeout;
  the SDK's own option is cleaner than racing an `AbortSignal`.
- Catch `TwirpError` / `ServerError` (and `SipCallError` for SIP) and rethrow as the appropriate
  Nest `HttpException` — typically `BadGatewayException` with a sanitized message, full detail
  logged server-side, so `AllExceptionsFilter` formats the response.
- Rooms auto-create when the first participant joins. Only call `createRoom` explicitly when you
  need non-default settings up front (`emptyTimeout`, `maxParticipants`, egress config, agent
  dispatch).
- Required grants per method (useful when scoping a service token):
  `createRoom`/`deleteRoom` → `roomCreate`; `listRooms` → `roomList`; everything
  participant/track/metadata-related (`listParticipants`, `getParticipant`, `removeParticipant`,
  `mutePublishedTrack`, `updateParticipant`, `updateSubscriptions`, `updateRoomMetadata`) →
  `roomAdmin`.
- Reference: `https://docs.livekit.io/reference/other/roomservice-api`

### 5. Webhooks in NestJS (HIGH)

LiveKit signs webhooks and sends them with content type **`application/webhook+json`**.
Verification requires the **raw body string** — a parsed object will fail.

```ts
import { WebhookReceiver } from 'livekit-server-sdk';

const receiver = new WebhookReceiver(apiKey, apiSecret);
const event = await receiver.receive(rawBody, authorizationHeader);
```

NestJS-specific wiring, in order of what actually bites:

1. Create the app with `rawBody: true` and teach the JSON parser about LiveKit's MIME type —
   otherwise no parser matches, `req.rawBody` is never populated, and verification fails:
   ```ts
   const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
   app.useBodyParser('json', { type: ['application/json', 'application/webhook+json'] });
   ```
   Then read it with `@Req() req: RawBodyRequest<Request>` → `req.rawBody!.toString('utf8')`.
2. **Exempt the webhook route from the global `ValidationPipe`.** With
   `whitelist`/`forbidNonWhitelisted` on, LiveKit's payload shape gets rejected or stripped.
   Validate by signature, not by DTO.
3. **Exempt it from global auth** (`@Public()` or equivalent) — the `Authorization` header is
   LiveKit's signed JWT, not your session token. The signature *is* the authentication; never
   skip `receiver.receive()` and trust the body.
4. **Return 2xx fast and never throw.** LiveKit retries on non-2xx. Log and swallow malformed
   payloads; do real work out-of-band. This matches the WhatsApp webhook handling already
   planned in `PLAN.md`.
5. Webhooks are **at-least-once and not strictly ordered** — handlers must be idempotent and
   must not assume `participant_joined` arrives before `participant_left`. Use the event's
   `id` / `createdAt` to dedupe and order.
6. Reference: `https://docs.livekit.io/intro/basics/rooms-participants-tracks/webhooks-events`

### 6. Frontend (Next.js) Connection (HIGH)

`livekit-client` is browser-only (WebRTC, `MediaDevices`). Every component touching it needs
`'use client'`; keep it out of server components and out of `app/layout.tsx`.

Current recommended pattern uses the session abstraction plus a `TokenSource`:

```tsx
'use client';
import { TokenSource } from 'livekit-client';
import { SessionProvider, useSession } from '@livekit/components-react';
import '@livekit/components-styles';

const tokenSource = TokenSource.endpoint('/api/livekit/token');  // production
const session = useSession(tokenSource);
// session.start() / session.end() in a useEffect; wrap children in <SessionProvider session={session}>
```

- `useSession` / `SessionProvider` are marked **`@beta`** in 2.9.x. The stable path is still
  `<LiveKitRoom serverUrl token connect>` or a `useMemo`'d `new Room()` behind
  `RoomContext.Provider`. Pick one and note the choice; don't mix.
- `TokenSource.endpoint(url)` is the production source and caches/refreshes automatically.
  `TokenSource.developmentTokenServer()` is **dev-only** — it hits a LiveKit-hosted sandbox.
  `TokenSource.literal()` hardcodes a token: demos only.
- Always render `<RoomAudioRenderer />` once inside the room context, or remote audio is simply
  never attached to the DOM and the call is silent.
- Always disconnect on unmount (`room.disconnect()` / `session.end()` in the effect's cleanup).
  Next.js Fast Refresh and React Strict Mode double-invoke effects — a leaked `Room` means
  duplicate participants and a wedged mic. `useSequentialRoomConnectDisconnect` exists for this.
- Call `room.prepareConnection(url, token)` as soon as the page loads (DNS prewarm, TLS
  handshake, and on Cloud, best-edge selection) — meaningfully cuts join latency.
- Handle device/permission failure explicitly (`onMediaDeviceFailure`): a denied mic prompt is
  the single most common support issue, and silence is a terrible error message.
- Useful hooks: `useConnectionState`, `useLocalParticipant`, `useParticipants`, `useTracks`,
  `useIsMuted`, `useRpc`, `useDataChannel`, `useVoiceAssistant`, `useAgent`.
- References: `https://docs.livekit.io/frontends/start/react-quickstart` ·
  `https://docs.livekit.io/frontends/build/media-data` ·
  `https://docs.livekit.io/reference/components/react`

### 7. Telephony: SIP & Connectors (MEDIUM-HIGH)

**SIP (real phone calls, works self-hosted).** Needs the separate `livekit-sip` service plus a
trunk provider.

```ts
await api.sip.createSipParticipant(trunkId, '+15551234567', roomName, {
  participantIdentity: user.id,
  participantName: user.displayName,
  waitUntilAnswered: true,
});
```

- Set `waitUntilAnswered: true` so failures surface at the call site instead of as a silent room.
- Catch `SipCallError` and branch on `sipStatusCode`: `486` busy, `603` declined, `408`/`480` no
  answer or unavailable, `5xx` trunk/protocol failure. Map these to distinct user-facing states —
  "busy" and "your trunk is misconfigured" should not render identically.
- Create **stored outbound trunks** once rather than passing inline `SIPOutboundConfig` on every
  call. Inline config additionally requires `fromNumber`.
- Store numbers in E.164. Keep them off `identity` (§3) — pass them as `participantAttributes`.
- Also available: inbound trunks + dispatch rules, DTMF, cold/warm transfer.
- References: `https://docs.livekit.io/telephony/making-calls/outbound-calls` ·
  `https://docs.livekit.io/reference/telephony/sip-api` ·
  `https://docs.livekit.io/transport/self-hosting/sip-server`

**Connectors (WhatsApp / Twilio) — LiveKit Cloud only.** `api.connector` exposes
`dialWhatsAppCall`, `acceptWhatsAppCall`, `connectWhatsAppCall`, `disconnectWhatsAppCall`,
`connectTwilioCall`. If a WhatsApp call feature is ever built here:

- Outbound: `dialWhatsAppCall({ whatsappPhoneNumberId, whatsappToPhoneNumber, whatsappApiKey,
  whatsappCloudApiVersion, roomName?, agents?, ringingTimeout?, destinationCountry? })` → returns
  a `whatsappCallId`; Meta then POSTs a `call connect` webhook carrying the SDP answer, which you
  pass to `connectWhatsAppCall(callId, sdp)`.
- Inbound: Meta's `call connect` webhook arrives with an SDP offer → `acceptWhatsAppCall({ …, sdp,
  waitUntilAnswered? })` → returns the room name.
- **Latency is functional, not cosmetic**: delaying `connectWhatsAppCall` after the webhook
  produces audible silence. Handle that webhook on a fast path.
- Always call `disconnectWhatsAppCall` on hangup (`USER_INITIATED` when the user hung up);
  otherwise cleanup only happens after a 30s timeout.
- Subscribe to Meta's **`calls`** webhook field — separate from the `messages` field the v1 text
  feature uses. Supported Cloud API versions: v23.0–v26.0. Reuses the same
  `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_ACCESS_TOKEN` the text feature already needs.
- Caveats: outbound is region-restricted, call permissions must be configured on Meta's side, and
  the capability must be enabled on the LiveKit Cloud project (otherwise: "WhatsApp call is not
  enabled for this project").
- Reference: `https://docs.livekit.io/telephony/connectors/whatsapp`

### 8. Media, Bandwidth, Quality (MEDIUM)

- Enable `adaptiveStream: true` (subscriber-side: match resolution to the rendered element) and
  `dynacast: true` (publisher-side: pause unconsumed simulcast layers) on the `Room`. Both are
  close to free wins for video; harmless for audio-only.
- For an audio-only feature, publish only the mic and grant only `TrackSource.MICROPHONE` —
  don't ask for camera permission you'll never use.
- Prefer LiveKit text streams / RPC (`useRpc`, `performRpc`) over hand-rolled data packets for
  request/response patterns; use data packets for fire-and-forget. Keep `canPublishData` scoped.
- Reference: `https://docs.livekit.io/transport/media/advanced`

### 9. Agents (MEDIUM)

- `@livekit/agents@^1.9` (Node) or the Python SDK. Agents run as **separate worker processes**,
  not inside the Nest app — don't try to host one in a Nest provider.
- Dispatch an agent into a room by attaching `RoomConfiguration` with `RoomAgentDispatch` to the
  participant token, or via `api.agentDispatch`:
  ```ts
  import { RoomAgentDispatch, RoomConfiguration } from '@livekit/protocol';
  at.roomConfig = new RoomConfiguration({ agents: [new RoomAgentDispatch({ agentName: 'my-agent' })] });
  ```
- The worker token needs the `agent` grant.
- For SIP/WhatsApp calls, wait for the call participant to actually join before starting the
  agent session, and handle `participant_disconnected` for mid-call hangups.
- Reference: `https://docs.livekit.io/agents/llms.txt`, context7 `/websites/livekit_io_agents`

### 10. Testing (MEDIUM)

- `AccessToken.toJwt()` is pure — unit-test the grants it produces by decoding the JWT
  (`TokenVerifier` is exported from the SDK). Assert the *negative* cases too: no PII in
  `identity`, no `roomAdmin`, TTL within bounds.
- Mock `LiveKitAPI` at your own service boundary (`vi.fn()` per the project's Vitest setup) —
  don't hit the Twirp endpoints in unit tests.
- Webhook handler tests: sign a payload with a test key/secret and feed it through
  `WebhookReceiver` for real. Add a case with a **tampered** body asserting rejection — that's
  the test that catches a future refactor silently breaking raw-body plumbing.
- Load/soak testing against a self-hosted deployment: `livekit-cli load-test`
  (`https://docs.livekit.io/transport/self-hosting/benchmark`).

### 11. Ops & Observability (MEDIUM)

- Self-hosted needs UDP ports open and the public IP configured correctly — the #1 cause of
  "connects then no media." See `https://docs.livekit.io/transport/self-hosting/ports-firewall`.
- Local Docker `livekit-server` is for development. Treat `--dev` mode keys (`devkey`/`secret`)
  as development-only and keep them out of `.env.example` as anything but placeholders.
- Webhook endpoints are public and unauthenticated by session — rate-limit them
  (`@nestjs/throttler`) alongside signature verification.
- Log `roomName` and participant `identity` on LiveKit operations for correlation, and remember
  both are already logged inside LiveKit — which is exactly why §3 bans PII there.

---

## Anti-Patterns Checklist

- ❌ `LIVEKIT_API_SECRET` in a `NEXT_PUBLIC_*` var, client bundle, or committed file.
- ❌ Minting a token with `identity`/`room` taken from the request body.
- ❌ Phone number, email, or name used as participant `identity` or room name.
- ❌ Long-lived (hours/days) join tokens, especially on self-hosted.
- ❌ Omitting both `canPublish` and `canSubscribe` and assuming that means "no permissions."
- ❌ Shipping `roomAdmin`/`roomCreate` in a browser-held token.
- ❌ Verifying a webhook against a parsed JSON object instead of the raw body.
- ❌ Letting the global `ValidationPipe` or auth guard sit in front of the webhook route.
- ❌ Throwing from a webhook handler (triggers LiveKit retry storms).
- ❌ Importing `livekit-client` into a server component or leaving off `'use client'`.
- ❌ No `<RoomAudioRenderer />` → silent call that looks connected.
- ❌ No `disconnect()` on unmount → ghost participants under Fast Refresh.
- ❌ A `LiveKitAPI` call with no `requestTimeout`.
- ❌ Planning a Connector (WhatsApp/Twilio) feature against self-hosted LiveKit — Cloud only.
- ❌ Using the npm name `@livekit/server-sdk` (doesn't exist) instead of `livekit-server-sdk`.

## Project-Specific Notes (`caller`)

- When that module lands: mirror the `whatsapp/` boundary. One `LiveKitModule` owning a
  `LiveKitService` that wraps `LiveKitAPI`, exporting only the service; `LIVEKIT_URL`,
  `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` validated in `src/config/env.validation.ts`; errors
  mapped to `HttpException`s so `AllExceptionsFilter` handles them; `requestTimeout` set.
- `User.id` (uuid) is the right participant `identity`. `User.phoneNumber` is **not** — it's PII
  and belongs in `participantAttributes` or stays server-side.
- The LiveKit webhook route needs the raw-body + pipe/guard exemptions in §5, which means a
  `main.ts` change (`rawBody: true` + `useBodyParser`) that `PLAN.md` doesn't currently
  anticipate.
- `front/` is Next.js 16 App Router + Tailwind v4 + shadcn/ui. `@livekit/components-styles` is
  plain CSS and coexists with Tailwind; if its look clashes, LiveKit's "Agents UI" ships
  shadcn-based components (`https://docs.livekit.io/frontends/agents-ui`) that fit this stack
  better than the default prefabs.
- Also read `nestjs-best-practices` when touching `back/` — §4/§5 here assume its conventions
  (fail-fast config, global exception filter, deny-by-default auth, timeouts on outbound calls).
