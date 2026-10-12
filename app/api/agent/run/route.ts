// POST /api/agent/run — trigger an agent run on demand ("Run now", or a webhook
// receiver calling it with trigger "event"). Scheduled runs call runAgent()
// directly from agent/run.mjs. Body: { trigger?: "manual"|"event"|"schedule" }.

import { NextResponse } from "next/server";
import { runAgent, type RunTrigger } from "@/lib/server/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { trigger?: RunTrigger };
    const result = await runAgent(body.trigger ?? "manual");
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
