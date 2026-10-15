# 0010 — Retention, access and erasure are answered separately

**Status:** Accepted · 2026-10-12

## Context

The prototype had a "delete all my data" button. Challenged on whether that was
a real feature, the honest answer was no: it truncated an append-only audit log
belonging to the whole team, which is neither a privacy control nor an audit
trail. A control that looks like a compliance answer and is not one is worse
than a stated gap.

## Decision

State the policy once, in code (`lib/policy.ts`), and answer each concern
separately:

- **Retention** — decisions age out after 180 days. Applied by the system on a
  schedule (`POST /api/data/retention`, driven by `scripts/retain.mjs`), never by
  a person clicking a button, and the removal is itself appended to the log so
  the gap is explained. A sweep that removes nothing adds nothing.
- **Access** — a person exports their own events. Exporting the whole team log
  is a separate, facilitator-only action.
- **Erasure** — pseudonymise the actor rather than delete the events: the
  decision survives for audit, the identity does not. This needs sign-in to know
  who is asking, so it is **phase 4, stated and not claimed as built**.
- **Preferences** — theme, density and the nav rail never leave the viewer's
  browser and are never part of the team record.

The one destructive operation that remains is resetting a **demo instance**: an
operator action, facilitator-only, confirmed, and appended to the log it just
emptied.

## Consequences

- The privacy card, the endpoint, the CLI and the documentation cannot drift,
  because they all read the same constants.
- We ship an unanswered requirement (erasure) in writing, rather than a button
  that implies it works.
- Retention is testable and tested, including that a no-op sweep leaves no trace.

## Alternatives considered

- **Keep the delete-everything button.** Rejected: it destroys other people's
  records to satisfy one person's request.
- **Say nothing about erasure until it exists.** Rejected: a reviewer is
  entitled to know what is missing.
