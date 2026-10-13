 Spec: Scheduled calls and messages page | Spec ID: SPEC-04 | Status: draft

## Problem & why

Operators need one place to see everything scheduled, cancel mistakes, follow a running scheduled call, and review what happened. Backend contract: `back/specs/SPEC-05-scheduled-calls-and-messages.md`.

## Goals / Non-goals

- Goals: a dedicated page (e.g. `/scheduled`) listing upcoming and past jobs; a form to schedule a call or message; cancel while `scheduled`; live progress of a running call; history.
- Non-goals: editing a job, recurring jobs, multi-recipient scheduling, interrupting a running call, calendar view, notifications when a job finishes.

## User stories

- As an operator, I want a Scheduled page with Upcoming and History views, so that I can manage and audit jobs.
- As an operator, I want to schedule a call or message by picking contact, channel, date/time and text.
- As an operator, I want to cancel an upcoming item, but not one that is already running.

## Acceptance criteria (EARS)

- AC-1: The system shall provide a Scheduled page reachable from the main navigation.
- AC-2: The page shall show two views: **Upcoming** (`scheduled`, `running`, soonest first) and **History** (`completed`, `failed`, `cancelled`, `missed`, newest first, paginated).
- AC-3: Each row shall show contact name/phone, channel (icon + label), scheduled time in the viewer's local timezone, status badge, and, for message channels, the text (truncated, full on expand).
- AC-4: WHEN the operator submits the schedule form with contact, channel, date/time and (for message channels) text, the system shall create the job and show it in Upcoming.
- AC-5: The form shall validate before submit: date/time at least the minimum lead time ahead, text required for message channels and within the channel's max length, no text field for `call`; errors are shown inline per field.
- AC-6: IF the backend rejects creation, THEN the form shall stay open, show the error, and preserve entered values.
- AC-7: WHILE a job is `scheduled`, its row shall offer a **Cancel** action with confirmation; WHEN confirmed, the job shall move to History as `cancelled`.
- AC-8: WHILE a job is `running`, the Cancel action shall be disabled with the reason "Already in progress".
- AC-9: IF a cancel is rejected because the job started in the meantime, THEN the UI shall show "Already in progress" and refresh the row to its real status.
- AC-10: WHILE a call job is `running`, the page shall show a live progress panel: call state, elapsed time, and transcript turns as they arrive, refreshing automatically (polling) until the call is terminal.
- AC-11: WHILE the page is open, list state shall refresh periodically so jobs move from `scheduled` to `running` to History without a manual reload.
- AC-12: WHEN a history row is opened, the system shall show outcome details: failure/missed reason, start/finish times, and for calls the duration and full transcript.
- AC-13: Empty states: Upcoming — "Nothing scheduled" with a Schedule button; History — "No history yet".
- AC-14: Loading shall show skeletons; a list fetch error shall show a retry action without affecting the other view.
- AC-15: IF the backend rejects creation for Telegram (not linked, opted out, unreachable), THEN the system shall show the backend's validation message as an error toast and keep the form open (AC-6).
- AC-16: The date/time picker shall not allow dates more than 1 month ahead or in the past; IF the backend still rejects the date, THEN the message is shown as in AC-6.

## Contact deletion (backend: `back/specs/SPEC-05` AC-20a..f)

- AC-17: The contact list shall offer a **Delete** action per contact.
- AC-18: WHEN the operator triggers Delete, the system shall show a confirmation that names the contact and states that all their calls, messages and scheduled items will be permanently deleted; nothing is sent until confirmed.
- AC-19: WHEN deletion succeeds, the contact shall disappear from the list, and the Scheduled page shall no longer show any of their jobs.
- AC-20: IF the backend rejects deletion because of an active call or job (conflict), THEN the system shall show the message as an error toast and keep the contact.
- AC-21: IF deletion fails for any other reason, THEN the system shall show an error toast and keep the contact in the list.
- AC-22: WHILE a deletion request is in flight, the confirm button shall be disabled to prevent a second submit.

## Edge cases

- Job fires while the page is open and the operator clicks Cancel at the same moment — AC-9.
- Times are always rendered in the viewer's local timezone; the UTC offset is available on hover.
- Very long message text is truncated in the row.

## Out of scope

- Editing, recurrence, calendar view, notifications, bulk actions.

## Changelog

- 2026-10-05 — created
- 2026-10-05 — added contact deletion UI (AC-17..22)
- 2026-10-05 — Telegram unavailability surfaces as a toast on create instead of a disabled channel; 1-month max date
