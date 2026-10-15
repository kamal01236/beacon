// /api/events — the append-only human-decision log.
//   GET    : every recorded event (for the activity log / rebuild).
//   POST   : append one decision { draft, actor }. The server twin of the
//            browser's useActor().act() chokepoint. Real per-role permission
//            enforcement lands in Phase 4 (auth); for now `actor` is trusted —
//            validated as a well-formed member id, NOT as an authenticated
//            identity. See docs/SECURITY-AND-PRIVACY.md.
//   DELETE : empty the log — the demo-instance reset, not a privacy control.
//            In server mode this log is the team's audit trail, so the caller is
//            the facilitator-only reset in components/privacy.tsx, and it
//            immediately POSTs a `data.reset` event so the emptied log still
//            records who emptied it. Ageing data out is the separate, scheduled
//            /api/data/retention; erasing one person's record is
//            pseudonymisation in phase 4. All three are set out in lib/policy.ts.

import { ok, route, WRITE_RATE_LIMIT } from "@/lib/server/http";
import { appendEvent, clearEvents, loadEvents } from "@/lib/server/store";
import { EVENT_KINDS, type Draft } from "@/lib/events";
import { object, parseBody, str, oneOf, anyObject } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** An id we are willing to put in a log line and a database row. */
const ID = str({ max: 64, pattern: /^[A-Za-z0-9._:-]+$/ });

// The draft's own fields are validated by the kind-specific reducers in
// lib/world.ts; what the boundary enforces is that this is an object naming a
// kind the system knows, so an unknown kind cannot be appended to an
// append-only log and then sit there forever as an unreadable row.
const Body = object<{ draft: Record<string, unknown>; actor: string }>({
  draft: anyObject(),
  actor: ID,
});

export const GET = route("GET /api/events", async () => ok(await loadEvents()));

export const POST = route(
  "POST /api/events",
  async ({ req }) => {
    const body = await parseBody(req, Body);
    const kind = oneOf(EVENT_KINDS as unknown as readonly string[])(body.draft.kind, "draft.kind");
    const ev = await appendEvent({ ...body.draft, kind } as unknown as Draft, body.actor);
    return ok(ev, 201);
  },
  { limit: WRITE_RATE_LIMIT },
);

export const DELETE = route(
  "DELETE /api/events",
  async () => ok({ deleted: await clearEvents() }),
  { limit: WRITE_RATE_LIMIT },
);
