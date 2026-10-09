import membersJson from "@/data/members.json";
import sprintsJson from "@/data/sprints.json";
import itemsJson from "@/data/items.json";
import updatesJson from "@/data/updates.json";
import kudosJson from "@/data/kudos.json";
import storiesJson from "@/data/stories.json";
import type { Member, Sprint, Item, Update, Kudos, Story, Role, ItemStatus } from "./types";
import type { BeaconEvent } from "./events";
import { ACTIVE_SPRINT_ID } from "./demo";

// JSON imports arrive with narrow literal types; cast through unknown to the
// domain types (the shapes are validated by the seed, not the compiler).
export const members = membersJson as unknown as Member[];
export const sprints = sprintsJson as unknown as Sprint[];
export const items = itemsJson as unknown as Item[];
export const updates = updatesJson as unknown as Update[];
export const kudos = kudosJson as unknown as Kudos[];
export const stories = storiesJson as unknown as Story[];

/**
 * The state every derivation reads: tracker items + updates, plus the human
 * decisions recorded in this session. SEED is the predefined data with no
 * session activity; `buildWorld` (lib/world.ts) layers events on top.
 */
export interface World {
  items: Item[];
  updates: Update[];
  events: BeaconEvent[];
}
export const SEED: World = { items, updates, events: [] };

export const activeSprint = sprints.find((s) => s.id === ACTIVE_SPRINT_ID)!;
// the most recently completed sprint (by start date) — the baseline we compare against.
export const lastSprint = sprints
  .filter((s) => s.status === "completed")
  .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];

export const DONE_STATUSES: ItemStatus[] = ["done", "confirmed", "resolved", "cancelled"];
export function isDone(item: Item): boolean {
  return DONE_STATUSES.includes(item.status);
}

export function memberById(id: string | null | undefined): Member | undefined {
  return id ? members.find((m) => m.id === id) : undefined;
}

export function firstName(id: string | null | undefined): string {
  return memberById(id)?.name.split(" ")[0] ?? "the owner";
}

export function itemById(id: string, w: World = SEED): Item | undefined {
  return w.items.find((i) => i.id === id);
}

export function storyForItem(itemId: string): Story | undefined {
  return stories.find((s) => s.itemId === itemId);
}

export function updatesForItem(itemId: string, w: World = SEED): Update[] {
  return w.updates
    .filter((u) => u.itemId === itemId)
    .sort((a, b) => a.sprintDay - b.sprintDay);
}

export function activeItems(w: World = SEED): Item[] {
  return w.items.filter((i) => i.sprintId === ACTIVE_SPRINT_ID);
}

export function itemsOwnedBy(memberId: string, w: World = SEED): Item[] {
  return activeItems(w).filter((i) => i.owner === memberId);
}

/** A short display code for an item, e.g. "req-001" -> "REQ-001". */
export function code(item: Item | string): string {
  return (typeof item === "string" ? item : item.id).toUpperCase();
}

/** A nominal progress % derived from status (seed items carry no % field). */
export function progressFor(item: Item): number {
  switch (item.status) {
    case "done":
    case "confirmed":
    case "resolved":
    case "cancelled":
      return 100;
    case "in_progress":
      return 55;
    case "blocked":
      return 60;
    case "overdue":
      return 40;
    case "monitoring":
      return 30;
    case "spillover":
      return 15;
    default:
      return 0;
  }
}

/** Updates a member actually posted in the active sprint, newest first. */
export function updatesBy(memberId: string, w: World = SEED): Update[] {
  return w.updates
    .filter((u) => u.author === memberId && u.sprintId === ACTIVE_SPRINT_ID)
    .sort((a, b) => b.sprintDay - a.sprintDay);
}

/** The most recent update authored by a member in the active sprint. */
export function latestUpdateBy(memberId: string, w: World = SEED): Update | undefined {
  return updatesBy(memberId, w)[0];
}

export function kudosFor(memberId: string) {
  return {
    received: kudos.filter((k) => k.to === memberId),
    given: kudos.filter((k) => k.from === memberId),
  };
}

/** The persona Beacon shows for each role in the demo. */
export const PERSONA: Record<Role, { memberId: string; label: string; canAct: boolean }> = {
  facilitator: { memberId: "m1", label: "Sarah · Facilitator", canAct: true },
  manager: { memberId: "m1", label: "Dana · Manager · read-only", canAct: false },
  member: { memberId: "m4", label: "Marcus · Member", canAct: true },
};
