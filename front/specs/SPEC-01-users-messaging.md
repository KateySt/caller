# Spec: WhatsApp text messaging from the user list | Spec ID: SPEC-01 | Status: draft

## Problem & why

Staff need a way to send a WhatsApp text message to a known user without leaving the app. The backend already has to fall back to a pre-approved message template whenever a user hasn't messaged the business within the last 24 hours (a WhatsApp Cloud API constraint), so whoever sends the message needs to be told plainly which of the two actually happened — otherwise they'll believe a freeform message arrived when only a generic template did. This spec covers the `/users` list and the send-message flow; it does not re-specify backend delivery logic (see the backend's own spec for that).

## Goals / Non-goals

- Goals:
  - Display a list of existing users so staff can pick who to message.
  - Let staff send a WhatsApp text message to any listed user and clearly see whether it was sent as a freeform message or a template fallback.
  - Give staff clear, actionable feedback for the idle/sending/success/error states of a send.
  - Structure each user row's actions so sibling controls (Call, SMS, Edit) can be added without changing the row's layout.
  - Let staff add a new user from the list page, so the messaging flow can be exercised without going through Swagger.
  - Let staff edit an existing user's name and/or phone number from the list page.
  - Let staff send an SMS to a user, as a channel independent of WhatsApp.
- Non-goals:
  - Deleting users from the frontend (editing is in scope — see AC-23..AC-29).
  - Voice-calling UI/behavior and the per-user activity timeline (calls + WhatsApp + SMS history) — see `front/specs/SPEC-02-pstn-call-and-agent-settings.md`.
  - Search, filtering, sorting, or pagination controls on the user list.
  - Real-time/live updates of user data (e.g. the list does not auto-refresh while open).

## User stories

- As a staff member, I want to see a list of users so I can choose who to message.
- As a staff member, I want to open a simple dialog and send a WhatsApp text to a chosen user without navigating away from the list.
- As a staff member, I want to be told explicitly when my message was sent as a template fallback instead of a normal message, so I'm not misled about what the recipient actually received.
- As a staff member, I want a failed send to leave my typed message intact so I can retry without retyping it.
- As a staff member, I want to add a new contact from the list page, so I can register someone and message them without leaving the app.
- As a staff member, I want to fix a typo in a contact's name or phone number without recreating the contact.
- As a staff member, I want to send a plain SMS to a contact independent of WhatsApp, so I can reach them through a different channel.

## Acceptance criteria (EARS)

- AC-1: The system shall always display on the `/users` page the list of users fetched via `GET /api/users`, showing at least each user's name and phone number.
- AC-2: WHEN a user opens the `/users` page, the system shall request the list of users via `GET /api/users`.
- AC-3: IF `GET /api/users` returns an empty list, THEN the system shall display a text message stating there are no users instead of an unexplained empty list.
- AC-4: IF the `GET /api/users` request fails (network or HTTP error), THEN the system shall display an error message about failing to load the user list instead of a blank or broken page.
- AC-5: Each user row shall always contain an action button group with "Message", "Call", "SMS", and "Edit" controls, laid out so this spec (Message, SMS, Edit) and `front/specs/SPEC-02-pstn-call-and-agent-settings.md` (Call) can each evolve their own button's behavior without requiring changes to the row's or list's structure.
- AC-6: WHEN the staff member clicks the "Message" button on a given user's row, the system shall open a send-message dialog bound to that specific user, with an empty text field and in the "idle" state.
- AC-7: WHEN a send-message dialog is already open for one user and the staff member clicks "Message" on a different user's row, the system shall close the previous dialog and open a new one bound to the newly selected user, in the "idle" state with an empty text field.
- AC-8: IF the message text field is empty or contains only whitespace at the moment Send is clicked, THEN the system shall block the send, show a client-side validation error near the field, and not send a `POST /api/users/:id/messages` request.
- AC-9: IF the message text exceeds 4096 characters at the moment Send is clicked, THEN the system shall block the send, show a client-side validation error near the field, and not send a `POST /api/users/:id/messages` request.
- AC-10: WHILE the `POST /api/users/:id/messages` request is in flight (the "sending" state), the system shall make the Send button and the text field non-interactive and shall not allow the dialog to be closed (not by clicking outside, not by Escape, not by the Cancel button).
- AC-11: WHEN `POST /api/users/:id/messages` returns a successful response with `deliveryMode: 'freeform'`, the system shall show a toast that explicitly confirms a normal message was sent, and close the dialog.
- AC-12: WHEN `POST /api/users/:id/messages` returns a successful response with `deliveryMode: 'template'`, the system shall show a toast that explicitly states a template message was sent instead of free text because the user hasn't messaged within the last 24 hours, and close the dialog.
- AC-13: IF the `POST /api/users/:id/messages` request fails (network error or an error status response), THEN the system shall show a toast describing the error, leave the dialog open, and preserve the typed text unchanged, allowing the user to retry sending.
- AC-14: WHEN the staff member closes the dialog while it is in the "idle" or "error" state (via the Cancel button, clicking outside, or Escape), the system shall close the dialog without sending a request.
- AC-15: WHEN the send-message dialog is opened again (for the same or a different user) after a previous close, the system shall show it in a clean "idle" state with an empty text field, regardless of what was typed during the previous time it was open.

### Creating a user

- AC-16: The system shall always show an "Add contact" control on the `/users` page, including when the list is empty.
- AC-17: WHEN the user presses "Add contact", the system shall open a creation dialog in a clean "idle" state with empty name and phone number fields, regardless of what was typed the previous time it was open.
- AC-18: IF the name field is empty or whitespace-only when Add is pressed, THEN the system shall block submission, show a client-side validation error next to the field, and not send `POST /api/users`.
- AC-19: IF the phone number does not match E.164 format when Add is pressed, THEN the system shall block submission, show a client-side validation error next to the field, and not send `POST /api/users`.
- AC-20: WHILE the `POST /api/users` request is in flight, the system shall disable both fields and the Add button and shall not allow the dialog to be dismissed (outside press, Escape, or Cancel).
- AC-21: WHEN `POST /api/users` succeeds, the system shall close the dialog, show a confirmation toast, and refresh the list so the new contact appears without a manual page reload.
- AC-22: IF `POST /api/users` fails — including the conflict returned for an already-registered phone number — THEN the system shall show a toast describing the error, keep the dialog open, and preserve both entered values so they can be corrected and resubmitted.

### Editing a user

- AC-23: WHEN staff clicks "Edit" on a user row, the system shall open an edit dialog pre-filled with that user's current name and phone number, in a clean "idle" state.
- AC-24: IF the name field is emptied or whitespace-only when Save is pressed, THEN the system shall block submission, show a client-side validation error next to the field, and not send `PATCH /api/users/:id`.
- AC-25: IF the phone number does not match E.164 format when Save is pressed, THEN the system shall block submission, show a client-side validation error next to the field, and not send `PATCH /api/users/:id`.
- AC-26: WHILE the `PATCH /api/users/:id` request is in flight, the system shall disable both fields and the Save button and shall not allow the dialog to be dismissed (outside press, Escape, or Cancel).
- AC-27: WHEN `PATCH /api/users/:id` succeeds, the system shall close the dialog, show a confirmation toast, and refresh the list so the updated values appear without a manual page reload.
- AC-28: IF `PATCH /api/users/:id` fails — including the conflict returned when the phone number already belongs to a different user — THEN the system shall show a toast describing the error, keep the dialog open, and preserve the edited values so they can be corrected and resubmitted.
- AC-29: WHEN the edit dialog is opened again (for the same or a different user) after a previous close, the system shall show it pre-filled with that user's current (not previously edited) name and phone number, in a clean "idle" state.

### Sending an SMS

- AC-30: The SMS dialog shall follow the same open/validate/sending/success/error/reopen state machine as the Message dialog (AC-6, AC-7, AC-9, AC-10, AC-14, AC-15), bound to `POST /api/users/:id/sms-messages` instead of the WhatsApp endpoint, and to the "SMS" button instead of "Message".
- AC-31: IF the SMS text field is empty, contains only whitespace, or exceeds 1600 characters at the moment Send is clicked, THEN the system shall block the send, show a client-side validation error near the field, and not send a `POST /api/users/:id/sms-messages` request.
- AC-32: WHEN `POST /api/users/:id/sms-messages` succeeds, the system shall show a toast confirming the SMS was sent and close the dialog — unlike WhatsApp, there is no freeform/template distinction to surface.
- AC-33: IF the `POST /api/users/:id/sms-messages` request fails (network error or an error status response), THEN the system shall show a toast describing the error, leave the dialog open, and preserve the typed text unchanged, allowing the user to retry sending.

## Edge cases

- User list has zero entries: covered by AC-3 (explicit empty-state message, not a blank area).
- User list has zero entries and the operator needs a first contact: the "Add contact" control is outside the list, so it stays reachable in the empty state (AC-16).
- `GET /api/users` fails or times out: covered by AC-4 (explicit error message, not a silent blank page or unhandled crash).
- User switches target mid-flow by clicking another row's "Message" button while a dialog is open: covered by AC-7 (previous dialog closes, new one opens clean).
- Send request fails or times out after the client-side validation already passed (e.g. network drop, backend validation edge case, backend 5xx): covered by AC-13 — the dialog stays open and the typed text is preserved so the user doesn't lose their draft.
- Backend returns a response that is not one of the two known `deliveryMode` values or is otherwise malformed: treated as an error (same handling as AC-13) rather than silently assumed to be a success.
- A user's name or phone number as returned by the backend is rendered as plain text in the list and inside any toast/dialog content — never interpreted as HTML/markup — since it originates from stored data the frontend did not produce itself.
- Staff opens the Edit dialog for a user, another tab/staff member edits that same user, then the first save is submitted: the request reaches the backend as an ordinary `PATCH /api/users/:id` and either succeeds (last write wins, list refresh shows the final state) or fails the phone-number-conflict case (AC-28) — no client-side staleness detection is required for v1.

## Non-functional

- Accessibility: every dialog must trap focus while open and restore focus to the control that opened it on close; each form field must have an accessible label and associate its validation error with the field; all interactive elements (Send, Add contact, Cancel, row action buttons) must have accessible names.
- The user list rendering must not degrade noticeably for the list sizes expected in this iteration (no virtualization or pagination required for v1, per the explicit non-goal above).

## Out of scope

- The "Call" button's behavior and any per-user activity/history view — see `front/specs/SPEC-02-pstn-call-and-agent-settings.md`.
- Deleting users.
- Sorting, filtering, searching, or paginating the user list.

## Changelog

- 2026-10-02 — created
- 2026-10-02 — create-user dialog moved from out-of-scope into scope (AC-16..AC-22) so the messaging flow can be exercised without Swagger
- 2026-10-02 — added user editing (AC-23..AC-29) and an SMS send action (AC-30..AC-33) as part of the PSTN AI calling-agent bundle; removed "editing" from non-goals (deletion remains out of scope) and updated AC-5's row layout to include Call/SMS/Edit, cross-referencing the new `front/specs/SPEC-02-pstn-call-and-agent-settings.md` for the Call button and activity timeline
