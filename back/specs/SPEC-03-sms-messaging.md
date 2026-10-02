# Spec: SMS text messaging from the user list | Spec ID: SPEC-03 | Status: draft

## Problem & why

WhatsApp messaging (`back/specs/SPEC-01-whatsapp-messaging.md`) only reaches contacts who have WhatsApp and is subject to Meta's 24-hour session/template rules. Staff also need a plain SMS channel to the same contacts, sent through a dedicated SMS provider, independent of WhatsApp's constraints and account. This spec covers sending a text message over SMS to an existing `User` and logging that send so it can appear in that `User`'s activity history.

Cross-reference: the frontend "SMS" action (not covered here) consumes the `POST /users/:id/sms-messages` and `GET /users/:id/sms-messages` contracts defined in this spec; see `front/specs/SPEC-01-users-messaging.md`. The `User.phoneNumber` sent to here is owned by `back/specs/SPEC-01-whatsapp-messaging.md`.

## Goals / Non-goals

- Goals:
  - Send a plain text SMS to an existing `User`'s `phoneNumber` via a dedicated SMS provider (e.g. Twilio SMS — configurable, not hardcoded to one vendor), independent of the WhatsApp channel's session-window/template rules.
  - Log every outbound SMS attempt (`User` reference, recipient phone number snapshot, body, resulting status, timestamp), retrievable as that `User`'s SMS history.
  - Startup-time validation of the SMS provider configuration this feature depends on.
- Non-goals:
  - Receiving inbound SMS or any two-way SMS conversation handling.
  - Delivery-status webhooks / asynchronous delivery confirmation — logged status reflects only the provider's immediate response to the send request.
  - Media/MMS — text only.
  - Session-window or template-fallback logic — unlike WhatsApp, every SMS is sent as free text.
  - Blocking concurrent sends to the same `User` — unlike PSTN calls (`back/specs/SPEC-02-pstn-ai-calling-agent.md`), multiple SMS sends to the same `User` may be in flight or sent in quick succession without restriction.
  - Authentication, authorization, or rate limiting on any endpoint introduced by this feature — accepted as a known MVP limitation, consistent with `back/specs/SPEC-01-whatsapp-messaging.md`.
  - Any user interface — this spec covers backend behavior and contracts only.

## User stories

- As an operator, I want to send a plain SMS to a contact independent of WhatsApp, so I can reach them even if they don't use WhatsApp or are outside its session window.
- As an operator, I want every SMS I send logged against the contact, so it shows up in that contact's activity history.

## Acceptance criteria (EARS)

- AC-1: WHEN a client sends `POST /users/:id/sms-messages` with a body containing `body` (a string, 1-1600 characters) for an existing User, the system shall send an SMS to that User's `phoneNumber` via the configured SMS provider, create an SMS message log entry (recipient phone number snapshot, `body`, resulting status, timestamp) reflecting the provider's immediate response, and return it.
- AC-2: IF `:id` in `POST /users/:id/sms-messages` does not match any existing User, THEN the system shall return a "not found" error and neither send nor log anything.
- AC-3: IF `body` in `POST /users/:id/sms-messages` is missing, not a string, empty, whitespace-only, or exceeds 1600 characters, THEN the system shall reject the request with a validation error and neither send nor log anything.
- AC-4: IF the SMS provider returns an unsuccessful response while attempting to send, THEN the system shall record the log entry with status `failed` and a failure reason, return a generic gateway error to the client, log the full error detail server-side, and not report a successful send.
- AC-5: IF a request to the SMS provider does not receive a response within the configured timeout, THEN the system shall abort the request and handle it the same way as an unsuccessful response (AC-4).
- AC-6: WHEN a client sends `GET /users/:id/sms-messages`, the system shall return that User's logged SMS entries ordered most-recent-first.
- AC-7: IF `:id` in `GET /users/:id/sms-messages` does not match any existing User, THEN the system shall return a "not found" error.
- AC-8: The system shall validate at application startup that the SMS provider's required credentials (e.g. account id, auth token, sender number) are set; IF any required one is missing, THEN the application shall fail to start and report a configuration error.

## Edge cases

- A message body made entirely of whitespace is treated as empty for the purposes of AC-3 (same posture as `back/specs/SPEC-01-whatsapp-messaging.md`'s AC-12 edge case).
- A User's `phoneNumber` is edited after an SMS was sent to them — the log entry keeps the recipient-number snapshot from send time (AC-1) and is not retroactively rewritten.
- Known MVP limitation: `POST /users/:id/sms-messages` and `GET /users/:id/sms-messages` have no authentication, authorization, or rate limiting — accepted for v1, consistent with SPEC-01 and SPEC-02; revisit before any non-trial/public deployment.

## Non-functional

- Each outbound call to the SMS provider must be bounded by a request timeout (target: 10 seconds), same convention as `back/specs/SPEC-01-whatsapp-messaging.md`.

## Out of scope

- Inbound SMS, delivery-status webhooks, MMS/media, two-way conversations.
- WhatsApp messaging (`back/specs/SPEC-01-whatsapp-messaging.md`) and PSTN calling (`back/specs/SPEC-02-pstn-ai-calling-agent.md`).
- Any user interface.

## Changelog

- 2026-10-02 — created
