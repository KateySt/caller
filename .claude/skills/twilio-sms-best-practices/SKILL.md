---
name: twilio-sms-best-practices
description: Current (Oct 2026) Twilio Programmable Messaging / SMS best practices for this repo — sending SMS from NestJS (`src/sms/`), US A2P 10DLC / toll-free / short-code compliance, Messaging Services, status callbacks and delivery tracking, inbound webhooks and `X-Twilio-Signature` validation, STOP/HELP opt-out handling (error 21610), segments/encoding/cost, error codes (30007, 30003, 21610…), retries/idempotency, and the `twilio` Node SDK 6.x. Use whenever writing, reviewing, or planning code that touches Twilio SMS — send endpoints, delivery-status webhooks, inbound/two-way SMS, opt-out, sender setup, or an AI agent conversing over SMS.
license: MIT
metadata:
  author: self
  version: "1.0.0"
  verified-against: "twilio npm 6.1.2 (2026-09-28, Node >=20) · twilio.com/docs pages fetched 2026-10-05 (A2P 10DLC, quickstart, toll-free, webhooks-security, track-outbound-message-status, advanced-opt-out, message-resource, messaging services, webhook-request)"
---

# Twilio SMS Best Practices

Facts come from twilio.com/docs fetched on 2026-10-05. Items marked **(general knowledge)** or
**(third-party)** were not confirmed on an official page — verify before relying on them.
Project conventions in `AGENTS.md` / `back/AGENTS.md` / `back/specs/SPEC-03-sms-messaging.md`
win over anything generic here.

## When to Apply

- Touching `back/src/sms/` (`SmsService`, `SmsMessage`), `POST|GET /users/:id/sms-messages`.
- Adding delivery-status tracking, inbound SMS, opt-out, or an AI agent that chats over SMS
  (SPEC-03 currently lists these as **non-goals** — a new spec or SPEC-03 revision comes first).
- Choosing/registering a sender (10DLC, toll-free, short code, alphanumeric, Messaging Service).

## Current repo state (what exists vs. what this skill recommends)

- `SmsService.postMessage` calls the REST API by hand with `fetch` + Basic auth, 10 s
  `AbortSignal.timeout`, and logs `sent`/`failed` — where `sent` means only "Twilio accepted
  the request" (status `queued`), **not delivered**.
