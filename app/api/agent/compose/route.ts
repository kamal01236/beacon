// POST /api/agent/compose — draft one short comment for a proposal (§4 job 4).
//   body: { itemId, intent, fallback, audience? }
// Returns { text, source: "llm" | "template", provider, model }. The model
// phrases the intent Beacon already decided; `fallback` (the rule template) is
// returned verbatim if no model is configured or it errors, so the approve UI
// always has an editable comment. Writes nothing — the human still approves.
// The static Pages export omits it, so the browser keeps the rule template.

import { NextResponse } from "next/server";
import { composeComment } from "@/lib/server/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { itemId?: string; intent?: string; fallback?: string; audience?: string | null };
    if (!body?.itemId || typeof body.intent !== "string" || typeof body.fallback !== "string") {
      return NextResponse.json({ error: "Expected { itemId, intent, fallback }" }, { status: 400 });
    }
    return NextResponse.json(await composeComment(body.itemId, body.intent, body.fallback, body.audience ?? null));
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
