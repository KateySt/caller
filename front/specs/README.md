# Specs (front)

Feature specs for `front/` live here, one file per feature: `SPEC-NN-<slug>.md`.

- Written by the `spec-creator` subagent (`.claude/agents/spec-creator.md`) — invoke it to draft or update a spec through a clarifying dialogue instead of writing one from scratch.
- Verified against the actual implementation by the `plan-verifier` subagent (`.claude/agents/plan-verifier.md`) before a feature branch merges.
- A spec describes **what** the feature does and its boundaries (user stories, EARS acceptance criteria, edge cases, non-goals) — not the implementation. It is **not** a replacement for `PLAN.md`-style implementation plans.
- One spec = one feature. When a feature evolves, edit its existing spec file and append a `## Changelog` entry — don't fork a `-v2` copy. Git history carries the "why it changed."
- `Spec ID` increments per folder: look at the highest `SPEC-NN` already here before creating a new one.

## Index

| Spec ID | Feature | Status |
|---|---|---|
| SPEC-01 | WhatsApp text messaging from the user list | draft |
| SPEC-02 | PSTN AI call UX, agent settings, and activity timeline | draft |
| SPEC-03 | Telegram link and conversation UI (backend: `back/specs/SPEC-04`) | draft |
