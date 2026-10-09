// The demo clock is frozen so every screen tells the same story.
// Sprint 2 runs 2026-10-01 (Day 1) .. 2026-10-10 (Day 10).
// We freeze "today" at Day 8 — the day Marcus's hidden blocker on REQ-001
// has surfaced and the "cannot deliver" roll-up is live.

export const TODAY = "2026-10-08";
export const ACTIVE_SPRINT_ID = "s2";

export function today(): Date {
  return new Date(TODAY + "T09:00:00");
}

/** Whole days from TODAY to `date` (negative = overdue / in the past). */
export function daysFromToday(date: string): number {
  const d = new Date(date + "T09:00:00").getTime();
  const t = today().getTime();
  return Math.round((d - t) / 86_400_000);
}

/** Sprint day number (1-based) for a sprint that starts on `startDate`. */
export function sprintDay(startDate: string, on: string = TODAY): number {
  const start = new Date(startDate + "T09:00:00").getTime();
  const d = new Date(on + "T09:00:00").getTime();
  return Math.floor((d - start) / 86_400_000) + 1;
}
