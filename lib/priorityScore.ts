import type { Item, AttentionScore, ScoreReason } from "./types";

// The attention score is the product's core differentiator over Jira: it is not
// a magic number but the SUM of explainable reasons. We parse each reason string
// of the form "<label> (+30)" / "(+15 risk)" into a labelled, signed contribution
// and define the score as their sum — so the number can never disagree with the
// reasons shown beside it.

const WARN = /blocker|overdue|missed|risk|stale|no mitigation|no blocker|overload|client delay|critical/i;

function parseReason(raw: string): ScoreReason {
  const m = raw.match(/\(([+-]?\d+)/);
  const points = m ? parseInt(m[1], 10) : 0;
  const label = raw.replace(/\s*\([+-]?\d+[^)]*\)\s*$/, "").trim();
  return { label, points, warn: WARN.test(raw) };
}

export function bandFor(value: number): AttentionScore["band"] {
  if (value >= 70) return "high";
  if (value >= 40) return "medium";
  return "low";
}

/** Build the explainable attention score for an item from its seed reasons. */
export function attentionScore(item: Item): AttentionScore {
  const reasons = (item.priorityReasons ?? []).map(parseReason);
  const value = reasons.reduce((a, r) => a + r.points, 0);
  return { value, band: bandFor(value), reasons };
}

/** Items ranked by attention, highest first (the Priority Board order). */
export function byAttention(items: Item[]): Item[] {
  return [...items].sort(
    (a, b) => attentionScore(b).value - attentionScore(a).value
  );
}
