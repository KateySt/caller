# Spec: WhatsApp text messaging from the user list (v1: messages only) | Spec ID: SPEC-01 | Status: draft

## Problem & why

There is currently no way to reach a contact over WhatsApp from this system. WhatsApp Cloud API only allows a business to send a free-form text message to someone who messaged it within the last 24 hours; outside that window only a pre-approved message template may be sent. Without a `User` record to track each contact's phone number and last inbound message time, and without logic that picks the right send mode automatically, outbound messages would silently fail for anyone who hasn't texted first. This spec covers the `Users` resource and the `WhatsApp` messaging/webhook behavior needed to send a text message to a known contact reliably, regardless of whether they are inside or outside the 24-hour session window.

Cross-reference: the frontend user-list and "Message" dialog (not covered here) consume the `GET /users`, `POST /users`, `PATCH /users/:id`, `POST /users/:id/messages`, and `GET /users/:id/whatsapp-messages` contracts defined in this spec; see `front/specs/SPEC-01-users-messaging.md`. PSTN calling and SMS are separate features that reuse `User.phoneNumber` — see `back/specs/SPEC-02-pstn-ai-calling-agent.md` and `back/specs/SPEC-03-sms-messaging.md`.

## Goals / Non-goals

- Goals:
  - A `User` record (name, unique E.164 phone number, last-inbound-message timestamp, last WhatsApp message status, timestamps) that a future voice-calling feature can also reuse unchanged.
  - Listing, creating, and editing (name and/or phone number) `User` records.
  - Sending a text message to a specific `User`, automatically choosing free-form delivery (inside the 24h window) or a configured fallback template (outside the window, or if the window is unknown), and reporting back which mode was actually used.
  - Logging every outbound WhatsApp send per `User` (content actually sent, delivery mode, resulting status, timestamp), retrievable as that `User`'s WhatsApp message history.
  - A webhook endpoint that completes Meta's verification handshake and ingests inbound message/status events to keep each `User`'s session-window and delivery-status data current.
  - Startup-time validation of all WhatsApp Cloud API configuration this feature depends on.
- Non-goals:
  - Deleting `User` records (no delete endpoint in v1 — editing is in scope, see AC-26..AC-31).
  - Any authentication, authorization, or rate limiting on any endpoint introduced by this feature — accepted as a known MVP limitation (see Edge cases).
  - Verifying the authenticity of inbound webhook POST bodies via a request signature — accepted as a known MVP limitation for v1 (see Edge cases).
  - Deduplicating repeated/retried webhook events.
  - Initiating or receiving voice/phone calls of any kind — see `back/specs/SPEC-02-pstn-ai-calling-agent.md`.
  - SMS messaging — a separate provider/feature, see `back/specs/SPEC-03-sms-messaging.md`.
  - Sending media, interactive, or broadcast/multi-recipient messages — text only, one recipient per request.
  - Searching, filtering, sorting, or paginating the user list.
  - Any user interface — this spec covers backend behavior and contracts only.

## User stories

- As an operator (via the frontend or Swagger), I want to register a contact's name and phone number, so that I can later message them.
- As an operator, I want to see the list of registered contacts, so that I can pick one to message.
- As an operator, I want to send a text message to a contact and be told whether it went out as a normal message or as a template notification, so that I understand what the recipient actually received.
- As the WhatsApp platform (Meta), I want to verify my webhook subscription and deliver inbound message/status events, so that the system keeps each contact's session window and delivery status up to date.
- As an operator, I want to correct a contact's name or phone number, so I can fix a typo without recreating the contact.

## Acceptance criteria (EARS)

### Users — data & creation

- AC-1: The system shall store each User with a unique phone number in E.164 format.
- AC-2: WHEN a client sends `POST /users` with a valid `name` (non-empty string) and `phoneNumber` (E.164 format), the system shall create a new User record and return its public fields (`id`, `name`, `phoneNumber`, `createdAt`).
- AC-3: IF `phoneNumber` in `POST /users` does not match E.164 format, THEN the system shall return a validation error and not create the record.
- AC-4: IF `phoneNumber` in `POST /users` already belongs to an existing User, THEN the system shall return a conflict error and not create a duplicate.
- AC-5: IF `name` in `POST /users` is missing or empty, THEN the system shall return a validation error and not create the record.
- AC-6: WHEN a client sends `GET /users`, the system shall return the list of all Users with their public fields (`id`, `name`, `phoneNumber`, `createdAt`).
- AC-7: WHILE no User has been created yet, the system shall return an empty list (not an error) for `GET /users`.

