---
name: telegram-bot-best-practices
description: Current (Oct 2026) Telegram Bot API best practices for this repo — how an AI agent can message and converse with existing clients through a Telegram bot, opt-in via deep links, linking a Telegram chat to a `User`, webhooks vs long polling, rate limits/429/403 handling, grammY in NestJS 12, streaming AI replies, Telegram Business (secretary) mode, and Bot Platform ToS/anti-spam rules. Use whenever writing, reviewing, or planning code that touches Telegram — bot setup, BotFather, webhooks, outreach/broadcast to clients, or an AI agent chatting over Telegram.
license: MIT
metadata:
  author: self
  version: "1.0.0"
  verified-against: "Bot API 10.3 (2026-08-24) · grammy 1.46.0 · @grammyjs/auto-retry 2.0.2 · @grammyjs/transformer-throttler 1.2.1 · @grammyjs/runner 2.0.3 · core.telegram.org + grammy.dev as of 2026-10-05"
---

# Telegram Bot Best Practices

Facts below come from core.telegram.org (`/bots/api`, `/bots/faq`, `/bots/features`,
`/bots/webhooks`, `/bots/api-changelog`, `telegram.org/tos/bot-developers`), grammy.dev, and
`npm view` — items marked **(general knowledge)** were not re-fetched; verify before relying on
them. Project conventions in `AGENTS.md` / `back/AGENTS.md` win over anything generic here.

## When to Apply

- Adding a Telegram channel next to WhatsApp (`src/whatsapp/`) and SMS (`src/sms/`).
- Letting the AI agent (Claude) hold text conversations with existing clients over Telegram.
- Sending notifications / campaigns to clients through a bot.
- Touching webhooks, BotFather settings, rate-limit handling, or bot ToS/compliance.

---

## 1. The one fact that decides the design: a bot cannot cold-message anyone

- **A user must open the chat with the bot first** (press **Start** or send a message).
  Per `/bots/features`: "Users must initiate contact first"; bots reply, or message users who
  already subscribed (newsletter-style).
- **A bot cannot look up a user by phone number.** The Bot API has no phone → `chat_id`
  resolver. The only identifier you can message is the numeric `chat_id` (= Telegram user id
  for private chats), which you only learn when that user writes to the bot.
- Therefore "agent writes to my existing clients" = **invite → client taps Start → you link
  `chat_id` to your `User` row → agent can now message them.**
