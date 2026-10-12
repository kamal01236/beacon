// GET /api/world — the current world (base snapshot + events applied).
// The server build serves this; the static Pages export omits it (it keeps
// using the bundled seed + localStorage).

import { NextResponse } from "next/server";
import { loadWorld } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const world = await loadWorld();
    return NextResponse.json(world);
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
