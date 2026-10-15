# 0004 — State is a base snapshot plus an append-only decision log

**Status:** Accepted · 2026-10-09

## Context

Beacon's central claim is that a person stays in control and that every decision
is visible and reversible. A mutable items table cannot support that claim: once
a status is overwritten, who changed it and what it was before are gone unless
something else was built to remember.

## Decision

`world = base snapshot + effective(events)`, folded by one reducer
(`buildWorldFrom`) that runs identically in the browser and on the server. The
event log is append-only. **Only two event kinds change an item**: a person's
own `update.posted`, and a `proposal.decided` that was approved. Corrections are
a new `event.undone`, never an edit or a delete.

## Consequences

- Undo is free and auditable: the cancelled event and the cancellation both
  remain in the log, and `effective()` drops both from the world.
- The server and the browser cannot disagree about the board, because they run
  the same fold.
- Recovery is a complete check: restore the log, replay, compare.
- Two operations are necessarily not append-only — the retention sweep and a
  demo-instance reset. Each **appends a record of itself**, so a gap in the log
  is never unexplained.
- The log grows. That is what the retention policy is for (ADR 0010).

## Alternatives considered

- **Mutable rows plus an audit table.** Rejected: two sources of truth, and the
  audit table is the one that rots.
- **Full event sourcing of the tracker's own data.** Rejected: the tracker owns
  that (ADR 0001); we snapshot it.
