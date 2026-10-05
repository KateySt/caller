# Spec: Telegram bot client linking and conversation log | Spec ID: SPEC-04 | Status: draft

## Problem & why

Staff want to reach existing clients (`User`) over Telegram, but a Telegram bot cannot cold-message anyone and cannot look a person up by phone number: the client must first open the bot and press Start. This feature gives the operator a per-client invitation link, ties the Telegram chat that results from it to the right `User`, and records the full correspondence (client messages in, bot/operator messages out) so it can be shown as a per-client conversation history.

Cross-reference: the operator-facing UI (link generation button, conversation view, send box) is specified in `front/specs/SPEC-03-telegram-conversation-ui.md`; it consumes the contracts defined here. Do not duplicate acceptance criteria there. Related channel specs: `back/specs/SPEC-01-whatsapp-messaging.md`, `back/specs/SPEC-03-sms-messaging.md`. Platform facts (deep-link limits, webhook secret header, 429/403 behaviour, ToS) are in `.claude/skills/telegram-bot-best-practices/SKILL.md`.

## Goals / Non-goals

- Goals:
  - Generate a Telegram deep link for a given `User`, which the operator sends to the client over an existing channel.
  - Link the Telegram chat to the `User` when the client opens the link and presses Start.
  - Log every inbound and outbound Telegram message and expose it as that `User`'s conversation history.
  - Let the operator send a plain text message to a linked, reachable client.
  - Honour opt-out (`/stop`) and Telegram-side blocking.
  - Receive updates via a verified webhook in production and via long polling for local development.
- Non-goals:
  - AI-agent auto-replies or any LLM involvement (future work).
  - Telegram Business ("secretary") mode, userbots, phone-number lookup, or any attempt to message a client who has not pressed Start.
  - Media, files, voice, stickers, inline keyboards, groups/channels. Text only in v1.
  - Sending the link itself (the operator delivers it manually; the system only produces it).
  - Delivery/read receipts beyond what Telegram returns on send.
  - Authentication, authorization, or rate limiting on the new REST endpoints. Accepted MVP limitation, consistent with SPEC-01..SPEC-03.
  - Editing/deleting previously logged messages, or syncing edits/deletions made in Telegram.

## User stories

- As an operator, I want to generate a Telegram link for a client, so that I can send it to them and invite them to chat with the bot.
- As a client, I want to tap the link and press Start, so that I can opt in to receiving messages from the bot, and send /stop to opt out at any time.
- As an operator, I want to see the whole bot conversation with a client in one place, so that I know what was said by whom and when.
- As an operator, I want to send a text message to a client who has linked their Telegram, so that I can follow up in that channel.

## Acceptance criteria (EARS)

### Link generation

- AC-1: WHEN a client sends `POST /users/:id/telegram-invite` for an existing User, the system shall create a single-use invitation token valid for 7 days, and return a deep link of the form `https://t.me/<bot username>?start=<token>` together with its expiry time.
- AC-2: The system shall generate each token from a cryptographically random source, using only the characters `A-Z a-z 0-9 _ -`, with a length of at most 64 characters, and shall not embed the phone number, user id, or any other personal data in it.
- AC-3: The system shall persist only a hash of each token, never the raw token; the raw token shall be returned once, in the response that created it.
- AC-4: WHEN a new invitation is generated for a User, the system shall invalidate any previously issued, unused invitation for that same User.
- AC-5: IF `:id` in `POST /users/:id/telegram-invite` does not match any existing User, THEN the system shall return a "not found" error and create nothing.
- AC-6: WHERE the User is already linked to a Telegram chat and not opted out, the system shall still allow generating a new invitation, and shall include the User's current link status in the response so the caller can tell.
- AC-7: WHEN a client sends `GET /users/:id/telegram`, the system shall return that User's Telegram status: one of `not_linked`, `linked`, `opted_out`, or `unreachable`, plus the link/opt-out timestamps where applicable.

### Linking (inbound `/start`)

- AC-8: WHEN the bot receives `/start <token>` from a private chat and the token is valid (known by hash, unused, unexpired), the system shall link that Telegram chat to the token's User, mark the token used, record the link time, and reply with a greeting that states the bot's purpose and that the client can send `/stop` to opt out.
- AC-9: IF the bot receives `/start` with no token, or with a token that is unknown, already used, expired, or invalidated, THEN the system shall reply politely that the link is not valid and that the client should ask the operator for a new one, and shall not link anything.
- AC-10: IF a token is presented for a User who is already linked to a different Telegram chat, THEN the system shall re-link the User to the chat presenting the valid token and detach the previous chat from that User.
- AC-11: IF a Telegram chat is already linked to a User and a valid token for a different User is presented from that same chat, THEN the system shall reject the link with a polite reply and leave existing links unchanged.
- AC-12: WHEN a previously opted-out or unreachable client links again through a valid token, the system shall clear the opted-out/unreachable state (the token path also works for them, in addition to AC-13a).
- AC-13: WHEN the bot receives `/start` with no token from a chat that is already linked, not opted out, the system shall reply with a short confirmation that the chat is already linked (no new link is created).
- AC-13a: WHEN the bot receives `/start` with no token from a chat that is still linked to a User who is opted out (after `/stop`) or unreachable, the system shall clear that state, reply confirming that messages are enabled again (repeating the AC-32 disclosure and `/stop`), and log both the inbound `/start` and the outbound reply in that User's conversation. The linked chat is the consent evidence; the operator has no way to do this on the client's behalf.

