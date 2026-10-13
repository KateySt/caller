# Spec: Browser agent test console (admin debug mode) | Spec ID: SPEC-05 | Status: draft

## Problem & why

Admins editing the agent's system prompt have no way to hear how it behaves without placing a real phone call. This spec adds an admin-only "Test in browser" mode: the admin talks to the voice agent through their microphone, using the prompt currently in the settings form (including unsaved edits), watches a live transcript, and later reviews past test conversations. It is not a client-facing feature. Backend contract, secret handling, persistence and agent behaviour are specified in `back/specs/SPEC-06-browser-agent-test-sessions.md`; this spec covers only the UI and client-side behaviour. It builds on the Agent Settings page from `front/specs/SPEC-02-pstn-call-and-agent-settings.md`.

## Goals / Non-goals

- Goals:
  - A "Test in browser" entry on the Agent Settings page that starts a voice session with the current form prompt (saved or not).
  - A live session view with microphone control, audio visualizer, live transcript, and disconnect, built from LiveKit Agents UI (shadcn-based) components.
  - A one-time admin-secret entry kept client-side, with clear/replace and 401 handling.
  - A history list and detail view of past test sessions, clearly marked as tests and kept apart from real call history.
- Non-goals:
  - Saving the prompt as a side effect of testing.
  - Placing any real call, or touching any contact's activity timeline.
  - Any end-client-facing access.
  - Camera, video, screen share, or typed chat with the agent.
  - Audio playback of past sessions (text only).
  - Deleting or editing past test sessions.
  - Real user login; the shared secret is the only gate.

## User stories

- As an admin, I want to test my draft prompt by voice from the settings page, so I can iterate before saving.
- As an admin, I want a clear message when the mic is blocked or the secret is wrong, so I know how to fix it.
- As an admin, I want to review past test conversations marked as tests, so I can compare prompt versions without confusing them with real calls.

## Acceptance criteria (EARS)

### Admin secret

- AC-1: WHILE no admin secret is held by the client, the system shall prompt the admin to enter it before any test-session request is sent, and shall send no test-session request without it.
- AC-2: WHEN the admin enters the secret, the system shall keep it only in client-side session-scoped storage (cleared when the browser tab/session closes), and shall never place it in a `NEXT_PUBLIC_*` variable, URL, query string, or log output.
- AC-3: The system shall send the secret as a request header on every test-session request (create, end, list, detail).
- AC-4: WHEN the admin chooses to clear the secret, the system shall remove it from storage and require re-entry for the next test action.
- AC-5: IF any test-session request returns 401, THEN the system shall discard the stored secret, end any live session view, and show a message that the secret was missing or wrong with a prompt to re-enter it.
- AC-6: (Removed — the backend no longer rate-limits session creation; see `back/specs/SPEC-06` AC-4.)

### Starting a test

- AC-7: The Agent Settings page shall show a "Test in browser" action next to the prompt form; the live session shall open as an inline panel on the same page beside the (locked, AC-10) form, not as a modal dialog, so the prompt in use stays visible.
- AC-8: WHEN the admin starts a test, the system shall send the prompt text currently in the form (including unsaved edits) with the session-create request, and shall not save the form or alter the saved settings.
- AC-9: IF the form's prompt is empty/whitespace-only or exceeds the same maximum length as saving, THEN the system shall block the test start, show the validation error on the field, and send nothing.
- AC-10: WHILE the form has unsaved edits, the test view shall visibly state that it is using the unsaved draft prompt. WHILE a test session is connecting or live, the prompt field and its save action shall be read-only/disabled; WHEN the session ends, they shall become editable again, and edits apply only to the next test session.
- AC-11: WHILE session creation or room connection is in progress, the system shall show a connecting state and disable the start action.
- AC-12: IF session creation fails (conflict because another test is active, validation error, or a network/server error), THEN the system shall show a specific error and not show a live session as if one had begun.

### Live session view

