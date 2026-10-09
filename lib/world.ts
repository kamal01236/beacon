// Seed + recorded human decisions → the world every screen renders.
//
// Only two kinds of event change tracker state:
//   - update.posted      — a person's own stand-up update (their status, their words)
//   - proposal.decided   — a change the agent proposed and a human APPROVED
// The agent itself never changes an item. Everything else (signal decisions,
// feedback, retro adoptions) is read by the agent and the adoption metrics.

import { SEED, type World } from "./data";
import { effective, type BeaconEvent, type Change } from "./events";
import { ACTIVE_SPRINT_ID, TODAY, todayDay } from "./demo";
import type { Item } from "./types";

function applyStatus(it: Item, status: Item["status"], blocker?: string | null) {
  it.status = status;
  if (status === "blocked") {
    it.blocker = blocker || it.blocker || "Blocker raised from Beacon";
    it.blockerRaisedDate = it.blockerRaisedDate ?? TODAY;
  } else if (it.blocker) {
    it.blocker = null;
    it.resolvedDate = TODAY;
  }
  if (status === "done") it.completedDate = TODAY;
}

export function buildWorld(all: BeaconEvent[]): World {
  const events = effective(all);
  if (events.length === 0) return SEED;

  const items = SEED.items.map((i) => ({ ...i }));
  const byId = new Map(items.map((i) => [i.id, i]));
  const updates = [...SEED.updates];
  const day = todayDay();

  for (const e of events) {
    if (e.kind === "update.posted") {
      updates.push({
        id: e.id,
        itemId: e.itemId,
        sprintId: ACTIVE_SPRINT_ID,
        author: e.actor,
        date: TODAY,
        sprintDay: day,
        statusRaw: e.status,
        statusStructured: e.status,
        progressText: e.text,
        nextAction: e.next ?? null,
        blockerText: e.blocker ?? null,
        submittedOnTime: true,
        source: "beacon",
      });
      const it = byId.get(e.itemId);
      if (it && it.status !== e.status) applyStatus(it, e.status, e.blocker);
    } else if (e.kind === "proposal.decided" && e.decision === "approved") {
      const it = byId.get(e.itemId);
      if (it && (e.change.field === "status" || e.change.field === "blocker") && e.change.status) {
        applyStatus(it, e.change.status, e.change.field === "blocker" ? e.change.to : undefined);
      }
    }
  }
  return { items, updates, events };
}

/** A tracker write that would be sent to Jira / Azure DevOps (simulated in the prototype). */
export interface OutboxEntry {
  eventId: string;
  at: string;
  actor: string;
  itemId: string;
  change: Change;
  via: "approved proposal" | "own update";
}

export function outbox(w: World): OutboxEntry[] {
  const out: OutboxEntry[] = [];
  for (const e of w.events) {
    if (e.kind === "proposal.decided" && e.decision === "approved") {
      out.push({ eventId: e.id, at: e.at, actor: e.actor, itemId: e.itemId, change: e.change, via: "approved proposal" });
    } else if (e.kind === "update.posted") {
      out.push({
        eventId: e.id, at: e.at, actor: e.actor, itemId: e.itemId, via: "own update",
        change: { field: "comment", label: `Stand-up update (status: ${e.status.replace("_", " ")})`, to: e.text, status: e.status },
      });
    }
  }
  return out.reverse();
}