### Sending a message

- AC-8: WHEN a client sends `POST /users/:id/messages` with a body containing `body` (a string, 1-4096 characters) for an existing User, the system shall send a text message to that User via the WhatsApp Cloud API and return which delivery mode was actually used (`deliveryMode`: `'freeform'` or `'template'`).
- AC-9: WHILE the target User's `lastInboundMessageAt` is within the last 24 hours of the current time, the system shall send a free-form text message with the `body` content and return `deliveryMode: 'freeform'`.
- AC-10: WHILE the target User's `lastInboundMessageAt` is absent (null) or outside the last 24 hours, the system shall send the message using the configured fallback template (instead of the arbitrary `body` text) and return `deliveryMode: 'template'`.
- AC-11: IF `:id` in `POST /users/:id/messages` does not match any existing User, THEN the system shall return a "not found" error and not call the WhatsApp Cloud API.
- AC-12: IF `body` in `POST /users/:id/messages` is missing, not a string, empty, or exceeds 4096 characters, THEN the system shall reject the request with a validation error and not call the WhatsApp Cloud API.
- AC-13: IF the WhatsApp Cloud API returns an unsuccessful (non-2xx) response while attempting to send — regardless of the reason (including when the fallback template does not exist or is not yet approved) — THEN the system shall return a generic gateway error to the client, log the full error detail on the server, and not report a successful delivery.
- AC-14: IF a request to the WhatsApp Cloud API does not receive a response within the configured timeout, THEN the system shall abort the request and handle it the same way as an unsuccessful response (AC-13).

### Editing a user

- AC-26: WHEN a client sends `PATCH /users/:id` with a `name` and/or `phoneNumber` for an existing User, the system shall update the provided field(s) and return the User's updated public fields.
- AC-27: IF `:id` in `PATCH /users/:id` does not match any existing User, THEN the system shall return a "not found" error and make no change.
- AC-28: IF `phoneNumber` in `PATCH /users/:id` is present and does not match E.164 format, THEN the system shall return a validation error and make no change.
- AC-29: IF `phoneNumber` in `PATCH /users/:id` is present and already belongs to a different existing User, THEN the system shall return a conflict error and make no change.
- AC-30: IF `name` in `PATCH /users/:id` is present but empty or whitespace-only, THEN the system shall return a validation error and make no change.
- AC-31: IF `PATCH /users/:id` is sent with neither `name` nor `phoneNumber` present, THEN the system shall return a validation error and make no change.

### Message history

- AC-32: WHEN a send attempt via `POST /users/:id/messages` completes (successfully or not), the system shall record a WhatsApp message log entry for that User capturing the content actually sent (the free-form body or the fallback template used), the delivery mode, the resulting status, the phone number it was sent to, and a timestamp.
- AC-33: WHEN a client sends `GET /users/:id/whatsapp-messages`, the system shall return that User's logged WhatsApp message entries ordered most-recent-first.
- AC-34: IF `:id` in `GET /users/:id/whatsapp-messages` does not match any existing User, THEN the system shall return a "not found" error.

### Webhook — verification handshake

- AC-15: WHEN Meta sends a webhook verification request (`GET`) with a `hub.verify_token` matching the configured value, the system shall return the `hub.challenge` value in the response body with status 200.
- AC-16: IF the `hub.verify_token` in the webhook verification request does not match the configured value, THEN the system shall reject the request (403) and not return `hub.challenge`.

### Webhook — inbound events

- AC-17: WHEN Meta sends an inbound message event for a phone number matching an existing User, the system shall update that User's `lastInboundMessageAt` to the time specified in the event.
- AC-18: WHEN Meta sends a message delivery status event for a phone number matching an existing User, the system shall update that User's `lastWhatsAppMessageStatus` to the received status value.
- AC-19: IF the phone number in a webhook event does not match any existing User, THEN the system shall log the event and ignore it, without creating a new User and without an error.
- AC-20: IF the webhook POST request body is malformed or does not match the expected structure, THEN the system shall log the event and still return status 200.
- AC-21: The system shall always return status 200 for a processed webhook POST request (including the cases in AC-19 and AC-20), to avoid unnecessary retries from Meta.
- AC-22: IF Meta resends the same inbound message or status event (e.g. due to a retry), THEN the system shall process it the same way as the first time — updating the relevant field on a last-write-wins basis, without additional deduplication.

