// The one prompt both providers share, plus the JSON schema the model fills in.
//
// The task is narrow on purpose: classify whether the LATEST update on one item
// reads as a blocker the person has not formally raised, using the earlier
// updates only as trajectory context. Keeping the model to a schema of named
// phrases + weights is what preserves Beacon's "every signal is explainable"
// promise — the model cannot return an opinion without the evidence for it.

import { THRESHOLD } from "../detect";
import type { DetectInput } from "./types";

export const SYSTEM_PROMPT = `You read agile stand-up updates and decide whether the LATEST update on a work item reads as "blocked but not saying so" — the person sounds stuck, is waiting on something, cannot proceed, or is asking for help, yet no formal blocker has been raised.

Rules:
- Judge the LATEST update. Use earlier updates only as trajectory (a worry that persists or worsens is stronger than a one-off).
- Extract the specific PHRASES that carry distress, each with a positive integer weight 1-3 (3 = explicit "stuck"/"blocked"/"can't proceed"/"need help", 2 = "waiting on"/"unable"/"keeps failing"/"no response", 1 = vaguer "issues"/"problems").
- Extract any RELIEF phrases that reduce concern ("making progress", "on track", "fix in hand", "resolved"), each with a negative weight (-1 or -2).
- score = sum of all weights. signal = score >= ${THRESHOLD}.
- Be conservative: do NOT flag normal progress. If the latest update is healthy, return signal=false with an empty hits array.
- rationale: ONE plain sentence explaining the decision. No markdown.
Return ONLY the JSON object described by the schema.`;

/** JSON schema for providers that support structured outputs (OpenAI). */
export const DETECTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["signal", "score", "hits", "relief", "rationale"],
  properties: {
    signal: { type: "boolean" },
    score: { type: "integer" },
    hits: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["phrase", "weight"],
        properties: { phrase: { type: "string" }, weight: { type: "integer" } },
      },
    },
    relief: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["phrase", "weight"],
        properties: { phrase: { type: "string" }, weight: { type: "integer" } },
      },
    },
    rationale: { type: "string" },
  },
} as const;

// ---- comment generation (§4 job 4) ---------------------------------------
//
// A deliberately narrow writing task: take an intent Beacon already decided
// (from a signal's rule template) and phrase it as ONE short, collegial tracker
// comment. The model rewrites; it never decides. Output is plain text, hard-
// capped, and only ever shown to a human as an editable preview before posting.

import type { ComposeInput } from "./types";

/** Hard ceiling on a drafted comment so cost and length stay bounded. */
export const COMPOSE_MAX_TOKENS = 90;

export const COMPOSE_SYSTEM_PROMPT = `You write a SINGLE short comment on an agile work item to help it move forward. You are given the INTENT of the comment; your only job is to phrase it naturally.

Rules:
- One or two sentences, at most ~40 words. Plain text only — no markdown, no bullet points, no preamble or sign-off.
- Be concrete and collegial, not corporate. Sound like a helpful teammate.
- If an audience name is given, open by addressing them as "@Name".
- Say only what the intent supports. Do NOT invent facts, deadlines, or names, and do NOT restate the item's whole history.
- Return ONLY the comment text — nothing else.`;

export function buildComposeMessage(input: ComposeInput): string {
  return [
    `Item ${input.code} — "${input.title}" (status: ${input.status}, owner: ${input.owner}).`,
    input.audience ? `Address: @${input.audience}` : `Address: (no specific person)`,
    `Intent of the comment: ${input.intent}`,
    `For reference, a plain template says: "${input.fallback}"`,
    `Write the comment.`,
  ].join("\n");
}

export function buildUserMessage(input: DetectInput): string {
  const thread = input.updates.length
    ? input.updates.map((u) => `  day ${u.day}: ${u.text}`).join("\n")
    : "  (no updates posted yet)";
  const prior = input.prior
    ? `Already flagged: ${input.prior.flagged ? "yes" : "no"}; blocker formally raised: ${input.prior.blockedRaised ? "yes" : "no"}.`
    : "No prior state.";
  return [
    `Item ${input.code} — "${input.title}"`,
    `Status: ${input.status} · Priority: ${input.priority} · Owner: ${input.owner} · Due in ${input.dueInDays} day(s)`,
    prior,
    `Update thread (oldest first; judge the LAST line):`,
    thread,
  ].join("\n");
}
