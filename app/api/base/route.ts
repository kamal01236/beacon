// GET /api/base — the unfolded base snapshot (items + updates) the browser
// hydrates from, sourced from the faked Jira (or Postgres when DATABASE_URL is
// set). The client folds this with the event log using the same reducer the
// server uses. The static Pages export omits it, so the browser falls back to
// the bundled seed there.

import { NextResponse } from "next/server";
import { loadBase } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await loadBase());
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
