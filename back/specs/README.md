# Specs (back)

Feature specs for `back/` live here, one file per feature: `SPEC-NN-<slug>.md`.

- Written by the `spec-creator` subagent (`.claude/agents/spec-creator.md`) — invoke it to draft or update a spec through a clarifying dialogue instead of writing one from scratch.
- Verified against the actual implementation by the `plan-verifier` subagent (`.claude/agents/plan-verifier.md`) before a feature branch merges.
- A spec describes **what** the feature does and its boundaries (user stories, EARS acceptance criteria, edge cases, non-goals) — not the implementation. It is **not** a replacement for `PLAN.md`-style implementation plans.
- One spec = one feature. When a feature evolves, edit its existing spec file and append a `## Changelog` entry — don't fork a `-v2` copy. Git history carries the "why it changed."
- `Spec ID` increments per folder: look at the highest `SPEC-NN` already here before creating a new one.
- A feature that spans both `front/` and `back/` (e.g. the WhatsApp messaging work in `PLAN.md`) gets a spec here if the backend owns the core behavior/contract; cross-reference the frontend spec (if any) under `Supersedes`/a note rather than duplicating acceptance criteria.

## Index

| Spec ID | Feature | Status |
|---|---|---|
| SPEC-01 | WhatsApp text messaging from the user list (v1: messages only) | draft |
| SPEC-02 | PSTN AI calling agent | draft |
| SPEC-03 | SMS text messaging from the user list | draft |
| SPEC-04 | Telegram bot client linking and conversation log (UI: `front/specs/SPEC-03`) | draft |
