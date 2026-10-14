// POST /api/agent/summarize — clean up or summarize one free-text update.
//   body: { itemId, mode: "cleanup" | "summarize", raw, seed? }
// Returns { text, proposedStatus, questions, source, provider, model }. The
// model either tidies the person's note ("cleanup") or folds it with the agent's
// seed + recent thread into one coherent update with a proposed status and any
// clarifying questions ("summarize"). Writes nothing — the person confirms and
// posts. If no model is configured or it errors, a rule cleanup is returned, so
// the single-field composer never dead-ends. The static Pages export omits it,
// so the browser falls back to local cleanup.

import { NextResponse } from "next/server";
import { summarizeUpdate } from "@/lib/server/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { itemId?: string; mode?: "cleanup" | "summarize"; raw?: string; seed?: string | null };
    if (!body?.itemId || (body.mode !== "cleanup" && body.mode !== "summarize") || typeof body.raw !== "string") {
      return NextResponse.json({ error: "Expected { itemId, mode: 'cleanup'|'summarize', raw }" }, { status: 400 });
    }
    return NextResponse.json(await summarizeUpdate(body.itemId, body.mode, body.raw, body.seed ?? null));
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
