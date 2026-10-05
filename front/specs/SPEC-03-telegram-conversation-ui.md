# Spec: Telegram link and conversation UI | Spec ID: SPEC-03 | Status: draft

## Problem & why

Operators need to invite a client to the Telegram bot, see the whole bot conversation with that client, and send a text message, all from the app. The backend owns the behavior and contracts (`back/specs/SPEC-04-telegram-bot-linking-and-conversation-log.md`); this spec covers only the operator-facing screens. Acceptance criteria for backend behavior are not repeated here.

## Goals / Non-goals

- Goals:
  - Let the operator generate a Telegram invitation link for a contact and copy it.
  - Show a contact's Telegram status (not linked / linked / opted out / unreachable).
  - Show the per-contact conversation history (both directions) as a chat-style view.
  - Let the operator send a text message from that view when the contact is reachable.
  - Let the operator delete a contact's logged conversation on the client's request (backend AC-38).
- Non-goals:
  - Sending the link automatically through another channel.
  - Media, rich formatting, attachments, emoji pickers.
  - Live push updates (no websockets); refresh is manual or by interval polling only while the view is open.
  - AI-reply controls.

## User stories

- As an operator, I want a "Telegram" action on a contact, so that I can generate and copy their invite link.
- As an operator, I want to open a contact's Telegram conversation, so that I can read what the client and the bot said and when.
- As an operator, I want to type a message in that view, so that I can reply to a linked client.

## Acceptance criteria (EARS)

- AC-1: Each user row shall always contain a "Telegram" control in its action group, alongside the existing controls, without changing the row's layout structure.
- AC-2: WHEN the operator opens the Telegram view for a contact, the system shall request that contact's Telegram status and message history and show a loading state until both resolve.
- AC-3: The Telegram view shall always display the contact's Telegram status as a text label (not only colour).
- AC-4: WHEN the operator presses "Generate link", the system shall request a new invitation for that contact and display the resulting link with its expiry, and offer a "Copy" control.
- AC-5: WHEN the contact already has a pending invitation or is already linked and the operator presses "Generate link", the system shall warn that any previously issued unused link will stop working before the request is sent, and require confirmation.
- AC-6: WHEN the operator presses "Copy", the system shall copy the link to the clipboard and show a confirmation toast; IF copying is not possible, THEN the system shall leave the link selectable and show a toast saying so.
- AC-7: IF generating the link fails, THEN the system shall show an error toast and keep the view usable.
- AC-8: The system shall display the conversation oldest-first, with inbound and outbound messages visually distinguished (and distinguishable without colour), each with its timestamp; failed outbound messages shall be marked as failed with their reason.
- AC-9: WHEN a history entry is a non-text placeholder, the system shall show a labelled placeholder (for example "photo (not shown)") instead of content.
- AC-10: IF the history is empty, THEN the system shall show an explicit empty-state message that depends on status (not linked: send the link; linked: no messages yet).
- AC-11: IF loading the history fails, THEN the system shall show an error message with a retry control instead of a blank view.
- AC-12: WHILE the status is `linked`, the system shall enable the message input and Send button.
- AC-13: WHILE the status is `not_linked`, `opted_out`, or `unreachable`, the system shall disable the message input and Send button and show the reason next to them, worded per status:
  - `not_linked`: the client has not opened the bot yet; generate a link and send it to them.
  - `opted_out`: the client stopped messages with /stop; only the client can resume, by sending /start to the bot. The operator cannot re-enable it, and generating a new link is not required.
  - `unreachable`: the client blocked the bot; sending resumes automatically once they unblock the bot or send /start.
- AC-14: IF the message is empty, whitespace-only, or over 4096 characters when Send is pressed, THEN the system shall block the send, show a validation error near the field, and send no request.
- AC-15: WHILE a send is in flight, the system shall disable the input and Send button.
- AC-16: WHEN a send succeeds, the system shall append the returned entry to the conversation and clear the input.
- AC-17: IF a send fails, THEN the system shall show an error toast, keep the typed text, and refresh status and history (so a blocked bot shows as `unreachable`).
- AC-18: WHILE the Telegram view is open, the system shall refresh status and history at a regular interval (target: every 10 seconds) so new client messages appear without reloading, and shall stop when the view closes.
- AC-19: WHEN the view is opened again after being closed, the system shall show a clean state with a fresh load (no stale draft, link, or history).
- AC-20: The Telegram view shall provide a "Delete history" control, enabled whenever the loaded history is non-empty and disabled while a delete or a send is in flight.
- AC-21: WHEN the operator presses "Delete history", the system shall ask for confirmation stating that all logged Telegram messages with this contact will be permanently deleted and that the contact's link status is not changed, and shall send no request until confirmed.
- AC-22: WHEN the deletion is confirmed and succeeds, the system shall clear the conversation, show the empty state for the current status (AC-10), and show a confirmation toast.
- AC-23: IF the deletion fails, THEN the system shall show an error toast, keep the conversation as it was, and leave the control usable for a retry.
- AC-24: The contact activity timeline shall include the most recent Telegram messages (up to 50) merged chronologically with calls, WhatsApp and SMS, each labelled with channel and direction (text, not only colour), failed ones with their reason, non-text ones as a labelled placeholder (AC-9).
- AC-25: IF the Telegram history fails to load, THEN the timeline shall report that on its own without hiding other sources; IF more messages exist than shown, THEN it shall say so and point to the Telegram view.

## Edge cases

- A very long conversation: the view loads the most recent window (per the backend contract) and offers a control to load earlier messages if available.
- Client message text, names, and the generated link are rendered as plain text, never as markup.
- The raw invitation link is shown only in the response to generation and is not retrievable afterwards; closing the view discards it (the operator regenerates if lost).
- Status changes while the view is open (client sends /stop): the next refresh disables sending (AC-13, AC-18). If the client later sends /start, the next refresh re-enables it.
- The operator has no control to re-enable an opted-out contact (backend AC-13a: only the client can).
- Deleting history removes only the logged messages; it does not unlink the client or reset opt-out.

## Non-functional

- Accessibility: the dialog/view traps focus and restores it on close; the message input and buttons have accessible names; new-message arrival does not steal focus; status and direction are not conveyed by colour alone.

## Out of scope

- Everything listed under Non-goals; backend behavior (see the backend spec).

## Open questions / assumptions

- Assumption: the view is a dialog/panel opened from the user row (consistent with the Message/SMS dialogs), not a new route; if a dedicated page is preferred, only AC-1/AC-2 wording changes.
- Assumption: polling interval of 10 seconds while open is acceptable in lieu of live push.
- Resolved: Telegram messages appear in the unified activity timeline (AC-24..AC-25).

## Changelog

- 2026-10-05 — timeline question resolved: Telegram merged into `app/users/[id]` (AC-24, AC-25); removed from Non-goals

- 2026-10-05 — created
- 2026-10-05 — aligned with resolved backend decisions: status reason wording (AC-13), delete-history control (AC-20..AC-23)