### Opt-out

- AC-14: WHEN a linked client sends `/stop`, the system shall mark that User opted out, reply once confirming the opt-out and how to re-subscribe (send `/start` again), keep the chat linked to the User, and thereafter reject every outbound send to that User until AC-13a applies.
- AC-15: IF `/stop` is received from a chat that is not linked to any User, THEN the system shall reply politely and change no state.

### Message logging

- AC-16: WHEN the bot receives a text message from a chat linked to a User, the system shall log it as an inbound entry (User, direction, text, Telegram message id, Telegram timestamp) in that User's conversation.
- AC-17: WHEN the bot receives a non-text message (photo, voice, sticker, file, etc.) from a linked chat, the system shall log an inbound entry with a placeholder type indicating the kind of content and no content body, and shall not download or store the media.
- AC-18: WHEN the bot receives a message from a chat that is not linked to any User (other than `/start` handling per AC-8..AC-13), the system shall reply once per such message with the not-linked notice from AC-9 and shall not log it to any User's conversation.
- AC-19: The system shall log every outbound message the bot sends to a linked client (operator-sent messages, the first greeting, and the `/stop` confirmation), each with direction `outbound`, text, status, and timestamp. Replies to unlinked chats (AC-9, AC-18, AC-15) are not logged because no User exists.
- AC-20: WHEN the same Telegram update is delivered more than once (identified by its update id), the system shall process and log it exactly once.
- AC-21: WHEN a client sends `GET /users/:id/telegram-messages`, the system shall return that User's logged messages, both directions, in chronological order (oldest first), each with direction, text or placeholder type, status, error reason (if any), and timestamp.
- AC-22: IF `:id` in `GET /users/:id/telegram-messages` does not match any existing User, THEN the system shall return a "not found" error.
- AC-23: WHERE the request supplies a cursor/limit, `GET /users/:id/telegram-messages` shall return at most the requested number of most recent entries (default 100, maximum 500) and a way to fetch earlier ones.

### Operator sending

- AC-24: WHEN a client sends `POST /users/:id/telegram-messages` with `text` (a string, 1-4096 characters) for a User who is linked, not opted out, and not unreachable, the system shall send it to the client's Telegram chat, log an outbound entry reflecting Telegram's immediate response, and return that entry.
- AC-25: IF `:id` in `POST /users/:id/telegram-messages` does not match any existing User, THEN the system shall return a "not found" error and neither send nor log anything.
- AC-26: IF `text` is missing, not a string, empty, whitespace-only, or longer than 4096 characters, THEN the system shall reject the request with a validation error and neither send nor log anything.
- AC-27: IF the User is not linked, is opted out, or is marked unreachable, THEN the system shall reject `POST /users/:id/telegram-messages` with a conflict-style error stating which condition applies, and shall not contact Telegram.
- AC-28: IF Telegram answers a send with 403 (bot blocked by the user), THEN the system shall log the entry with status `failed`, mark the User `unreachable`, and stop all further sends until the client re-links (AC-12).
- AC-29: IF Telegram answers a send with 429, THEN the system shall wait for the interval Telegram specifies and retry; IF it still fails, THEN it shall log the entry as `failed`.
- AC-30: IF Telegram answers with any other error or does not answer within the configured timeout, THEN the system shall log the entry as `failed` with a failure reason, log full error detail server-side only, and return a generic gateway error to the caller.
- AC-31: WHEN Telegram reports that a linked client blocked the bot, the system shall mark the User `unreachable`; WHEN it reports the client unblocked the bot, the system shall clear `unreachable` (an opted-out User stays opted out).
- AC-32: The system shall disclose, in the first bot message sent to a newly linked client (AC-8), that the bot is operated by the business, what it will be used for, and how to stop (`/stop`). WHERE `TELEGRAM_PRIVACY_POLICY_URL` is configured, the message shall also include that URL; WHERE it is not, the message is sent without it and the system shall log a startup warning.

### Receiving updates

