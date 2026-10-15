// GET /api/jira/search — the FAKED Jira Cloud `GET /rest/api/3/search` response,
// built from the seed JSON (lib/server/jira.ts). This is the raw payload Beacon
// ingests; the board you see is this response, adapted. The static Pages export
// omits it.

import { ok, route } from "@/lib/server/http";
import { jiraSearch } from "@/lib/server/jira";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("GET /api/jira/search", () => ok(jiraSearch()));
