// Derived analytics for the visual layer.
//
// Everything here is computed from the seed (data/*.json) + the frozen demo
// clock — no invented numbers. Each derivation says where its value comes from,
// so a chart can always trace back to the items/updates behind it. Charts that
// cannot be honestly derived from the data are not drawn.

import { activeSprint, sprints, activeItems, members, kudos, DONE_STATUSES, SEED, type World } from "./data";
import { sprintDay } from "./demo";
import { participation, measured } from "./insights";
import type { ItemStatus } from "./types";

export interface StatusSlice {
  key: string; // the board filter value
  label: string;
  count: number;
  color: string; // a CSS var the SVG and legend share
  href: string;
}

const DONE: ItemStatus[] = DONE_STATUSES;

/** Current status mix of the active sprint — 100% real counts. */
export function statusBreakdown(w: World = SEED): StatusSlice[] {
  const items = activeItems(w);
  const n = (fn: (s: ItemStatus) => boolean) => items.filter((i) => fn(i.status)).length;
  const slices: StatusSlice[] = [
    { key: "done", label: "Done", count: items.filter((i) => DONE.includes(i.status)).length, color: "var(--ok-fill)", href: "/board?status=done" },
    { key: "in_progress", label: "In progress", count: n((s) => s === "in_progress"), color: "var(--ai-fill)", href: "/board?status=in_progress" },
    { key: "blocked", label: "Blocked", count: n((s) => s === "blocked"), color: "var(--blocked-fill)", href: "/board?status=blocked" },
    { key: "overdue", label: "Overdue", count: n((s) => s === "overdue"), color: "var(--overdue-fill)", href: "/board?status=overdue" },
    { key: "spillover", label: "Spillover", count: items.filter((i) => i.spillover).length, color: "var(--spill)", href: "/board?status=spillover" },
    { key: "monitoring", label: "Monitoring", count: n((s) => s === "monitoring"), color: "var(--ideal)", href: "/board?status=monitoring" },
    { key: "todo", label: "To do", count: n((s) => s === "todo"), color: "#C9D6E2", href: "/board?status=todo" },
  ];
  return slices.filter((s) => s.count > 0);
}

export interface VelocityBar {
  sprint: string;
  goal: number;
  actual: number | null;
  active: boolean;
}

/** Velocity goal vs actual per sprint — straight from sprints.json. */
export function velocitySeries(): VelocityBar[] {
  return sprints
    .filter((s) => s.status !== "planned")
    .map((s) => ({
      sprint: s.name.replace("Sprint ", "S"),
      goal: s.velocityGoal,
      actual: s.velocityActual,
      active: s.status === "active",
    }));
}

export interface BurndownPoint {
  day: number;
  ideal: number;
  actual: number | null; // null for days in the future
}

/**
 * Sprint burndown. The ideal line and both actual endpoints are real:
 * committed = active item count, remaining today = items not yet done.
 * Future days are null (not drawn), so we never project a number we don't have.
 */
export function burndown(w: World = SEED) {
  const items = activeItems(w);
  const committed = items.length;
  const doneToday = items.filter((i) => DONE.includes(i.status)).length;
  const total = sprintDay(activeSprint.startDate, activeSprint.endDate); // sprint length in days
  const today = sprintDay(activeSprint.startDate); // elapsed day (frozen clock)
  const remainingToday = committed - doneToday;

  const points: BurndownPoint[] = [];
  for (let d = 0; d <= total; d++) {
    const ideal = Math.round((committed * (total - d)) / total);
    // actual is known only at the two real anchors: sprint start and today.
    let actual: number | null = null;
    if (d === 0) actual = committed;
    else if (d === today) actual = remainingToday;
    points.push({ day: d, ideal, actual });
  }
  return { points, committed, remainingToday, today, total, doneToday };
}

export interface Delta {
  label: string;
  before: string;
  after: string;
  // true when "after" is the better direction (for colouring the arrow)
  improved: boolean;
  source: string; // where the "after" figure comes from
}

/**
 * Sprint-1 baseline → Sprint 2. The baseline is an estimate (replaced by a
 * measured first week in a pilot). Sprint-2 participation and blocker detection
 * are computed from the updates; stand-up time and update quality are figures
 * recorded by the team, and are labelled as such.
 */
export function impactDeltas(w: World = SEED): Delta[] {
  const a = sprints.find((s) => s.id === "s1")!.metrics as Record<string, number>;
  const b = activeSprint.metrics as Record<string, number>;
  const p = participation(w);
  const m = measured(w);
  const pPct = Math.round(p.rate * 100);
  return [
    { label: "Stand-up time", before: `${a.standupTimeMins}m`, after: `${b.standupTimeMins}m`, improved: b.standupTimeMins < a.standupTimeMins, source: "recorded by the team" },
    {
      label: "Blocker detection lag", before: `${a.blockerVisibilityDays}d`, after: "same day", improved: true,
      source: m.avgLeadDays ? `computed: wording flagged the day it was written; formal raise came ${m.avgLeadDays}d later` : "computed from update wording",
    },
    { label: "Participation", before: `${Math.round(a.participationRate * 100)}%`, after: `${pPct}%`, improved: pPct > a.participationRate * 100, source: `computed: people with work in flight who posted each day` },
    { label: "Update quality", before: `${Math.round(a.updateQualityRate * 100)}%`, after: `${Math.round(b.updateQualityRate * 100)}%`, improved: b.updateQualityRate > a.updateQualityRate, source: "recorded by the team" },
  ];
}

export interface TeamPulse {
  expected: number; // people with work in flight
  fresh: number; // of them, posted since yesterday
  participationPct: number;
  streakDays: number; // trailing run of days where 80%+ of them posted
  badges: { key: string; label: string; count: number }[];
  kudos: { from: string; to: string; message: string; itemId: string | null }[];
}

const BADGE_LABEL: Record<string, string> = {
  "blocker-buster": "Blocker-buster",
  "on-time-10": "On-time streak",
  "story-crafter": "Story-crafter",
  "early-adopter": "Early adopter",
};

/**
 * Team-level momentum — collaboration and cadence, NOT an individual ranking.
 * (Standing product constraint: no individual performance scoring.)
 */
export function teamPulse(w: World = SEED): TeamPulse {
  const p = participation(w);
  const today = sprintDay(activeSprint.startDate);

  // streak: trailing completed days where 80%+ of the people with work in flight posted
  let streakDays = 0;
  for (let d = today - 1; d >= 1; d--) {
    if (p.expected && p.perDay[d - 1] / p.expected >= 0.8) streakDays++;
    else break;
  }

  // collective badge wall — aggregate counts across the team (no leaderboard)
  const counts = new Map<string, number>();
  for (const m of members) for (const b of m.badges) counts.set(b, (counts.get(b) ?? 0) + 1);
  const badges = [...counts.entries()]
    .map(([key, count]) => ({ key, label: BADGE_LABEL[key] ?? key, count }))
    .sort((x, y) => y.count - x.count);

  const recentKudos = [...kudos]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3)
    .map((k) => ({ from: k.from, to: k.to, message: k.message, itemId: k.itemId }));

  return { expected: p.expected, fresh: p.freshCount, participationPct: Math.round(p.rate * 100), streakDays, badges, kudos: recentKudos };
}
