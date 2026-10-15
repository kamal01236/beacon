# 0001 — Beacon is a companion layer over Jira/ADO, not a replacement

**Status:** Accepted · 2026-10-09

## Context

The problems we set out to solve — lost client actions, hidden blockers, vague
requirements, stand-up overhead — all live around a tracker that teams already
use and will not abandon. Anything that required migrating the backlog would be
rejected before it was evaluated.

## Decision

The tracker stays the system of record. Beacon reads from it and writes back
only what a human approved, on a **small, stated set of fields** (status, our
work priority to the tracker's priority, blocker flag, comments). Everything we
add — attention score, AI summaries, discussion and assist threads, clarity,
retro, analytics — lives in our own store and is not mirrored anywhere.

## Consequences

- Adoption costs a team nothing: no migration, low switching cost.
- The ingestion adapter is a real seam, not a detail: `lib/server/jira.ts`
  returns a Jira-shaped payload so that swapping the fake for a `fetch` leaves
  the rest of the system untouched.
- Two-way sync has to handle the tracker changing under us. That is designed
  (diagram 21) rather than assumed, and the conflict case re-raises for a person
  instead of overwriting.
- We never own the whole truth, so "what does the tracker say" and "what does
  Beacon say" must both be visible. The roll-up row shows them side by side.

## Alternatives considered

- **Be the tracker.** Rejected: it competes on the one axis where incumbents are
  strongest and the switching cost is highest.
- **Full two-way mirror.** Rejected: every field becomes a conflict surface,
  for no benefit the team asked for.
