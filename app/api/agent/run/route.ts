// /api/agent/run — the agent's run endpoint.
//   POST : trigger a run on demand ("Run now" on the Agent screen, or a webhook
//          receiver calling it with trigger "event"). agent/run.mjs calls this
//          on its cadence. Body: { trigger?: "manual"|"event"|"schedule" }.
//   GET  : the last few recorded runs, newest first, so the Agent screen can
//          show a REAL run (when it happened, which detector and model ran)
//          instead of a nominal one derived from the frozen demo clock.
//
// A run scans every active item and may call the model once per item, so it is
// the most expensive thing this service does. Two guards:
//   • SINGLE FLIGHT — a run already in progress is joined rather than started
//     again, so "Run now" clicked three times is one run, and the worker's
//     cadence cannot overlap itself when a run takes longer than the interval.
//   • RATE LIMIT — bounded triggers per minute per caller.

import { ok, route, LLM_RATE_LIMIT } from "@/lib/server/http";
import { runAgent, type RunResult, type RunTrigger } from "@/lib/server/agent";
import { loadRuns } from "@/lib/server/store";
import { log } from "@/lib/server/log";
import { object, parseBody, optional, oneOf, int, query } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = object<{ trigger: RunTrigger }>({
  trigger: optional(oneOf(["manual", "event", "schedule"] as const), "manual"),
});

/** The run in flight, if any. Joined by concurrent triggers. */
let inFlight: Promise<RunResult> | null = null;

async function runOnce(trigger: RunTrigger): Promise<{ result: RunResult; joined: boolean }> {
  if (inFlight) {
    log.info("agent run already in progress — joining it", { trigger });
    return { result: await inFlight, joined: true };
  }
  inFlight = runAgent(trigger);
  try {
    return { result: await inFlight, joined: false };
  } finally {
    inFlight = null;
  }
}

export const GET = route("GET /api/agent/run", async ({ req }) => {
  const limit = query(req, "limit", optional(int({ min: 1, max: 50 }), 5));
  const runs = await loadRuns(limit);
  // The full snapshot is large and the screen only needs the headline figures.
  return ok(runs.map(({ summary: _summary, ...head }) => head));
});

export const POST = route(
  "POST /api/agent/run",
  async ({ req }) => {
    const { trigger } = await parseBody(req, Body);
    const { result, joined } = await runOnce(trigger);
    return ok({ ...result, joined });
  },
  { limit: LLM_RATE_LIMIT },
);
