// POST /api/agent/summarize — clean up or summarize one free-text update.
//   body: { itemId, mode: "cleanup" | "summarize", raw, seed? }
// Returns { text, proposedStatus, questions, source, provider, model }. The
// model either tidies the person's note ("cleanup") or folds it with the agent's
// seed + recent thread into one coherent update with a proposed status and any
// clarifying questions ("summarize"). Writes nothing — the person confirms and
// posts. If no model is configured or it errors, a rule cleanup is returned, so
// the single-field composer never dead-ends. The static Pages export omits it,
// so the browser falls back to local cleanup.
//
// Rate limited: this is one of the three routes that can call a paid model, and
// the one a person can trigger repeatedly while editing a sentence.

import { ok, route, LLM_RATE_LIMIT } from "@/lib/server/http";
import { summarizeUpdate } from "@/lib/server/agent";
import { object, parseBody, str, text, nullable, oneOf } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = object<{ itemId: string; mode: "cleanup" | "summarize"; raw: string; seed: string | null }>({
  itemId: str({ max: 64, pattern: /^[A-Za-z0-9._:-]+$/ }),
  mode: oneOf(["cleanup", "summarize"] as const),
  // Dictated notes ramble; 4 KB is generous for one stand-up update and keeps
  // the prompt bounded.
  raw: text(4_000),
  seed: nullable(text(4_000)),
});

export const POST = route(
  "POST /api/agent/summarize",
  async ({ req }) => {
    const body = await parseBody(req, Body);
    return ok(await summarizeUpdate(body.itemId, body.mode, body.raw, body.seed));
  },
  { limit: LLM_RATE_LIMIT },
);
