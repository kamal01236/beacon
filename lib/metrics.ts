// Derived analytics for the visual layer.
//
// Everything here is computed from the seed (data/*.json) + the frozen demo
// clock — no invented numbers. Each derivation says where its value comes from,
// so a chart can always trace back to the items/updates behind it. Charts that
// cannot be honestly derived from the data are not drawn.

import { activeSprint, sprints, activeItems, updates, members, kudos } from "./data";
import { sprintDay } from "./demo";
import type { ItemStatus } from "./types";

export interface StatusSlice {
  key: string; // the board filter value
  label: string;
  count: number;
  color: string; // a CSS var the SVG and legend share
  href: string;
}

const DONE: ItemStatus[] = ["done", "confirmed", "resolved"];

/** Current status mix of the active sprint — 100% real counts. */
export function statusBreakdown(): StatusSlice[] {
  const items = activeItems();
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
export function burndown() {
  const items = activeItems();
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
  pct?: boolean;
}

/** Sprint-1 baseline → Sprint-2 measured deltas (both from sprints.json). */
export function impactDeltas(): Delta[] {
  const a = sprints.find((s) => s.id === "s1")!.metrics as Record<string, number>;
  const b = activeSprint.metrics as Record<string, number>;
  return [
    { label: "Stand-up time", before: `${a.standupTimeMins}m`, after: `${b.standupTimeMins}m`, improved: b.standupTimeMins < a.standupTimeMins },
    { label: "Blocker visibility", before: `${a.blockerVisibilityDays}d`, after: `${b.blockerVisibilityDays}d`, improved: b.blockerVisibilityDays < a.blockerVisibilityDays },
    { label: "Participation", before: `${Math.round(a.participationRate * 100)}%`, after: `${Math.round(b.participationRate * 100)}%`, improved: b.participationRate > a.participationRate, pct: true },
    { label: "Update quality", before: `${Math.round(a.updateQualityRate * 100)}%`, after: `${Math.round(b.updateQualityRate * 100)}%`, improved: b.updateQualityRate > a.updateQualityRate, pct: true },
  ];
}

export interface TeamPulse {
  teamSize: number;
  updatedToday: number;
  participationPct: number;
  streakDays: number; // trailing run of high-participation days
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
export function teamPulse(): TeamPulse {
  const teamSize = members.length;
  const today = sprintDay(activeSprint.startDate);
  const sprintUpdates = updates.filter((u) => u.sprintId === activeSprint.id);

  // distinct authors per sprint-day → participation per day
  const byDay = new Map<number, Set<string>>();
  for (const u of sprintUpdates) {
    if (!byDay.has(u.sprintDay)) byDay.set(u.sprintDay, new Set());
    byDay.get(u.sprintDay)!.add(u.author);
  }
  const updatedToday = byDay.get(today)?.size ?? byDay.get(today - 1)?.size ?? 0;
  const participationPct = Math.round((activeSprint.metrics.participationRate as number) * 100);

  // streak: trailing consecutive days with >=80% of the team updating
  let streakDays = 0;
  for (let d = today; d >= 1; d--) {
    const c = byDay.get(d)?.size ?? 0;
    if (c / teamSize >= 0.8) streakDays++;
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

  return { teamSize, updatedToday, participationPct, streakDays, badges, kudos: recentKudos };
}
