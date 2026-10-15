// POST /api/agent/compose — draft one short comment for a proposal (§4 job 4).
//   body: { itemId, intent, fallback, audience? }
// Returns { text, source: "llm" | "template", provider, model }. The model
// phrases the intent Beacon already decided; `fallback` (the rule template) is
// returned verbatim if no model is configured or it errors, so the approve UI
// always has an editable comment. Writes nothing — the human still approves.
// The static Pages export omits it, so the browser keeps the rule template.
//
// Rate limited: this is one of the three routes that can call a paid model.

import { ok, route, LLM_RATE_LIMIT } from "@/lib/server/http";
import { composeComment } from "@/lib/server/agent";
import { object, parseBody, str, text, nullable } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = object<{ itemId: string; intent: string; fallback: string; audience: string | null }>({
  itemId: str({ max: 64, pattern: /^[A-Za-z0-9._:-]+$/ }),
  intent: str({ max: 500 }),
  // The rule template. Required: without it there is nothing to fall back to,
  // and a comment proposal with no approvable text is not a proposal.
  fallback: text(2_000),
  audience: nullable(str({ max: 64, pattern: /^[A-Za-z0-9 ._-]+$/ })),
});

export const POST = route(
  "POST /api/agent/compose",
  async ({ req }) => {
    const body = await parseBody(req, Body);
    return ok(await composeComment(body.itemId, body.intent, body.fallback, body.audience));
  },
  { limit: LLM_RATE_LIMIT },
);
