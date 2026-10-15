# 0002 — Two layers: human work priority, and a computed attention score

**Status:** Accepted · 2026-10-09

## Context

Facilitators must be able to set priority — that is their job, and it maps to
the tracker's own priority field. But a human-set priority goes stale, and a
single number that is sometimes hand-edited and sometimes computed can never be
trusted or explained.

## Decision

Two separate things, named differently in the UI:

1. **Work priority** — Critical/High/Medium/Low, set by a person, overridable
   with a logged reason, mapped 1:1 to the tracker's priority column.
2. **Attention score** — 0–100, computed from 14 named rules, **never**
   hand-edited, and explainable by `reasons[]` that must sum to it.

Work priority is an **input** to the score, so raising it moves the score
transparently rather than bypassing it. Facilitators also get Pin and Snooze,
both logged.

## Consequences

- "Why is this at the top?" always has an answer made of rules a team can read
  and tune.
- The score can never be argued with as an opinion: it is arithmetic over facts.
- Tuning is a product decision with a visible diff (a rule changes), not a
  per-item override war.

## Alternatives considered

- **One editable number.** Rejected: the moment someone edits it, no reader can
  tell computed from manual, and the explanation becomes a lie.
- **Score only, no human priority.** Rejected: it removes the facilitator's
  judgement and breaks the mapping to the tracker.