- AC-33: The system shall accept webhook updates only when the secret header sent by Telegram matches the configured secret (compared in constant time); IF it is missing or wrong, THEN the system shall reject the request and process nothing.
- AC-34: WHEN a valid update arrives at the webhook, the system shall acknowledge it with a success response without waiting for any slow downstream work.
- AC-35: WHERE no public webhook URL is configured (local development), the system shall receive updates via long polling instead, and shall not run polling and webhook mode at the same time.
- AC-36: The system shall validate at startup that the bot token is set; IF it is missing, THEN the application shall fail to start with a configuration error. The webhook secret is required only when a webhook URL is configured. `TELEGRAM_PRIVACY_POLICY_URL` is optional (must be a valid https URL when set).
- AC-37: The system shall never log, return in any response, or persist in plain text the bot token or webhook secret.

### Data deletion

- AC-38: WHEN a client sends `DELETE /users/:id/telegram-messages` for an existing User, the system shall permanently delete all logged Telegram messages of that User and return a success response with no body; the User's link/opt-out status is unchanged. IF `:id` does not match any User, THEN the system shall return a "not found" error. Conversations are otherwise kept until such a deletion request (no automatic expiry in v1).

## Edge cases

- Link opened by someone other than the intended client (forwarded link): whoever presses Start first claims the link (single-use). Accepted limitation; the operator can regenerate (AC-4) if the wrong chat linked, and the new link re-links (AC-10).
- Token expires between generation and use: handled by AC-9.
- Burst of messages from one client: all are logged in arrival order; no message is dropped.
- Telegram redelivers an update after a slow ack: handled by AC-20.
- A client's Telegram display name or username changes: not tracked in v1; conversations are keyed by User, not by Telegram profile.
- User deleted/phone edited: conversation log is keyed by User; phone number is not part of the Telegram link. (User deletion is not currently available; if added, its handling of this log is a separate decision.)
- Messages longer than 4096 characters in the operator send path are rejected (AC-26), not split.
- Concurrent operator sends to the same User are permitted (as with SMS); order in the log follows send time.
- Bot token is revoked in BotFather: sends fail per AC-30; startup continues.
- Known MVP limitation: the new REST endpoints have no authentication, authorization, or rate limiting; revisit before any non-trial deployment.

## Non-functional

- Untrusted input: all text from Telegram (message text, names, usernames, update payloads) is data only. It must be stored and displayed as plain text, never interpreted as markup, instructions, SQL, or shell input, and must not reach any LLM prompt without a later spec that addresses this.
- Compliance: the bot messages only clients who opted in via Start; consent evidence (token issue time, link time, opt-out time) is retained. A privacy policy link must be reachable from the bot (greeting via `TELEGRAM_PRIVACY_POLICY_URL`, and BotFather description) before any public launch - writing and hosting the policy is an operational step, not part of this spec.
- Each outbound Telegram request is bounded by a timeout (target: 10 seconds).
- Outbound sends honour Telegram rate limits (about 1 message per second per chat); the system shall not send in uncontrolled parallel bursts to one chat.
- Schema changes require a migration, run as its own step, never on app boot.
- The bot token comes only from the environment variable `TELEGRAM_BOT_TOKEN` and must never be written to any spec, source file, or log. Bot username and webhook settings are also configuration, not code.

## Out of scope

- AI-agent auto-replies, tools, and prompts (future spec; will reuse the stored conversation).
- Telegram Business mode, media, groups, inline keyboards, payments, topics.
- Sending the invitation link automatically through WhatsApp/SMS.
- Merging Telegram messages into the unified activity timeline of `front/specs/SPEC-02-pstn-call-and-agent-settings.md`.
- Automatic retention expiry and data export (deletion on request is AC-38).
- Writing/hosting the privacy policy itself.

## Open questions / assumptions

Assumptions made by the spec author, plus decisions confirmed by the user (marked Decision):

- Assumption: regular opt-in bot, not Telegram Business mode.
- Assumption: links are single-use, expire after 7 days, tokens stored hashed, and generating a new link invalidates the previous unused one.
- Decision (user): opt-out is via `/stop`; the client re-enables themself by sending `/start` (AC-13a); there is no operator "force re-enable".
- Assumption: only private chats are handled; group/channel updates are ignored.
- Assumption: history is returned oldest-first with a recent-N window, no full pagination UI.
- Assumption: bot username is supplied by configuration (the existing bot is `caller_test123456789_bot`) so the link can be built.
- Decision (user): conversations are kept until the client asks for deletion; the operator can delete a User's history (AC-38). No auto-expiry in v1.
- Decision (user): no privacy policy URL yet; `TELEGRAM_PRIVACY_POLICY_URL` is optional and a placeholder until the policy exists. Required before public launch.
- Decision (user): the operator cannot send to an `unreachable` client (AC-27); the state clears when the client unblocks the bot (AC-31) or sends `/start` (AC-13a).

## Changelog

- 2026-10-05 — created
