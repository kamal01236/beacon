// The data policy, stated once as code so the privacy card, the retention
// endpoint, the CLI and the docs cannot drift apart.
//
// WHY THERE IS NO "DELETE EVERYTHING" BUTTON (in server mode)
// The decision log is append-only by design (lib/events.ts): it is the audit
// trail behind "every decision is reversible and visible". An audit log any one
// person can truncate is not an audit trail — and erasing the whole log to
// satisfy one person's request destroys everybody else's record. So the four
// concerns a real data policy has to answer are answered separately:
//
//   • Retention — decision events age out after DECISION_RETENTION_DAYS. Applied
//     by the system (POST /api/data/retention, scripts/retain.mjs), on a
//     schedule, never by a person clicking a button; the removal is itself
//     appended to the log so the gap is explained.
//   • Access (a subject-access request) — a person exports their own events.
//     Exporting the whole team log is a separate, facilitator-only action.
//   • Erasure — the actor on a person's events is PSEUDONYMISED rather than the
//     events deleted: the decision survives for audit, the identity does not.
//     That needs sign-in to know who is asking, so it is phase 4
//     (BACKEND-PLAN.md §8); until then it is stated, not claimed as built.
//   • Preferences — theme, density and the nav rail never leave the viewer's
//     own browser and are never part of the team record (lib/prefs.ts).
//
// The one destructive operation that remains is resetting a *demo instance*,
// which is an operator action rather than a privacy control: facilitator-only,
// confirmed, and appended to the log it just emptied.

/** How long a recorded decision is kept before the retention sweep drops it. */
export const DECISION_RETENTION_DAYS = 180;

/**
 * The actor recorded for something the system did rather than a person —
 * today only the retention sweep. Rendered as "Beacon" in the activity log.
 */
export const SYSTEM_ACTOR = "system";

export interface RetentionReport {
  /** The window applied, in days. */
  olderThanDays: number;
  /** Events timestamped before this are past the window. */
  cutoff: string;
  /** How many events the log holds. */
  total: number;
  /** How many of them are past the window. */
  expired: number;
}

export function cutoffFor(olderThanDays: number = DECISION_RETENTION_DAYS, now: Date = new Date()): string {
  return new Date(now.getTime() - olderThanDays * 86_400_000).toISOString();
}

/**
 * What the policy would remove, without removing it. Takes anything with an ISO
 * timestamp so both the server store and the browser's own cache can be checked
 * against the same rule.
 */
export function retentionReport(
  events: { at: string }[],
  olderThanDays: number = DECISION_RETENTION_DAYS,
  now: Date = new Date(),
): RetentionReport {
  const cutoff = cutoffFor(olderThanDays, now);
  return { olderThanDays, cutoff, total: events.length, expired: events.filter((e) => e.at < cutoff).length };
}
