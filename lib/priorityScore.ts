import { SEED, code, type World } from "./data";
import { factsFor } from "./facts";
import type { Item, AttentionScore, ScoreReason } from "./types";

// The attention score — computed, never stored.
//
// Each RULE looks at one fact about the item (lib/facts.ts) and may contribute
// signed points with a human label. The score is defined as the SUM of those
// contributions, so the number can never disagree with the reasons shown beside
// it, and every point traces back to a named rule a team can read and tune.

export interface Rule {
  key: string;
  name: string;
  how: string; // the rule in one line, shown in "How scoring works"
}

export const RULES: Rule[] = [
  { key: "priority", name: "Priority", how: "high +20 · medium +10 · low +5" },
  { key: "blocked", name: "Blocked", how: "+30 while blocked, plus +5 per day blocked (max +20)" },
  { key: "hidden", name: "Blocker language", how: "+20 when the latest update reads as blocked but no blocker is raised" },
  { key: "overdue", name: "Past due", how: "+15, plus +5 per day past the due date (max +40)" },
  { key: "due-soon", name: "Due soon", how: "due today +10 · tomorrow +8 · in 2 days +5" },
  { key: "blocks-others", name: "Blocks other work", how: "+10 per open item waiting on it (max +30)" },
  { key: "upstream", name: "Blocked upstream", how: "+15 when something it depends on is blocked — it cannot deliver" },
  { key: "client", name: "Client impact", how: "+10" },
  { key: "spillover", name: "Spillover", how: "+10 when carried over from the last sprint" },
  { key: "stale", name: "Gone quiet", how: "+3 per day without an update where daily updates are expected (from day 2, max +15)" },
  { key: "unowned", name: "No owner", how: "+15" },
  { key: "owner-blocked", name: "Owner stretched", how: "+5 when the owner is blocked on another item" },
  { key: "no-mitigation", name: "Unmitigated risk", how: "+8 for a risk under watch with no mitigation plan" },
  { key: "clarity", name: "Unclear story", how: "+8 when story clarity is 4/10 or below" },
];

/** At or above this, an item "needs attention" (board filter, KPI tile, agent at-risk). */
export const ATTENTION_THRESHOLD = 65;

export function bandFor(value: number): AttentionScore["band"] {
  if (value >= ATTENTION_THRESHOLD) return "high";
  if (value >= 35) return "medium";
  return "low";
}

const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? "" : "s"}`;

export function attentionScore(item: Item, w: World = SEED): AttentionScore {
  const f = factsFor(item, w);
  if (f.done) return { value: 0, band: "low", reasons: [] };

  const r: ScoreReason[] = [];
  const add = (rule: string, label: string, points: number, warn = false) => {
    if (points !== 0) r.push({ rule, label, points, warn });
  };

  add("priority", `Priority: ${item.priority}`, { high: 20, medium: 10, low: 5 }[item.priority]);

  if (f.blocked) {
    add("blocked", "Blocked", 30, true);
    if (f.blockedDays > 0) add("blocked", `Blocked for ${plural(f.blockedDays, "day")}`, Math.min(20, 5 * f.blockedDays), true);
  } else if (f.languageNow) {
    add("hidden", `Blocker language in day-${f.languageNow.day} update, not raised`, 20, true);
  }

  if (f.overdueDays > 0) {
    const label = item.status === "overdue"
      ? `Overdue by ${plural(f.overdueDays, "day")}`
      : `Past due ${plural(f.overdueDays, "day")} (status still ${item.status.replace("_", " ")})`;
    add("overdue", label, Math.min(40, 15 + 5 * f.overdueDays), true);
  } else if (f.dueIn <= 2) {
    add("due-soon", f.dueIn === 0 ? "Due today" : f.dueIn === 1 ? "Due tomorrow" : "Due in 2 days", f.dueIn === 0 ? 10 : f.dueIn === 1 ? 8 : 5);
  }

  if (f.dependents.length) {
    add("blocks-others", `Blocks ${plural(f.dependents.length, "open item")} (${f.dependents.map(code).join(", ")})`, Math.min(30, 10 * f.dependents.length), true);
  }
  if (f.blockedUpstream.length) {
    add("upstream", `Cannot deliver — waits on blocked ${f.blockedUpstream.map(code).join(", ")}`, 15, true);
  }
  if (item.clientImpact) add("client", "Client impact", 10);
  if (item.spillover) add("spillover", "Carried over from last sprint", 10);
  if (f.expectsDaily && f.staleDays >= 2) {
    const label = f.lastUpdateDay === null ? "No update this sprint" : `No update for ${plural(f.staleDays, "day")}`;
    add("stale", label, Math.min(15, 3 * f.staleDays), true);
  }
  if (!item.owner) add("unowned", "No owner", 15, true);
  if (f.ownerBlockedOn.length && !f.blocked) {
    add("owner-blocked", `Owner also blocked on ${f.ownerBlockedOn.map(code).join(", ")}`, 5);
  }
  if (item.type === "risk" && item.status === "monitoring" && !item.mitigationPlan) {
    add("no-mitigation", "Risk under watch, no mitigation plan", 8, true);
  }
  if (item.type === "requirement" && item.clarityScore !== null && item.clarityScore <= 4) {
    add("clarity", `Story clarity ${item.clarityScore}/10`, 8);
  }

  const value = r.reduce((a, x) => a + x.points, 0);
  return { value, band: bandFor(value), reasons: r };
}

/** Items ranked by attention, highest first (the Priority Board order). */
export function byAttention(list: Item[], w: World = SEED): Item[] {
  return [...list].sort((a, b) => attentionScore(b, w).value - attentionScore(a, w).value);
}

export function needsAttention(item: Item, w: World = SEED): boolean {
  return attentionScore(item, w).value >= ATTENTION_THRESHOLD;
}
