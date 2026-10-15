// POST /api/agent/analyze — re-run the detector on one edited draft.
//   body: { itemId, text, status? }
// Returns the agent's verdict (reads-as-blocked or not) with a plain-language
// answer, the phrases behind it, and which detector ran. Writes nothing — this
// informs the person before they post an update or approve a change. The static
// Pages export omits it, so the browser falls back to the local rule detector.
//
// Rate limited: this is one of the three routes that can call a paid model.

import { ok, route, LLM_RATE_LIMIT } from "@/lib/server/http";
import { analyzeDraft } from "@/lib/server/agent";
import { ITEM_STATUSES, type ItemStatus } from "@/lib/types";
import { object, parseBody, str, text, nullable, oneOf } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = object<{ itemId: string; text: string; status: ItemStatus | null }>({
  itemId: str({ max: 64, pattern: /^[A-Za-z0-9._:-]+$/ }),
  // An update can legitimately be long prose; 4 KB is far more than a stand-up
  // note and keeps the prompt (and its cost) bounded.
  text: text(4_000),
  status: nullable(oneOf(ITEM_STATUSES)),
});

export const POST = route(
  "POST /api/agent/analyze",
  async ({ req }) => {
    const body = await parseBody(req, Body);
    return ok(await analyzeDraft(body.itemId, body.text, body.status ?? undefined));
  },
  { limit: LLM_RATE_LIMIT },
);
