// /api/agent/run — the agent's run endpoint.
//   POST : trigger a run on demand ("Run now" on the Agent screen, or a webhook
//          receiver calling it with trigger "event"). agent/run.mjs calls this
//          on its cadence. Body: { trigger?: "manual"|"event"|"schedule" }.
//   GET  : the last few recorded runs, newest first, so the Agent screen can
//          show a REAL run (when it happened, which detector and model ran)
//          instead of a nominal one derived from the frozen demo clock.

import { NextResponse } from "next/server";
import { runAgent, type RunTrigger } from "@/lib/server/agent";
import { loadRuns } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const runs = await loadRuns(5);
    // The full snapshot is large and the screen only needs the headline figures.
    return NextResponse.json(runs.map(({ summary: _summary, ...head }) => head));
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { trigger?: RunTrigger };
    const result = await runAgent(body.trigger ?? "manual");
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
