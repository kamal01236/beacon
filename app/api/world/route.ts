// GET /api/world — the current world (base snapshot + events applied).
// The server build serves this; the static Pages export omits it (it keeps
// using the bundled seed + localStorage).

import { ok, route } from "@/lib/server/http";
import { loadWorld } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("GET /api/world", async () => ok(await loadWorld()));
