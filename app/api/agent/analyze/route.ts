// POST /api/agent/analyze — re-run the detector on one edited draft.
//   body: { itemId, text, status? }
// Returns the agent's verdict (reads-as-blocked or not) with a plain-language
// answer, the phrases behind it, and which detector ran. Writes nothing — this
// informs the person before they post an update or approve a change. The static
// Pages export omits it, so the browser falls back to the local rule detector.

import { NextResponse } from "next/server";
import { analyzeDraft } from "@/lib/server/agent";
import type { ItemStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { itemId?: string; text?: string; status?: ItemStatus };
    if (!body?.itemId || typeof body.text !== "string") {
      return NextResponse.json({ error: "Expected { itemId, text }" }, { status: 400 });
    }
    return NextResponse.json(await analyzeDraft(body.itemId, body.text, body.status));
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