- Env: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM_NUMBER` (validated at boot).
- The hand-rolled fetch is acceptable (zero deps, fits the ESM/tsx setup). Switching to the
  `twilio` SDK is optional; it becomes worthwhile once you need `validateRequest`
  (webhooks) — see §5. Don't mix two ways of calling Twilio without reason.

---

## 1. Compliance decides everything (US traffic)

- **A2P 10DLC**: anyone sending SMS/MMS from a US 10DLC number *from an application* must
  register — individuals and hobbyists included. Unregistered 10DLC traffic incurs extra carrier
  fees (and, **general knowledge**, is filtered/blocked by carriers — error 30034 / 30007).
- Flow: paid account (trials ineligible) → Trust Hub profile → **Brand** (minutes) →
  **Campaign** (days; docs currently say 10–15 days) → attach numbers to a Messaging Service →
  campaign status `VERIFIED` before sending.
- Brand types: **Sole Proprietor** (1 campaign, ≈3,000 segments/day across US carriers) vs.
  **Standard** (T-Mobile 2,000/day up to unlimited depending on Trust Score).
- Campaign review criteria: real, thorough description (one-word fails); **two sample messages**
  with sender identity, bracketed template fields, and opt-out text; verifiable **consent
  method** (live page/screenshot/video); public privacy policy that forbids sharing opt-in data
  with third parties.
- **(third-party, dev.to)** From 2026-06-30 `PrivacyPolicyUrl` and `TermsAndConditionsUrl` are
  required (HTTPS, publicly reachable; terms must mention purpose, STOP, HELP) when creating
  campaigns via API. Confirm in Twilio's changelog before coding it.
- **Toll-free** (800/888/877/866/855/844/833): needs Toll-Free Verification via API
  (`PENDING_REVIEW` → `TWILIO_APPROVED` | `TWILIO_REJECTED`; ~3 business days; rejected-but-
  editable requests expire after 7 days). Rejected = cannot send. Toll-free is **not** part
  of 10DLC. STOP on toll-free always unsubscribes immediately.
- **Short codes** — also outside 10DLC; highest throughput, slow/expensive provisioning.
- Outside the US each country has its own sender rules (alphanumeric sender ID registration,
  local numbers) — **(general knowledge)**, check the country guideline page per destination.
- **Consent first**: only text contacts who opted in, for the purpose they agreed to. A contact
  list in the `User` table is not consent by itself — store `smsConsentAt` / source (see §7).
- Message content: identify the business, no URL shorteners you don't own (public shorteners
  get filtered — **general knowledge**; use Messaging Service link shortening if needed), no
  SHAFT content (sex, hate, alcohol, firearms, tobacco/cannabis) without special approval.

## 2. Sending

- Create Message needs `To` (E.164) + (`From` **or** `MessagingServiceSid`) + (`Body` |
  `MediaUrl` | `ContentSid`). **Prefer `MessagingServiceSid`** over a bare `From` once you have
  more than one number or need 10DLC campaign linkage, sticky sender, geo-match, smart encoding,
  link shortening, scheduling (`SendAt`), or advanced opt-out. Add env `TWILIO_MESSAGING_SERVICE_SID`
  (validated in `env.validation.ts`) and send with it instead of `TWILIO_SMS_FROM_NUMBER`.
- `Body` max 1,600 characters (matches SPEC-03 AC-1). Above 160 GSM-7 / 70 UCS-2 characters the
  message is split into **segments, each billed**. One emoji or curly quote flips the whole
  message to UCS-2 (70 chars/segment, 67 when concatenated). Set `SmartEncoded=true`
  (Messaging Service) to swap Unicode lookalikes for GSM-7.
- `StatusCallback` (per message or on the Messaging Service) → delivery tracking (§4).
- `ValidityPeriod` (1–36000 s, default 36000): cap queue time for time-sensitive messages (OTPs)
  so they never arrive hours late. `MaxPrice` guards cost on unexpected routing.
- Twilio **queues** over your sender's rate limit (MPS) instead of rejecting; Messaging
  Services aggregate throughput across the pool. Don't build your own sleep loops — but do cap
  concurrent in-flight sends from your side for bulk jobs.
- Validate the phone number **before** calling Twilio: E.164 regex, optionally Lookup v2 for
  line type (landlines return 30006) — Lookup costs money, use it at import time, not per send.
- **No server-side idempotency key** on Create Message **(general knowledge)** — a retry after a
  timeout can double-send. Therefore: do not blindly retry POSTs on timeout/5xx; log the attempt
  first (`status: 'pending'`), then update with the returned `sid`; reconcile via status callback
  or `GET /Messages` filtered by `To`+`DateSent` before re-sending.
- Always store the returned **`MessageSid` (`SM…`/`MM…`)** — it is the join key for callbacks,
  support tickets and cost reconciliation. The current entity lacks it.
- Error handling: 4xx = your request is wrong (don't retry; map `code` e.g. 21211 invalid `To`,
  21608 trial unverified number, 21610 opted out, 21614 not mobile); 429 = back off with
  jitter; 5xx/timeouts = ambiguous, see idempotency note. Keep returning a generic 502 to
  clients and the full detail server-side (AC-4).
- Trial accounts: can only text verified numbers and prepend a trial banner. Fine for dev, not
  for staging tests of copy/length.

## 3. Inbound SMS (two-way / agent conversations)

- Point the number's (or Messaging Service's) "A message comes in" webhook at a public HTTPS
  `POST /api/sms/webhook/incoming` (separate module/controller, imports `UsersModule`, same
  pattern as `src/whatsapp/webhook/`).
- Payload is `application/x-www-form-urlencoded`: `MessageSid`, `From`, `To`, `Body` (≤1600),
  `NumMedia`, `MediaUrl{N}`, `OptOutType` (STOP|START|HELP), plus fields Twilio adds without
  notice — **never whitelist-reject unknown params** (the global `forbidNonWhitelisted` pipe
  must not run on this route; use a plain controller reading `req.body`/`@Body()` untyped).
- Respond fast with **200** and empty TwiML `<Response/>` (or no body). Reply asynchronously
  via the REST API if the AI needs seconds to think — don't hold the webhook open (Twilio
  times out at ~15 s **(general knowledge)**). Set a **fallback URL** so Twilio has somewhere
  to fail over.
- **Dedupe by `MessageSid`** (unique index): webhooks can be redelivered. Match `From` to
  `User.phoneNumber` (normalise to E.164); unknown senders are logged but get no AI reply.
- Disclose the AI at first contact and honour STOP immediately (§6).

## 4. Delivery tracking (status callbacks)

- Statuses: `queued` → `sent` → `delivered` | `undelivered` | `failed` (plus `accepted`,
  `scheduled`, `sending`, `canceled`, `read` for other channels/features).
- Twilio POSTs form-encoded `MessageSid`, `MessageStatus`, `ErrorCode?`, `AccountSid`, `From`,
  `To`, … Respond **200**, no body needed. Extra params may appear at any time.
- **Ordering is not guaranteed.** Never overwrite `delivered` with an older `sent`. Keep a
  monotonic rank (`queued<sending<sent<delivered|undelivered|failed`) and only advance; store
  `errorCode` and `updatedAt`.
- Docs do not state a retry policy for failed callbacks — make the endpoint idempotent and
  fast, and reconcile stale `queued`/`sent` rows by polling `GET /Messages/{sid}` after
  a timeout window (e.g. 1 h).
- `delivered` is a carrier receipt: unreliable for some carriers/countries (**general
  knowledge**) — treat `sent` for a long time as "unknown", not "failed".
- Error codes worth special handling: **21610** (recipient sent STOP → mark contact opted-out,
  stop retrying), **30003** (unreachable handset, often temporary), **30005** (unknown
  destination), **30006** (landline/unreachable carrier, permanent), **30007** (carrier/Twilio
  filtered — review content & registration; see `twilio.com/docs/api/errors/30007`),
  **30008** (unknown error), **30034** (unregistered 10DLC). Link the error page in logs.
- Extend the entity/status union: `'pending' | 'queued' | 'sent' | 'delivered' | 'undelivered'
  | 'failed'` plus `twilioSid`, `errorCode`; add a TypeORM migration (see `typeorm-migrations`
  skill) — entity columns need explicit `type:` (tsx emits no decorator metadata).

## 5. Webhook security (`X-Twilio-Signature`)

- Every webhook (inbound + status) carries `X-Twilio-Signature` = base64 HMAC-SHA1 over
  (full URL + sorted POST params), keyed with the **Auth Token**. For JSON bodies Twilio adds a
  `bodySHA256` query param and signs that.
- **Always validate** and reject with 403 on mismatch. Twilio itself says: use the SDK
  (`twilio.validateRequest(authToken, signature, url, params)`; JSON bodies:
  `validateRequestWithBody`), don't hand-roll — parameters evolve.
- Gotchas:
  - Use the **exact public URL Twilio calls**, including scheme, host, port, query string.
    Behind a proxy/ngrok/Vercel, `req.protocol`/`req.host` are wrong → build the URL from a
    configured `TWILIO_WEBHOOK_BASE_URL` env var, not from the request.
  - Don't decode/re-encode the URL; don't strip the query string.
  - Pass the full, untouched param object (all fields, including unknown ones).
  - Compare timing-safely (the SDK does).
  - If you want to avoid the full SDK dependency, `twilio/lib/webhooks/webhooks` exposes only the
    validators — **(general knowledge)**; otherwise add `twilio` as a dependency and import
    `{ validateRequest }`.
- Nest: put validation in a guard (`TwilioSignatureGuard`) applied to the webhook controller;
  inject `ConfigService` with an explicit `@Inject(ConfigService)` (project convention — tsx
  runs this tree without DI metadata). Express's default urlencoded parser is enough;
  `rawBody: true` is already on in `main.ts` if you ever need it for JSON webhooks.
- Rotating the Auth Token invalidates signatures — plan the rotation (secondary token via API
  Keys is **general knowledge**; webhook signatures still use the primary Auth Token).
- Prefer **API Keys** (`SK…` + secret) over the master Auth Token for REST calls in production
  **(general knowledge)**; keep the Auth Token only for webhook validation.

## 6. Opt-out, opt-in, HELP

- Twilio automatically handles English keywords on long codes: **STOP, UNSUBSCRIBE, END, QUIT,
  STOPALL, REVOKE, OPTOUT, CANCEL** (case-insensitive) → opted out at the carrier/Twilio level,
  confirmation auto-sent. **START/UNSTOP** (also YES) re-subscribes. **HELP** returns the
  help text. Basic handling is on by default; **Advanced Opt-Out** (Messaging Service level:
  custom keywords, 40+ languages, per-country overrides) is **disabled by default** and can't
  be disabled once on.
- Subsequent sends to an opted-out number fail with **21610**. Do not try to bypass.
- Inbound webhooks (and callbacks) carry `OptOutType` = STOP|START|HELP → mirror it into your
  DB (`smsOptedOutAt`) so the UI/AI stops *before* calling Twilio and doesn't waste requests.
  Opt-out is per (contact, sender/Messaging Service) — a different sender is a separate list.
- Include opt-out language ("Reply STOP to unsubscribe") in the first message and in sample
  messages submitted to the campaign. Messages that are your own "STOP" replies must not be
  answered by the AI beyond the confirmation.
- Quiet hours **(general knowledge)**: US TCPA — no marketing texts before 8am / after 9pm
  recipient local time; keep per-contact timezone if you send campaigns.

## 7. Data model & architecture (NestJS)

- Keep `SmsService` as the only owner of Twilio details (like `WhatsAppService`). Webhook
  controller(s) in `src/sms/webhook/` as a **separate module** importing `UsersModule`;
  `UsersModule → SmsModule` stays acyclic (no `forwardRef`).
- Tables: `SmsMessage` gets `direction` (`outbound|inbound`), `twilioSid` (unique, nullable
  while `pending`), `status`, `errorCode`, `segments` (from `NumSegments`), `price`/`priceUnit`
  (arrive late via `GET /Messages/{sid}`, **general knowledge**). Add
  `smsOptedOutAt`/`smsConsentAt` to a link table or `User` (migration + SPEC update).
- Config via `env.validation.ts`: add `TWILIO_MESSAGING_SERVICE_SID` (optional → fall back to
  `From`), `TWILIO_WEBHOOK_BASE_URL` (required when webhooks enabled), optional
  `TWILIO_STATUS_CALLBACK_URL`. Never log the Auth Token or full request bodies with PII.
- Rate-limit and authenticate `POST /users/:id/sms-messages` before any public deployment
  (SPEC-03 known MVP limitation) — an open SMS endpoint is a direct money-burning vector
  (SMS pumping / toll fraud).
- Serialise sends per recipient only if ordering matters (as Telegram does per chat);
  otherwise SPEC-03 allows concurrent sends.
- Tests (Vitest): mock `fetch`/the SDK; unit-test status-rank logic and signature guard with a
  signature generated by `twilio.getExpectedTwilioSignature(authToken, url, params)`.
- Local dev for webhooks: tunnel (ngrok/Cloudflare Tunnel) and set `TWILIO_WEBHOOK_BASE_URL` to
  the tunnel URL; Twilio CLI `twilio phone-numbers:update --sms-url` can set the webhook.

## 8. Agent (LLM) over SMS

- 160-char economy: system prompt must demand short plain-text replies (no markdown, no
  emoji — emoji triggers UCS-2 and doubles segment cost), ≤ 1 segment where possible.
- Cap AI turns per contact per hour/day and total spend; loop-guard against auto-replies
  (another bot / short-code echo).
- Always allow STOP/HELP to short-circuit the model; never let the LLM answer those.
- Disclose it is an automated assistant; escalate to a human on request.
- Treat inbound `Body` as untrusted input (prompt injection) — the agent must not have tools
  that act on SMS content alone without confirmation.

## 9. Checklists

**Before going live (US):** paid account · Trust Hub profile · brand approved · campaign
`VERIFIED` (or toll-free `TWILIO_APPROVED`) · number(s) in a Messaging Service · privacy
policy + terms public · consent captured & stored · STOP/HELP tested from a real handset ·
status callback + inbound webhook reachable and signature-validated · auth/rate limit on the
send endpoint · geo permissions limited to countries you actually serve (Console → Messaging →
Settings → Geo permissions, **general knowledge**).

**Review checklist for a PR touching SMS:** no secret in logs/responses · timeout on every
Twilio call · no blind retry of POST · `MessageSid` persisted · status updates monotonic ·
webhook signature validated with the configured public URL · unknown params tolerated ·
opt-out honoured pre-send · migration included for entity changes · spec updated.

## Sources

- twilio.com/docs/messaging/compliance/a2p-10dlc (+ `/quickstart`), `/compliance/toll-free`
- twilio.com/docs/usage/webhooks/webhooks-security
- twilio.com/docs/messaging/guides/track-outbound-message-status, `/guides/webhook-request`
- twilio.com/docs/messaging/tutorials/advanced-opt-out, `/services`, `/api/message-resource`
- twilio.com/docs/api/errors/{21610,30003,30007} (error index: twilio.com/docs/api/errors)
- npm `twilio` 6.1.2 (`npm view`, 2026-10-05)
