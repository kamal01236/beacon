import membersJson from "@/data/members.json";
import sprintsJson from "@/data/sprints.json";
import itemsJson from "@/data/items.json";
import updatesJson from "@/data/updates.json";
import kudosJson from "@/data/kudos.json";
import storiesJson from "@/data/stories.json";
import type { Member, Sprint, Item, Update, Kudos, Story, Role } from "./types";
import { ACTIVE_SPRINT_ID } from "./demo";

// JSON imports arrive with narrow literal types; cast through unknown to the
// domain types (the shapes are validated by the seed, not the compiler).
export const members = membersJson as unknown as Member[];
export const sprints = sprintsJson as unknown as Sprint[];
export const items = itemsJson as unknown as Item[];
export const updates = updatesJson as unknown as Update[];
export const kudos = kudosJson as unknown as Kudos[];
export const stories = storiesJson as unknown as Story[];

export const activeSprint = sprints.find((s) => s.id === ACTIVE_SPRINT_ID)!;
// the most recently completed sprint (by start date) — the baseline we compare against.
export const lastSprint = sprints
  .filter((s) => s.status === "completed")
  .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];

export function memberById(id: string | null | undefined): Member | undefined {
  return id ? members.find((m) => m.id === id) : undefined;
}

export function itemById(id: string): Item | undefined {
  return items.find((i) => i.id === id);
}

export function storyForItem(itemId: string): Story | undefined {
  return stories.find((s) => s.itemId === itemId);
}

export function updatesForItem(itemId: string): Update[] {
  return updates
    .filter((u) => u.itemId === itemId)
    .sort((a, b) => a.sprintDay - b.sprintDay);
}

export function activeItems(): Item[] {
  return items.filter((i) => i.sprintId === ACTIVE_SPRINT_ID);
}

export function itemsOwnedBy(memberId: string): Item[] {
  return activeItems().filter((i) => i.owner === memberId);
}

/** A short display code for an item, e.g. "req-001" -> "REQ-001". */
export function code(item: Item): string {
  return item.id.toUpperCase();
}

/** A nominal progress % derived from status (seed items carry no % field). */
export function progressFor(item: Item): number {
  switch (item.status) {
    case "done":
    case "confirmed":
    case "resolved":
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

/** The most recent update authored by a member in the active sprint. */
export function latestUpdateBy(memberId: string): Update | undefined {
  return updates
    .filter((u) => u.author === memberId && u.sprintId === ACTIVE_SPRINT_ID)
    .sort((a, b) => b.sprintDay - a.sprintDay)[0];
}

export function updatesBy(memberId: string): Update[] {
  return updates
    .filter((u) => u.author === memberId && u.sprintId === ACTIVE_SPRINT_ID)
    .sort((a, b) => b.sprintDay - a.sprintDay);
}

export function kudosFor(memberId: string) {
  return {
    received: kudos.filter((k) => k.to === memberId),
    given: kudos.filter((k) => k.from === memberId),
  };
}

/** The persona Beacon shows for each role in the demo. */
export const PERSONA: Record<Role, { memberId: string; label: string }> = {
  facilitator: { memberId: "m1", label: "Sarah · Facilitator" },
  manager: { memberId: "m1", label: "Dana · Manager · read-only" },
  member: { memberId: "m4", label: "Marcus · Member" },
};
