// Repair and canonicalise whatever a model returns into a trustworthy
// LlmDetection. A local model may omit a field, return a string weight, or get
// its own arithmetic wrong, so we RECOMPUTE score and signal from the phrase
// weights rather than trusting the model's `score`/`signal`. That keeps the
// invariant Beacon relies on everywhere: score == sum of weights, and the
// threshold decision is ours, not the model's.

import { THRESHOLD } from "../detect";
import type { LlmDetection, Phrase, SummarizeResult } from "./types";

function phrases(raw: unknown, sign: 1 | -1): Phrase[] {
  if (!Array.isArray(raw)) return [];
  const out: Phrase[] = [];
  for (const p of raw) {
    if (!p || typeof p !== "object") continue;
    const phrase = String((p as { phrase?: unknown }).phrase ?? "").trim();
    let weight = Number((p as { weight?: unknown }).weight);
    if (!phrase || !Number.isFinite(weight)) continue;
    weight = Math.round(weight);
    // Coerce to the expected sign and clamp to the rule detector's range.
    weight = sign * Math.min(3, Math.abs(weight) || 1);
    out.push({ phrase, weight });
  }
  return out;
}

export function normalizeDetection(raw: unknown): LlmDetection {
  const o = (raw ?? {}) as Record<string, unknown>;
  const hits = phrases(o.hits, 1);
  const relief = phrases(o.relief, -1);
  const score = [...hits, ...relief].reduce((a, h) => a + h.weight, 0);
  const rationale = String(o.rationale ?? "").trim();
  return { hits, relief, score, signal: score >= THRESHOLD, rationale };
}

/**
 * Repair the summarize JSON into a trustworthy SummarizeResult. A local model
 * may omit fields, return questions as a string, or propose a status outside
 * the allowed set — so we coerce the shape and (when `allowed` is given) drop a
 * proposed status that is not one of the valid values, leaving it for the human.
 */
export function normalizeSummarize(raw: unknown, allowed?: string[]): SummarizeResult {
  const o = (raw ?? {}) as Record<string, unknown>;
  const text = String(o.text ?? "").trim();
  const qRaw = o.questions;
  const questions = (Array.isArray(qRaw) ? qRaw : qRaw ? [qRaw] : [])
    .map((q) => String(q ?? "").trim())
    .filter(Boolean)
    .slice(0, 2);
  let proposedStatus: string | null = o.proposedStatus == null ? null : String(o.proposedStatus).trim() || null;
  if (proposedStatus && allowed && !allowed.includes(proposedStatus)) proposedStatus = null;
  return { text, proposedStatus, questions };
}
