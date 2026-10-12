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

// Storage has two modes, resolved once per page load:
//   • server — the /api backend is reachable (the Next server build). The base
//     snapshot (items + updates, from the faked Jira) and the event log are
//     fetched from the server, and every recorded decision is POSTed back, so
//     state is shared across sessions and read by the agent.
//   • local  — no /api (the static GitHub Pages export). Events live in this
//     browser's localStorage, exactly as before, over the bundled seed base.
// SSR and the first client paint always render the seed with no events, then
// hydrate() swaps in the real source — so there is no hydration mismatch.

import { items as seedItems, updates as seedUpdates } from "./data";
import type { Item, Update } from "./types";

const KEY = "beacon.events.v1";
const EMPTY: BeaconEvent[] = [];
const SEED_BASE: { items: Item[]; updates: Update[] } = { items: seedItems, updates: seedUpdates };

let cache: BeaconEvent[] | null = null;
let clientBase: { items: Item[]; updates: Update[] } | null = null;
let mode: "unknown" | "server" | "local" = "unknown";
let hydrated = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function loadLocal(): BeaconEvent[] {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
    return raw ? (JSON.parse(raw) as BeaconEvent[]) : [];
  } catch {
    return [];
  }
}
function saveLocal(next: BeaconEvent[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage blocked: events live for this page view only */
  }
}

/** Decide the storage mode and load the initial state. Runs once, on the client. */
async function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const [baseRes, evRes] = await Promise.all([fetch("/api/base"), fetch("/api/events")]);
    if (!baseRes.ok || !evRes.ok) throw new Error("no api");
    clientBase = (await baseRes.json()) as { items: Item[]; updates: Update[] };
    cache = (await evRes.json()) as BeaconEvent[];
    mode = "server";
  } catch {
    mode = "local";
    cache = loadLocal();
  }
  notify();
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  void hydrate();
  const onStorage = (e: StorageEvent) => {
    if (mode === "local" && e.key === KEY) {
      cache = loadLocal();
      notify();
    }
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

export const getEvents = (): BeaconEvent[] => cache ?? EMPTY;
export const getServerEvents = (): BeaconEvent[] => EMPTY;
/** The item/update base the world folds over: the server snapshot, else the seed. */
export const getBase = (): { items: Item[]; updates: Update[] } => clientBase ?? SEED_BASE;
export const getServerBase = (): { items: Item[]; updates: Update[] } => SEED_BASE;

let seq = 0;
export function record(e: NewEvent): BeaconEvent {
  const ev = { ...e, id: `ev-${Date.now().toString(36)}-${(seq++).toString(36)}`, at: new Date().toISOString() } as BeaconEvent;
  cache = [...(cache ?? []), ev];
  if (mode === "server") {
    const draft = { ...ev } as Record<string, unknown>;
    delete draft.id;
    delete draft.at;
    delete draft.actor;
    void fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draft, actor: ev.actor }),
    }).catch(() => {
      /* optimistic: the event is already shown; a failed POST just isn't persisted */
    });
  } else {
    saveLocal(cache);
  }
  notify();
  return ev;
}

export function undo(targetId: string, actor: string) {
  record({ kind: "event.undone", targetId, actor });
}

export function clearAll() {
  cache = [];
  if (mode !== "server") saveLocal([]);
  notify();
}

/** Events that still count: drops undo markers and anything they undid. */
export function effective(events: BeaconEvent[]): BeaconEvent[] {
  const undone = new Set(events.filter((e) => e.kind === "event.undone").map((e) => (e as { targetId: string }).targetId));
  return events.filter((e) => e.kind !== "event.undone" && !undone.has(e.id));
}
