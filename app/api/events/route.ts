// /api/events — the append-only human-decision log.
//   GET    : every recorded event (for the activity log / rebuild).
//   POST   : append one decision { draft, actor }. The server twin of the
//            browser's useActor().act() chokepoint. Real per-role permission
//            enforcement lands in Phase 4 (auth); for now `actor` is trusted.
//   DELETE : empty the log — the demo-instance reset, not a privacy control.
//            In server mode this log is the team's audit trail, so the caller is
//            the facilitator-only reset in components/privacy.tsx, and it
//            immediately POSTs a `data.reset` event so the emptied log still
//            records who emptied it. Ageing data out is the separate, scheduled
//            /api/data/retention; erasing one person's record is
//            pseudonymisation in phase 4. All three are set out in lib/policy.ts.

import { NextResponse } from "next/server";
import { appendEvent, clearEvents, loadEvents } from "@/lib/server/store";
import type { Draft } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await loadEvents());
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { draft?: Draft; actor?: string };
    if (!body?.draft || !body?.actor) {
      return NextResponse.json({ error: "Expected { draft, actor }" }, { status: 400 });
    }
    const ev = await appendEvent(body.draft, body.actor);
    return NextResponse.json(ev, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    return NextResponse.json({ deleted: await clearEvents() });
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
