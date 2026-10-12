// GET /api/jira/search — the FAKED Jira Cloud `GET /rest/api/3/search` response,
// built from the seed JSON (lib/server/jira.ts). This is the raw payload Beacon
// ingests; the board you see is this response, adapted. The static Pages export
// omits it.

import { NextResponse } from "next/server";
import { jiraSearch } from "@/lib/server/jira";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(jiraSearch());
  } catch (err) {
    return NextResponse.json(
      { error: String(err instanceof Error ? err.stack || err.message : err) },
      { status: 500 },
    );
  }
}