- **Do NOT use a userbot** (MTProto login as a real account, Telethon/gramjs/Pyrogram) to
  cold-message by phone. It breaks the Telegram ToS ("must not harass or spam users with
  unsolicited messages") and gets accounts/numbers banned (see Radist's "Telegram
  restrictions/Number bans" doc). Not an option for a production product.

### The onboarding flow (recommended)

1. Create `Telegram link` token per client: random, single-use, ≤ 64 chars, charset
   `A-Z a-z 0-9 _ -` (hard Telegram limit for `start=`). Store hashed/with expiry; map to `User.id`.
   Never put phone numbers or raw user ids in the link.
2. Send the client `https://t.me/<bot_username>?start=<token>` over a channel you already have
   (WhatsApp template, SMS, email). Ideally with consent wording ("get updates in Telegram").
3. Bot's `/start <token>` handler: validate token (exists, unused, not expired) → save
   `telegramChatId` on the `User` → mark token used → greet, disclose it's an AI assistant, and
   say how to stop (`/stop`).
4. From then on the agent can send proactively to that `chat_id` (still within consent scope).
5. Alternative/extra: `request_contact` keyboard button to get the client's phone number
   **shared by the user** and match it to `User.phoneNumber` — only trust the contact if
   `message.contact.user_id === message.from.id` (else they forwarded someone else's contact).

---

## 2. Setup checklist (what you must do)

1. **BotFather** (`@BotFather`): `/newbot` → get token. Set name, description, about, userpic,
   `/setcommands` (or `setMyCommands` with `language_code` scopes). Support `/start`, `/help`,
   `/settings`; commands ≤ 32 chars, Latin/digits/underscore.
2. Token is a secret (like `ANTHROPIC_API_KEY`): env var, validated in
   `src/config/env.validation.ts`, never in the browser or logs. Rotate with BotFather `/revoke`.
3. Privacy mode only matters in groups; private chats receive all messages.
4. Public HTTPS URL for the webhook in prod; for local dev use **long polling** (no URL
   needed). Don't mix: **no `getUpdates` while a webhook is set** — call `deleteWebhook` first.
5. Write a **privacy policy** and link it (BotFather `/setprivacy`-adjacent "about"/description
   or `/start` message). ToS §4 requires an easily accessible policy.
6. Optional: private-chat **topics** (enable in BotFather) to separate orders/support threads;
   menu button / Mini App for richer UI.

New env vars (proposal): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`,
`TELEGRAM_WEBHOOK_SECRET` (1–256 chars `A-Za-z0-9_-`), `TELEGRAM_WEBHOOK_URL` (optional → polling
when unset).

---

## 3. Receiving updates

| | Long polling (`getUpdates`) | Webhook (`setWebhook`) |
|---|---|---|
| Needs public HTTPS | no | yes |
| Best for | local dev, single server | serverless / autoscaled / prod behind a domain |
| Gotcha | one consumer only | reply within timeout or Telegram **re-sends** the update |

grammY's own advice: "If you don't have a good reason to use webhooks, there are no major
drawbacks to long polling." For this repo (single Nest server + separate worker) either works;
webhook in prod, polling in dev is conventional.

**Webhook facts:**
- Ports: **443, 80, 88, 8443** only. TLS ≥ 1.2; cert CN/SAN must match domain; self-signed OK
  if uploaded as PEM. **IPv4 required** (no IPv6).
- Telegram sends from `149.154.160.0/20` and `91.108.4.0/22` (can allowlist; recheck the doc
  if it breaks).
- `setWebhook({ url, secret_token, allowed_updates, max_connections (1–100, default 40), drop_pending_updates })`.
  Telegram sends header **`X-Telegram-Bot-Api-Secret-Token`** — verify it with a constant-time
  compare in a guard; reject otherwise. `webhookCallback(bot, 'express', { secretToken })` in
  grammY does this for you.
- Set `allowed_updates` explicitly to what you handle (`message`, `callback_query`,
  `my_chat_member`, `business_connection`, `business_message`, …) — less noise, and some types
  aren't delivered by default.
- **Ack fast.** Don't call Claude inside the webhook request. Persist/enqueue the update, return
  200, process async (the agent reply can take many seconds → timeout → duplicate delivery).
  Make handlers **idempotent**: dedupe by `update_id`.
- Avoid "webhook reply" mode (returning the API call in the HTTP response): hides errors and
  response objects; grammY warns it can cause race conditions with sessions.

---

## 4. Sending: limits and error handling

Limits (`/bots/faq`):
- ≤ ~**1 msg/sec per private chat**; ≤ **20 msgs/min per group**; ≤ ~**30 msgs/sec** bulk across
  chats. Exceed → **HTTP 429** with `parameters.retry_after` (seconds).
- **Paid broadcasts**: up to 1000 msg/s at 0.1 Stars/msg; needs ≥ 100,000 Stars balance and
  100,000 MAU (FAQ figures; the grammY page says 10,000 Stars — they disagree, treat the FAQ as
  authoritative). Irrelevant for a client-list-sized product.
- Message text ≤ **4096** chars, caption ≤ **1024**, `callback_data` ≤ **64 bytes**. Long
  agent answers must be split (on paragraph boundaries; don't cut inside HTML/Markdown entities).
- Downloads via Bot API ≤ **20 MB**, uploads ≤ **50 MB** (a self-hosted Local Bot API server
  lifts this — **general knowledge**).

Handling (grammY flood guide):
- 429 → wait `retry_after` and retry: **`@grammyjs/auto-retry`** (`bot.api.config.use(autoRetry())`).
  Don't invent your own delays, don't ignore 429s, don't blast in parallel — send broadcasts
  sequentially. For many chats, `@grammyjs/transformer-throttler` is the sanctioned throttle.
- **403 "bot was blocked by the user"** **(general knowledge)** → the client blocked the bot:
  mark `telegramChatId` as unreachable/opted-out and **stop sending**. Also listen to the
  `my_chat_member` update (in private chats it fires only on block/unblock) to flip the flag
  both ways. 400 "chat not found" → stale id.
- Log every attempt like the other channels (`WhatsAppMessage`/`SmsMessage` pattern): a
  `TelegramMessage` entity with direction, status, `telegramMessageId`, error.
- `parse_mode: 'HTML'` is easier to escape correctly than MarkdownV2 — escape model output
  (`& < >`) before sending, or send as plain text. LLM output + MarkdownV2 = frequent 400s.

---

## 5. Making an AI agent feel right in Telegram

- **Disclose** it's an AI on first contact and give an opt-out. ToS §5.4(i): "clearly and
  truthfully represent the full extent of the services provided by your bot".
- **Typing indicator**: `sendChatAction(chat_id, 'typing')` (lasts ~5 s; re-send while generating).
- **Streaming (Bot API 9.3+ / current)**: `sendMessageDraft` shows a draft being generated in
  private chats ("Thinking…", `can_stop`, `keep_on_stop`) — use it with Claude's streaming
  instead of editing a message repeatedly (edits hit rate limits).
- **Rich Messages** (Bot API 10.1+), expandable block quotes and button classes (10.3),
  inline keyboards (callback buttons don't create chat messages) — good for confirmations,
  "yes/no", menus. Answer every `callback_query` with `answerCallbackQuery`.
- **Conversation state**: persist history in Postgres keyed by `User.id`; reuse the existing
  `AgentSettings` system prompt snapshot approach as the calls feature does. One in-flight
  agent turn per chat (queue or lock) — users send bursts of messages.
- Keep the same tool/guardrails as voice: the agent should not reveal other clients' data;
  authorize by linked `chat_id`, not by what the user claims in text.
- **Commands** `/start`, `/help`, `/stop` (unsubscribe), `/settings`. Honor opt-out immediately.

---

## 6. Telegram Business ("secretary mode") — different product

Bots can be connected to a **person's/business's own Telegram account** and answer in their
existing chats (`business_connection`, `business_message` updates; owner chooses which chats).
This is the way to let an agent talk **in the existing 1:1 chats the business already has with
clients** (no `/start` needed, since the chat is the owner's account chat). Requirements/caveats:
the account owner connects the bot in Telegram settings (requires Premium — **general
knowledge**); the bot must handle `BusinessConnection` events; replies are sent with the
`business_connection_id`. ToS §5.4(iii): data from Business chats may be used **only** to provide
the chatbot service. Bot API 10.0 also added **Guest Mode** (bot receives messages in chats it
isn't a member of).

Choose: **regular bot** = clients opt in to a branded bot (this repo's default);
**Business bot** = agent replies as the business account in chats that already exist.

---

## 7. Compliance (Bot Platform Developer ToS)

- No unsolicited messages / spam (§5.2(b)); only message opted-in clients, within what they
  agreed to. Keep consent evidence (token issued, time of `/start`).
- Inform users of significant scope changes and let them opt out (§5.2).
- Data minimization (§4.3); delete client data promptly on request (§4.2); privacy policy
  required (§4). Don't repurpose chat contents (e.g. training) beyond the service.
- No phishing/MLM/deceptive practices (§5.2(d)). Digital goods payments must use Telegram
  Stars (§6.2.1); implement `/paysupport` if you take payments.
- Check whether Telegram is reachable/restricted for your clients' country before committing to
  it as the only channel; keep WhatsApp/SMS as fallback.

---

## 8. Implementing it in this repo (NestJS 12, ESM, tsx worker)

**Library: use `grammy` directly — not `@grammyjs/nestjs`.** Verified via `npm view`: the Nest
module (0.3.4) peers `@nestjs/core ^8 || ^9`, this repo is on `^12`; `nestjs-telegraf` 2.9.1 peers
`^10 || ^11` and Telegraf is the less-typed option. grammy 1.46.0 ships ESM and TS types.
Wrap it in a plain injectable service like the other channels.

Install (when implementing): `npm i grammy @grammyjs/auto-retry` (+ `@grammyjs/runner` only if
polling at volume; `@grammyjs/conversations`/`menu`/`hydrate` only if needed — YAGNI).

Mirror the WhatsApp layout:
- `src/telegram/telegram.service.ts` — owns the token and the `Bot`/`bot.api`; `sendText(recipient, text)`
  with the narrow `TelegramRecipient { id; telegramChatId }` interface (don't import `User`, keeps
  the module acyclic like `WhatsAppRecipient`); logs each attempt; flips opt-out on 403.
- `src/telegram/entities/telegram-message.entity.ts` — send/receive log.
- `src/telegram/webhook/` — a **separate module** importing `UsersModule` (same acyclic trick as
  `whatsapp/webhook`) with a controller verifying the secret header; `/start <token>` linking
  lives here.
- `User` gets nullable `telegramChatId` (bigint → store as string/`bigint` carefully: chat ids
  exceed 2^31, and JS `number` is safe to 2^53 — fine for user ids today but prefer string),
  `telegramOptedOutAt`; plus a `TelegramLinkToken` table. **Migration required** — never
  `synchronize`. Declare column types explicitly (tsx doesn't emit decorator metadata) and use
  explicit `@Inject(...)` in constructors, as the existing services do.
- Agent turns: reuse the Claude call path from the voice agent (`ANTHROPIC_MODEL`) in a text
  flow; run it off the webhook request (queue / `setImmediate`-style async job), never inline.
- Routes follow convention: `POST /users/:id/telegram-invite` (creates token, returns/sends the
  deep link), `POST /users/:id/telegram-messages`, `GET /users/:id/telegram-messages`.
- Per `AGENTS.md`, this is a multi-file feature → write a spec first
  (`back/specs/SPEC-NN-telegram-agent.md`, via the `spec-creator` agent), verify with `plan-verifier`.
- Register webhook in a startup/CLI step (`setWebhook` with `secret_token`), not on every boot;
  local dev: `deleteWebhook` + long polling.

---

## 9. Keeping this skill current

Telegram ships a Bot API version roughly every 1–2 months (10.0 on 2026-05-08 → 10.3 on
2026-08-24). Before using a feature newer than **10.3**, fetch
`https://core.telegram.org/bots/api-changelog` and update `verified-against`. Cheap lookups,
cheapest first: `npm view grammy version` · `https://core.telegram.org/bots/api-changelog` ·
`https://grammy.dev/` guide pages (`/advanced/flood`, `/guide/deployment-types`) ·
`https://core.telegram.org/bots/faq`.

Recent Bot API milestones: 9.5 (Mar 2026) date-time entities · 9.6 (Apr) Managed Bots ·
10.0 (May) Guest Mode, Live Photos · 10.1 (Jun) Rich Messages, join-request queries ·
10.2 (Jul) ephemeral messages, Communities · 10.3 (Aug) button classes, expandable quotes,
`ephemeral_message_parameters`.

## Sources

- https://core.telegram.org/bots/api · /bots/faq · /bots/features · /bots/webhooks · /bots/api-changelog
- https://telegram.org/tos/bot-developers
- https://core.telegram.org/api/links (deep links) · https://core.telegram.org/method/messages.startBot
- https://grammy.dev/advanced/flood · https://grammy.dev/guide/deployment-types · https://grammy.dev/resources/comparison
- https://docs.radist.online/en/our-products/integrations/telegram+kommo.com/telegram-restrictions-number-bans/
