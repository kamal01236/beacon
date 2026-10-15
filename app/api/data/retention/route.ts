// /api/data/retention — the retention half of the data policy (lib/policy.ts).
//
//   GET  : the policy and how much of the log is past it. Read-only: this is the
//          dry run, and what the privacy card reports.
//   POST : apply it — delete the events past the window, then append one
//          `data.retained` event recording how many went and under what window,
//          so the only other non-append-only operation still leaves its trace.
//
// This is deliberately a system endpoint rather than a button: retention is a
// schedule (scripts/retain.mjs is just the clock, exactly as the agent worker is
// for runs), not something a person decides item by item.

import { ok, route, WRITE_RATE_LIMIT } from "@/lib/server/http";
import { appendEvent, loadEvents, pruneEvents } from "@/lib/server/store";
import { DECISION_RETENTION_DAYS, SYSTEM_ACTOR, cutoffFor, retentionReport } from "@/lib/policy";
import { log } from "@/lib/server/log";
import { int, object, optional, parseBody, query } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A window a policy could plausibly state: one day to ten years. */
const WindowDays = optional(int({ min: 1, max: 3650 }), DECISION_RETENTION_DAYS);

export const GET = route("GET /api/data/retention", async ({ req }) =>
  ok(retentionReport(await loadEvents(), query(req, "days", WindowDays))),
);

export const POST = route(
  "POST /api/data/retention",
  async ({ req, requestId }) => {
    const { days: olderThanDays } = await parseBody(req, object<{ days: number }>({ days: WindowDays }));
    const cutoff = cutoffFor(olderThanDays);
    const removed = await pruneEvents(cutoff);
    // Only leave a marker when something was actually removed — a sweep that
    // finds nothing to do should not add a row to the audit trail every night.
    if (removed > 0) await appendEvent({ kind: "data.retained", removed, olderThanDays }, SYSTEM_ACTOR);
    // Deleting records is worth a log line of its own, at info, every time.
    log.info("retention sweep applied", { olderThanDays, cutoff, removed, requestId });
    return ok({ olderThanDays, cutoff, removed });
  },
  { limit: WRITE_RATE_LIMIT },
);