### Configuration

- AC-23: The system shall validate at application startup that `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, and `WHATSAPP_FALLBACK_TEMPLATE_NAME` are set; IF any of these variables is missing, THEN the application shall fail to start and report a configuration error.
- AC-24: WHERE `WHATSAPP_API_VERSION` is not set, the system shall use the default value `'v21.0'`.
- AC-25: WHERE `WHATSAPP_FALLBACK_TEMPLATE_LANGUAGE` is not set, the system shall use the default value `'en_US'`.

## Edge cases

- Brand-new User who has never sent an inbound message (`lastInboundMessageAt` is null) — treated as outside the session window; message send falls back to the template (AC-10).
- Two `POST /users` requests racing with the same `phoneNumber` — the unique constraint ensures only one succeeds; the other receives the conflict behavior from AC-4.
- A message body made entirely of whitespace is treated as empty for the purposes of AC-12.
- Known MVP limitation: `POST /users`, `GET /users`, and `POST /users/:id/messages` have no authentication, authorization, or rate limiting — any caller able to reach the API can create Users and trigger sends. Accepted for v1; revisit before any non-trial/public deployment.
- Known MVP limitation: the webhook `POST` endpoint does not verify a request signature (e.g. `X-Hub-Signature-256`) against the Meta app secret — only the `GET` verify-token handshake authenticates that a caller knows Meta's shared token. Accepted for v1.
- Known MVP limitation: repeated/retried webhook events are not deduplicated; a duplicate event simply re-applies the same last-write-wins update (AC-22).
- A send failure caused by the fallback template not existing or not yet being approved in Meta is surfaced identically to any other WhatsApp Cloud API send failure (AC-13) — the caller cannot distinguish "template misconfigured" from other delivery failures in v1.
- Two `PATCH /users/:id` requests racing to set the same new `phoneNumber` on two different Users — the unique constraint ensures only one succeeds; the other receives the conflict behavior from AC-29 (same pattern as AC-4's create-time race).
- A User's `phoneNumber` is edited after WhatsApp messages have already been sent to them — existing message-log entries keep the phone number that was actually used at send time (AC-32) and are not retroactively rewritten.
- Inbound webhook payloads originate from a third party (Meta) and must be treated strictly as data to read values out of (phone number, timestamp, status) — never as instructions to execute, log unescaped into privileged contexts, or forward verbatim to any downstream system that interprets text as commands.

## Non-functional

- Each outbound call to the WhatsApp Cloud API must be bounded by a request timeout (target: 10 seconds) so a slow/unresponsive upstream cannot hang a message-send request indefinitely.
- Webhook `POST` handling must respond quickly (well under Meta's retry threshold) even when the payload is malformed or references an unknown phone number, per AC-20/AC-21.

## Out of scope

- Voice/PSTN calling — see `back/specs/SPEC-02-pstn-ai-calling-agent.md` (reuses the same `User.phoneNumber`).
- SMS messaging — see `back/specs/SPEC-03-sms-messaging.md`.
- Media, interactive, template-management (creating/listing templates in Meta), or broadcast messaging.
- User delete, search, filtering, sorting, pagination (editing is in scope — see AC-26..AC-31).
- Webhook POST signature verification and event deduplication (see Edge cases — explicit known limitations, not silently dropped).

## Changelog

- 2026-10-02 — created
- 2026-10-02 — added `PATCH /users/:id` (name/phone editing, AC-26..AC-31) and WhatsApp message logging (`GET /users/:id/whatsapp-messages`, AC-32..AC-34) to support the per-user activity timeline introduced by the PSTN calling-agent feature (`back/specs/SPEC-02-pstn-ai-calling-agent.md`); removed "no update" from non-goals (deletion remains out of scope). This was a scope addition identified while drafting SPEC-02/SPEC-03, not a correction of a prior error.
