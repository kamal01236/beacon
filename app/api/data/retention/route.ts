// /api/data/retention — the retention half of the data policy (lib/policy.ts).
//
//   GET  : the policy and how much of the log is past it. Read-only: this is the
//          dry run, and what the privacy card reports.
//   POST : apply it — delete the events past the window, then append one
//          `data.retained` event recording how many went and under what window,
//          so the only other non-append-only operation still leaves its trace.
//
// This is deliberately a system endpoint rather than a button: retention is a
// schedule (scripts/retain.mjs is just the clock, exactly as agent/run.mjs is
// for runs), not something a person decides item by item.

import { NextResponse } from "next/server";
import { appendEvent, loadEvents, pruneEvents } from "@/lib/server/store";
import { DECISION_RETENTION_DAYS, SYSTEM_ACTOR, cutoffFor, retentionReport } from "@/lib/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A window the caller asked for, clamped to something a policy could plausibly state. */
function windowDays(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DECISION_RETENTION_DAYS;
  return Math.min(Math.max(Math.floor(n), 1), 3650);
}

export async function GET(req: Request) {
  try {
    const days = windowDays(new URL(req.url).searchParams.get("days") ?? DECISION_RETENTION_DAYS);
    return NextResponse.json(retentionReport(await loadEvents(), days));
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { days?: number };
    const olderThanDays = windowDays(body?.days ?? DECISION_RETENTION_DAYS);
    const cutoff = cutoffFor(olderThanDays);
    const removed = await pruneEvents(cutoff);
    // Only leave a marker when something was actually removed — a sweep that
    // finds nothing to do should not add a row to the audit trail every night.
    if (removed > 0) await appendEvent({ kind: "data.retained", removed, olderThanDays }, SYSTEM_ACTOR);
    return NextResponse.json({ olderThanDays, cutoff, removed });
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
