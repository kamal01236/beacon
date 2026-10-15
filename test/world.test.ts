// The event log and the reducer over it.
//
// Beacon's central promise is "the agent never changes the tracker; a person
// does, and every change is recorded and reversible". That promise is this
// reducer, so these tests state it as rules:
//
//   • only an own update, or an APPROVED proposal, changes an item
//   • a signal decision, feedback or a retro adoption change nothing
//   • an undone event leaves no trace in the world it helped build
//   • the base snapshot is never mutated — the same base replays identically
//
// The server and the browser run this same function (lib/server/store.ts folds
// the database's events, lib/useWorld.ts the browser's), so a divergence here
// would mean the two disagree about what the board shows.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWorldFrom, outbox } from "@/lib/world";
import { effective, type BeaconEvent, type Draft } from "@/lib/events";
import { SEED } from "@/lib/data";
import type { Item, Update } from "@/lib/types";

const ACTOR = "m-002";

const item = (over: Partial<Item> = {}): Item => ({
  id: "req-900",
  sprintId: "s2",
  type: "requirement",
  title: "Test item",
  description: "",
  owner: ACTOR,
  dueDate: "2026-10-10",
  priority: "medium",
  status: "in_progress",
  blocker: null,
  dependsOn: [],
  clientImpact: false,
  spillover: false,
  clarityScore: null,
  ...over,
});

let n = 0;
// `Draft` distributes over the event union, so each kind keeps its own fields.
const ev = (e: Draft & { actor?: string }): BeaconEvent =>
  ({ id: `ev-${++n}`, at: `2026-10-08T09:0${n}:00.000Z`, actor: ACTOR, ...e }) as BeaconEvent;

test("no events: the world is the base snapshot", () => {
  const base = [item()];
  const w = buildWorldFrom(base, [], []);
  assert.deepEqual(w.items, base);
  assert.deepEqual(w.updates, []);
});

test("an own update is appended and moves the item's status", () => {
  const w = buildWorldFrom([item()], [], [
    ev({ kind: "update.posted", itemId: "req-900", status: "blocked", text: "Waiting on the client for credentials", blocker: "No sandbox credentials" }),
  ]);
  assert.equal(w.updates.length, 1);
  assert.equal(w.updates[0].progressText, "Waiting on the client for credentials");
  assert.equal(w.updates[0].source, "beacon");
  const it = w.items[0];
  assert.equal(it.status, "blocked");
  assert.equal(it.blocker, "No sandbox credentials");
  // Raising a blocker stamps when it was raised — that date drives "blocked for N days".
  assert.ok(it.blockerRaisedDate);
});

test("moving off blocked clears the blocker and records the resolution", () => {
  const w = buildWorldFrom([item({ status: "blocked", blocker: "No credentials", blockerRaisedDate: "2026-10-03" })], [], [
    ev({ kind: "update.posted", itemId: "req-900", status: "in_progress", text: "Credentials arrived, back on it" }),
  ]);
  assert.equal(w.items[0].status, "in_progress");
  assert.equal(w.items[0].blocker, null);
  assert.ok(w.items[0].resolvedDate);
});

test("an APPROVED proposal changes the item; a REJECTED one does not", () => {
  const change = { field: "status" as const, label: "Status: In progress → Blocked", to: "blocked", status: "blocked" as const };
  const approved = buildWorldFrom([item()], [], [
    ev({ kind: "proposal.decided", proposalId: "p1", itemId: "req-900", decision: "approved", change, origin: "signal:hidden-blocker" }),
  ]);
  assert.equal(approved.items[0].status, "blocked");

  const rejected = buildWorldFrom([item()], [], [
    ev({ kind: "proposal.decided", proposalId: "p1", itemId: "req-900", decision: "rejected", change, origin: "signal:hidden-blocker" }),
  ]);
  assert.equal(rejected.items[0].status, "in_progress");
});