- AC-13: WHEN the session is connected, the system shall show an audio visualizer for the agent, a microphone toggle (mute/unmute), a disconnect control, and a live transcript of both the admin's and the agent's turns.
- AC-14: WHEN the client first connects, the system shall request microphone access only (no camera) and publish only the microphone.
- AC-15: IF microphone permission is denied or no input device is available, THEN the system shall show an explicit message explaining how to allow microphone access for the site, and shall not leave the view looking connected-and-working.
- AC-16: WHERE the browser blocks audio autoplay, the system shall show a control that, when activated, enables agent audio playback.
- AC-17: The system shall play the agent's audio whenever connected and playback is allowed; remote audio shall not be silently left unattached.
- AC-18: WHEN the admin presses disconnect, the system shall leave the room, tell the backend the session is ended, and show the session as ended.
- AC-19: WHEN the view unmounts, the page is navigated away from, or the tab closes, the system shall disconnect from the room (no leftover participant).
- AC-20: WHEN the session ends for any reason (agent finished, silence timeout, maximum duration, backend failure), the system shall show the end reason in plain language and the final transcript, and offer to start a new test.
- AC-21: IF the connection to the room drops unexpectedly, THEN the system shall show a disconnected state with an option to start a new test (it shall not silently reconnect with a stale token).
- AC-22: Transcript text shall be rendered as plain text only, never interpreted as markup.
- AC-23: WHERE the page is not served over a secure context (HTTPS or localhost), the system shall tell the admin that microphone access requires HTTPS instead of failing silently.

### History

- AC-24: The system shall provide a test-session history list on its own route (`/agent-tests`), linked from the Agent Settings page and the site header, most-recent-first, showing start time, duration, status, end/failure reason, whether the saved or a draft prompt was used (`promptSource`), and a prompt preview, with every entry labelled "Test" and presented separately from per-contact call history.
- AC-25: WHEN the admin opens a history entry, the system shall show its full prompt snapshot, saved/draft prompt label, status, end reason, timestamps, and complete transcript.
- AC-26: WHILE a listed or opened session is still in progress, the system shall refresh its status and transcript without a manual reload.
- AC-27: IF the history list is empty, THEN the system shall show an explicit empty state; IF loading fails, THEN it shall show an error with retry.
- AC-28: IF no admin secret is held when opening history, THEN the system shall prompt for it (AC-1) rather than show an error page.

## Edge cases

- Admin wants to change the prompt mid-test: not possible — the form is locked for the session's lifetime (AC-10). The admin ends the session, edits the prompt, and starts a new test.
- Two tabs: the backend allows one active test at a time; the second tab gets the AC-12 conflict message.
- Mic muted for a long period: the agent's silence timeout may end the session; AC-20 explains it.
- Browser extension or OS blocks the mic after granting: handled as AC-15 on the next failure event.
- Untrusted input: transcripts derive from speech and an LLM; render as plain text (AC-22).
- Secret storage tradeoff: session-scoped storage (cleared on tab close) is chosen over persistent storage to limit the window in which a leaked or shared-machine browser profile exposes the secret, at the cost of re-entering it per tab/session. It remains readable by any script running on the page, so no third-party scripts should be added to these pages.
- An existing real-call flow (the "Call" button, call dialog, activity timeline) is unaffected by this feature.

## Non-functional

- Accessibility: mic toggle, disconnect, and secret-entry controls have accessible names; the secret field is a password-type input with an associated label and error; connection and mic-permission errors are announced to assistive tech; the live transcript is a labelled region that does not steal focus.
- Join-latency: the client should prepare the connection as soon as the token is received to minimise time-to-first-audio; no numeric target for v1.
- No extra client packages beyond the LiveKit client libraries and LiveKit Agents UI components; the LiveKit API secret never reaches the browser.

## Out of scope

- Authentication beyond the shared secret.
- Mobile-specific audio routing/echo handling tuning.
- Exporting or sharing transcripts.
- Comparing sessions side by side.
- Backend, token minting, and agent changes (`back/specs/SPEC-06-browser-agent-test-sessions.md`).

## Open questions

None.

## Changelog

- 2026-10-12 — created
- 2026-10-12 — prompt form locked while a test session is active (AC-10); resolved open questions: history on its own `/agent-tests` route, live session as an inline panel, saved/draft prompt label in history
- 2026-10-12 — removed 429 handling (AC-6) along with the backend rate limit
