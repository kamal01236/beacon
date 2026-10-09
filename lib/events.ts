// The human-in-control event log.
//
// Every human decision Beacon records is one append-only event: an update
// posted, a signal accepted or dismissed, a proposed tracker change approved or
// rejected, a retro action adopted, a feedback vote. Nothing else mutates state:
// the world each screen renders is the seed + these events (lib/world.ts), and
// adoption metrics are counts over them (lib/adoption.ts).
//
// Prototype storage is this browser's localStorage — per viewer, never sent
// anywhere. The live agent replaces it with a server-side store (README → Roadmap).

import type { ItemStatus } from "./types";

export type SignalDecision = "accepted" | "dismissed" | "snoozed";

export const DISMISS_REASONS = [
  "Not a real problem",
  "Already handled",
  "Wrong owner",
  "Not now",
] as const;

/** A proposed change to the tracker. Shown as a preview; applied only on approval. */
export interface Change {
  field: "status" | "blocker" | "comment" | "link" | "create";
  label: string; // one line a human approves, e.g. "Status: In progress → Blocked"
  to: string; // new value, or the comment text
  from?: string | null;
  status?: ItemStatus; // for status / blocker changes
}

interface Base {
  id: string;
  at: string; // ISO timestamp (wall clock)
  actor: string; // member id of the person who acted
}

export type BeaconEvent = Base &
  (
    | {
        kind: "update.posted";
        itemId: string;
        status: ItemStatus;
        text: string;
        next?: string | null;
        blocker?: string | null;
        requestId?: string; // when posted as the answer to an agent request
      }
    | {
        kind: "signal.decided";
        signalId: string;
        signalKind: string;
        itemId: string;
        decision: SignalDecision;
        reason?: string;
      }
    | {
        kind: "proposal.decided";
        proposalId: string;
        itemId: string;
        decision: "approved" | "rejected";
        change: Change;
        origin: string; // what proposed it, e.g. "signal:hidden-blocker"
      }
    | { kind: "retro.adopted"; themeId: string; action: string }
    | { kind: "feedback.given"; target: string; helpful: boolean }
    | { kind: "event.undone"; targetId: string }
  );

export type EventKind = BeaconEvent["kind"];
// Distributes Omit over the union so each event's own fields survive.
export type NewEvent = BeaconEvent extends infer E ? (E extends BeaconEvent ? Omit<E, "id" | "at"> : never) : never;
/** An event as a screen proposes it; the acting person is filled in by useActor(). */
export type Draft = BeaconEvent extends infer E ? (E extends BeaconEvent ? Omit<E, "id" | "at" | "actor"> : never) : never;

const KEY = "beacon.events.v1";
const EMPTY: BeaconEvent[] = [];
let cache: BeaconEvent[] | null = null;
const listeners = new Set<() => void>();

function load(): BeaconEvent[] {
  if (cache) return cache;
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
    cache = raw ? (JSON.parse(raw) as BeaconEvent[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function save(next: BeaconEvent[]) {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage blocked: events live for this page view only */
  }
  listeners.forEach((l) => l());
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      fn();
    }
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

export const getEvents = (): BeaconEvent[] => load();
export const getServerEvents = (): BeaconEvent[] => EMPTY;

let seq = 0;
export function record(e: NewEvent): BeaconEvent {
  const ev = { ...e, id: `ev-${Date.now().toString(36)}-${(seq++).toString(36)}`, at: new Date().toISOString() } as BeaconEvent;
  save([...load(), ev]);
  return ev;
}

export function undo(targetId: string, actor: string) {
  record({ kind: "event.undone", targetId, actor });
}

export function clearAll() {
  save([]);
}

/** Events that still count: drops undo markers and anything they undid. */
export function effective(events: BeaconEvent[]): BeaconEvent[] {
  const undone = new Set(events.filter((e) => e.kind === "event.undone").map((e) => (e as { targetId: string }).targetId));
  return events.filter((e) => e.kind !== "event.undone" && !undone.has(e.id));
}