test("everything else a person does is recorded but changes no item", () => {
  const base = [item()];
  const w = buildWorldFrom(base, [], [
    ev({ kind: "signal.decided", signalId: "sig-1", signalKind: "hidden-blocker", itemId: "req-900", decision: "accepted" }),
    ev({ kind: "signal.decided", signalId: "sig-2", signalKind: "at-risk", itemId: "req-900", decision: "dismissed", reason: "Already handled" }),
    ev({ kind: "feedback.given", target: "sig-1", helpful: true }),
    ev({ kind: "retro.adopted", themeId: "t1", action: "Check dependencies daily" }),
  ]);
  assert.deepEqual(w.items, base);
  assert.equal(w.events.length, 4);
});

test("an undone event leaves no trace in the world", () => {
  const posted = ev({ kind: "update.posted", itemId: "req-900", status: "blocked", text: "stuck" });
  const w = buildWorldFrom([item()], [], [posted, ev({ kind: "event.undone", targetId: posted.id })]);
  assert.equal(w.items[0].status, "in_progress", "the undone status change must not survive");
  assert.equal(w.updates.length, 0, "the undone update must not appear");
  // The world carries only the events that still count; the undo marker and the
  // event it cancelled are both gone from it. The full log (including the undo,
  // which is itself auditable) is read from the store, not from the world.
  assert.deepEqual(w.events, []);
  assert.equal(effective([posted, ev({ kind: "event.undone", targetId: posted.id })]).length, 0);
});

test("the base snapshot is never mutated, so the same base replays identically", () => {
  const base = [item()];
  const frozen = JSON.stringify(base);
  const events = [ev({ kind: "update.posted", itemId: "req-900", status: "done", text: "Shipped" })];
  const first = buildWorldFrom(base, [], events);
  const second = buildWorldFrom(base, [], events);
  assert.equal(JSON.stringify(base), frozen, "buildWorldFrom must not write to its input");
  assert.deepEqual(first.items, second.items);
});

test("an event for an unknown item is tolerated, not thrown", () => {
  const w = buildWorldFrom([item()], [], [ev({ kind: "update.posted", itemId: "req-nope", status: "done", text: "?" })]);
  assert.equal(w.items[0].status, "in_progress");
  assert.equal(w.updates.length, 1, "the update is still recorded against its id");
});

test("base updates are preserved alongside new ones", () => {
  const seeded: Update = {
    id: "u-1",
    itemId: "req-900",
    sprintId: "s2",
    author: ACTOR,
    date: "2026-10-06",
    sprintDay: 6,
    statusStructured: "in_progress",
    progressText: "Started",
    nextAction: null,
    source: "seed",
  };
  const w = buildWorldFrom([item()], [seeded], [ev({ kind: "update.posted", itemId: "req-900", status: "in_progress", text: "Continued" })]);
  assert.equal(w.updates.length, 2);
  assert.equal(w.updates[0].id, "u-1");
});

test("the outbox is exactly what would be written to the tracker, newest first", () => {
  const change = { field: "comment" as const, label: "Comment: ask the client", to: "@Sarah can you chase the credentials?" };
  const w = buildWorldFrom([item()], [], [
    ev({ kind: "update.posted", itemId: "req-900", status: "in_progress", text: "Picked it back up" }),
    ev({ kind: "proposal.decided", proposalId: "p1", itemId: "req-900", decision: "approved", change, origin: "signal:blocked" }),
    ev({ kind: "proposal.decided", proposalId: "p2", itemId: "req-900", decision: "rejected", change, origin: "signal:blocked" }),
    ev({ kind: "signal.decided", signalId: "s1", signalKind: "blocked", itemId: "req-900", decision: "accepted" }),
  ]);
  const out = outbox(w);
  assert.equal(out.length, 2, "only an approved proposal and an own update are written out");
  assert.equal(out[0].via, "approved proposal");
  assert.equal(out[1].via, "own update");
  for (const entry of out) assert.ok(entry.eventId && entry.actor && entry.at, "each write traces to its event");
});

test("the seeded world holds raw facts only — no stored scores or signals", () => {
  // The engine computes attention; a seed that carried a score could disagree
  // with the reasons shown beside it.
  for (const it of SEED.items as unknown as Record<string, unknown>[]) {
    for (const forbidden of ["priorityScore", "priorityReasons", "attention", "blockerSignal", "signals"]) {
      assert.ok(!(forbidden in it), `${String(it.id)} must not store a derived "${forbidden}"`);
    }
  }
});
