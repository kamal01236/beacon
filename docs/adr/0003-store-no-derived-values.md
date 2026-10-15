# 0003 — Nothing derived is ever stored

**Status:** Accepted · 2026-10-09

## Context

The first version of the seed data carried `priorityScore`, `priorityReasons`,
`blockerSignal` and similar fields. They drifted immediately: a rule changed and
the stored number stayed, so the board showed a score whose explanation no
longer added up to it. A pre-computed AI response cache had the same problem in
a worse place — it made the demo look alive while being a fixture.

## Decision

The stored data holds **raw facts only**. Every derived value — attention score,
reasons, signals, confidence, insights, adoption rates — is computed on read by
pure functions. The AI cache was deleted.

## Consequences

- The invariant `score == sum(reasons)` is enforceable, and is enforced by a
  test over every seeded item.
- Changing a rule changes every screen at once; there is nothing to re-bake.
- Reads do more work. It is cheap at this size (facts are memoised per world,
  keyed by the detector generation), and a real deployment would memoise per
  request.
- Historical series that genuinely cannot be recomputed — a true burndown needs
  the state of each past day — require a stored daily snapshot. We do not fake
  one, which is why the burndown draws only the days it really has, and
  `SNAPSHOT_DAY` is a phase-4 table rather than a column added now.

## Alternatives considered

- **Cache derived values with invalidation.** Rejected for a prototype: the
  invalidation bug is exactly the drift we were trying to remove.
