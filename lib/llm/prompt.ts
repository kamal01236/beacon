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

// ---- single-field update composer (clean up / summarize) -----------------
//
// Two narrow tasks behind the one input field an assignee uses to post a
// stand-up update:
//   - "cleanup"   : fix grammar / spelling / dictation artifacts in the note,
//                   change NOTHING about its meaning. Plain text out.
//   - "summarize" : fold the agent's seed suggestion + the recent thread + the
//                   person's note into ONE coherent update, propose a status
//                   from the allowed set, and ask clarifying questions ONLY when
//                   something material is genuinely ambiguous.
// The model never posts — a person confirms the result first — and it must not
// invent facts, so a healthy note summarizes to itself with no questions.

import type { SummarizeInput } from "./types";

/** Hard ceiling on a composed update so cost and length stay bounded. */
export const SUMMARIZE_MAX_TOKENS = 220;

export const CLEANUP_SYSTEM_PROMPT = `You tidy up a single stand-up update written or dictated by a teammate.

Rules:
- Fix spelling, grammar, punctuation, and speech-to-text artifacts. Make it read as clear, professional plain text.
- Do NOT change the meaning, add facts, remove information, or add any preamble, sign-off, or commentary.
- Keep it concise — one short paragraph. Plain text only; no markdown, no bullet points.
- Return ONLY the cleaned-up text.`;

export const SUMMARIZE_SYSTEM_PROMPT = `You help a teammate post a clear stand-up update on one work item. You are given the agent's suggested draft, the recent update thread, and the person's own note. Combine them into ONE concise update IN THE PERSON'S VOICE.

Rules:
- Write 1-3 sentences, plain text only — no markdown, no bullets, no preamble or sign-off.
- Base the update ONLY on what the inputs say. Do NOT invent progress, dates, names, or blockers. If the person's note contradicts the seed, follow the note.
- Propose "proposedStatus" as EXACTLY ONE of the allowed status values, or null if there is not enough to tell.
- "questions": ask a short clarifying question ONLY when something material is missing or ambiguous (e.g. a vague blocker with no cause, or no next step for a stalled item). If the update already reads clearly, return an empty array. Never ask more than 2.
- Return ONLY the JSON object described by the schema.`;

/** JSON schema for the summarize task (OpenAI structured outputs). */
export const SUMMARIZE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["text", "proposedStatus", "questions"],
  properties: {
    text: { type: "string" },
    proposedStatus: { type: ["string", "null"] },
    questions: { type: "array", items: { type: "string" } },
  },
} as const;

export function buildSummarizeMessage(input: SummarizeInput): string {
  if (input.mode === "cleanup") {
    return `Clean up this update:\n"""\n${input.raw}\n"""`;
  }
  const thread = input.prior?.length
    ? input.prior.map((u) => `  day ${u.day}: ${u.text}`).join("\n")
    : "  (no earlier updates)";
  return [
    `Item ${input.code} — "${input.title}" (current status: ${input.status}, owner: ${input.owner}).`,
    `Allowed status values: ${(input.statusOptions ?? []).join(", ") || "(none given)"}`,
    `Agent's suggested draft: ${input.seed ? `"${input.seed}"` : "(none)"}`,
    `Recent update thread (oldest first):`,
    thread,
    `The person's note (their words — may be rough or dictated):`,
    `"""\n${input.raw || "(empty)"}\n"""`,
    `Compose the update.`,
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
