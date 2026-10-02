# Spec: PSTN AI call UX, agent settings, and activity timeline | Spec ID: SPEC-02 | Status: draft

## Problem & why

Staff need to actually ring a contact's real phone number and watch an AI agent hold a live, scripted conversation with them, configure what the agent says, and afterward review everything that happened with that contact — calls and messages alike — in one place. This spec covers the "Call" row action's new behavior, a page for editing the agent's global script, and a per-user activity timeline. It does not re-specify backend call/pipeline/message-logging behavior (see `back/specs/SPEC-02-pstn-ai-calling-agent.md`, `back/specs/SPEC-01-whatsapp-messaging.md`, `back/specs/SPEC-03-sms-messaging.md`).

This feature **replaces** the existing in-app browser-to-browser demo call entirely (the previous `CallDialog`-based mic-toggle UX reachable from the same "Call" button) — it is not kept as a second, parallel option.

## Goals / Non-goals

- Goals:
  - Clicking "Call" on a `/users` row places a real outbound PSTN call and shows its live status and transcript as the conversation happens.
  - Block starting a second call to a user who already has one in progress.
  - An Agent Settings page/section where staff can view and edit the single global system prompt used for every call.
  - A per-user activity view showing a unified, chronological timeline of that user's calls (with transcripts) and WhatsApp/SMS message history.
  - Clear feedback across a call's connecting/in-progress/completed/failed states.
- Non-goals:
  - Any in-app browser-to-browser calling — the previous demo call experience is fully replaced, not kept as an alternative.
  - Audio playback of calls — no audio is recorded or stored (text transcript only, per `back/specs/SPEC-02-pstn-ai-calling-agent.md`).
  - Editing the system prompt per user or per call — exactly one global prompt, edited only on the Agent Settings page.
  - Automatic retry UI for failed calls — staff retry manually via the same "Call" button.
  - Authentication/authorization.
  - The "Message", "SMS", and "Edit" row actions, and the user list itself — see `front/specs/SPEC-01-users-messaging.md`.

## User stories

- As a staff member, I want to click "Call" and watch the AI agent's live conversation with the contact, so I know the call is actually happening and what's being said.
- As a staff member, I want the system to stop me from starting a second call to someone who's already on a call, so I don't double-dial.
- As a staff member, I want to configure what the agent says on every call, so I can adjust the script without a code change.
- As a staff member, I want to open a contact and see every call and message sent to them in one timeline, so I have the full picture of my interactions with them.

## Acceptance criteria (EARS)

### Call button & live call dialog

- AC-1: WHEN staff clicks "Call" on a user row who has no call currently in progress, the system shall request a new call via the backend and open a call dialog bound to that user showing an initiating/connecting state.
- AC-2: WHILE a user has a call in progress (per the backend's reported state), the system shall disable that user's "Call" button so a second call cannot be started for them.
- AC-3: WHILE a call is in progress, the system shall display its current status and each transcript turn (speaker and text) as it becomes available, without requiring a manual page reload.
- AC-4: WHEN a call reaches a completed state, the system shall display the final status (including, in plain language, which end condition applied: the agent finished, the callee hung up, or the maximum duration was reached) and the full transcript, and shall stop blocking a new call for that user.
- AC-5: WHEN a call reaches a failed state, the system shall display an explanation that the call failed, including the failure reason if one was provided by the backend, and shall stop blocking a new call for that user.
- AC-6: IF the request to start a call fails (e.g. the backend reports a call is already in progress, or a network/HTTP error), THEN the system shall show an error and not display a connecting state as if a call had started.

### Agent settings

- AC-7: The system shall provide an Agent Settings page where the current global system prompt is shown in an editable text field.
- AC-8: WHEN the Agent Settings page loads, the system shall fetch and display the current system prompt (or the backend's built-in default, if none has been saved yet).
- AC-9: IF the system prompt field is empty or whitespace-only when Save is clicked, THEN the system shall block the save, show a validation error, and not send the update request.
- AC-10: WHILE the save request is in flight, the system shall disable the field and the Save button.
- AC-11: WHEN the save succeeds, the system shall show a confirmation toast and display the newly saved value as current.
- AC-12: IF the save fails, THEN the system shall show an error toast and leave the field showing the text staff were trying to save (not revert it), so they can retry without retyping.
- AC-13: IF the request to load the current system prompt fails, THEN the system shall show an error message instead of a blank or broken field.

### Per-user activity timeline

- AC-14: WHEN staff opens a specific user's activity view, the system shall display a single chronological timeline combining that user's calls, WhatsApp messages, and SMS messages, most-recent-first.
- AC-15: Each call entry in the timeline shall show its status, end reason or failure reason, start/end timestamps, duration (once ended), and its full transcript.
- AC-16: Each WhatsApp or SMS message entry in the timeline shall show its content, delivery mode (WhatsApp only), status, and timestamp.
- AC-17: IF a user has no calls or messages yet, THEN the system shall show an explicit empty-state message instead of a blank timeline.
- AC-18: IF any one of the underlying history requests (calls, WhatsApp messages, SMS messages) fails, THEN the system shall show an error for that section specifically, without blocking display of the sections that did load successfully.

## Edge cases

- A call goes straight from "connecting" to "failed" with no transcript turns at all (busy/no-answer) — the call dialog and the timeline both show the failure with an empty transcript, not an error state.
- Call transcript text displayed in the dialog or the timeline — ultimately derived from the callee's transcribed speech, a third party's words — is rendered as plain text only, never interpreted as HTML/markup, same posture as `front/specs/SPEC-01-users-messaging.md`'s handling of backend-sourced text.
- Staff navigates away from and back to a user's activity view while a call is still in progress: covered by AC-3 — reopening shows the live-updating state again, not a stale snapshot.
- Two staff members (or two browser tabs) viewing the same in-progress call simultaneously both receive the same live updates; neither has exclusive control over it.
- A user who currently has a call in progress is also the target of a "Message," "SMS," or "Edit" action from `front/specs/SPEC-01-users-messaging.md` — those actions are unaffected; only a second "Call" is blocked (AC-2).

## Non-functional

- Accessibility: the call dialog and the Agent Settings form must trap focus while open/interactive and restore focus appropriately on close; the system-prompt field must have an accessible label and its validation error must be associated with it; all interactive elements (Call, Save, row/timeline controls) must have accessible names.
- Status and transcript updates for an in-progress call should appear to staff within a few seconds of occurring on the backend; this spec does not fix an exact update-latency number.

## Out of scope

- Audio playback or any representation of call audio.
- Per-user/per-call system prompt overrides.
- Automatic retry of failed calls.
- The "Message", "SMS", and "Edit" row actions and the base user list — `front/specs/SPEC-01-users-messaging.md`.
- Authentication/authorization.

## Open questions

- [NEEDS CLARIFICATION: Can staff manually end ("hang up") an in-progress call from the dialog, or can only the agent, the callee, or the timeout end it? If closing the call dialog is allowed while a call is in progress, does that end the call, or does it just hide the live view while the call keeps running in the background?]
- [NEEDS CLARIFICATION: Is the per-user activity timeline (AC-14..AC-18) a separate route/page (e.g. a user detail page reached from the `/users` list), or an expandable section/dialog inline on the existing list? Not specified in the clarifying dialogue for this feature.]

## Changelog

- 2026-10-02 — created
