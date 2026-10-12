// Repair and canonicalise whatever a model returns into a trustworthy
// LlmDetection. A local model may omit a field, return a string weight, or get
// its own arithmetic wrong, so we RECOMPUTE score and signal from the phrase
// weights rather than trusting the model's `score`/`signal`. That keeps the
// invariant Beacon relies on everywhere: score == sum of weights, and the
// threshold decision is ours, not the model's.

import { THRESHOLD } from "../detect";
import type { LlmDetection, Phrase } from "./types";

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
