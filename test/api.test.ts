// The API, exercised end to end through the real route handlers.
//
// Every route is called the way the browser calls it, against an isolated
// working directory (a copy of /data, its own .data/ store), with no database
// and no model provider — the configuration a reviewer gets by cloning the repo
// and running it. So this covers the whole no-database path: faked Jira →
// adapter → reducer → file store → response.
//
// Isolation matters: the file store resolves .data/ from the process working
// directory at import time, so the directory is switched BEFORE the routes are
// imported. Nothing here writes into the repository.

import { before, test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const repo = process.cwd();
const sandbox = mkdtempSync(join(tmpdir(), "beacon-api-"));
cpSync(join(repo, "data"), join(sandbox, "data"), { recursive: true });
process.chdir(sandbox);

// The configuration under test: no database, no model, quiet logs.
delete process.env.DATABASE_URL;
process.env.BEACON_LLM_PROVIDER = "none";
process.env.BEACON_LOG_LEVEL = "error";

// Imported inside `before`, i.e. after the chdir above, so the file store
// resolves .data/ inside the sandbox rather than in the repository.
let health: typeof import("@/app/api/health/route");
let base: typeof import("@/app/api/base/route");
let world: typeof import("@/app/api/world/route");
let jira: typeof import("@/app/api/jira/search/route");
let events: typeof import("@/app/api/events/route");
let analyze: typeof import("@/app/api/agent/analyze/route");
let summarize: typeof import("@/app/api/agent/summarize/route");
let retention: typeof import("@/app/api/data/retention/route");
let agentRun: typeof import("@/app/api/agent/run/route");

before(async () => {
  health = await import("@/app/api/health/route");
  base = await import("@/app/api/base/route");
  world = await import("@/app/api/world/route");
  jira = await import("@/app/api/jira/search/route");
  events = await import("@/app/api/events/route");
  analyze = await import("@/app/api/agent/analyze/route");
  summarize = await import("@/app/api/agent/summarize/route");
  retention = await import("@/app/api/data/retention/route");
  agentRun = await import("@/app/api/agent/run/route");
});

const url = (path: string) => `http://localhost${path}`;
const get = (path: string) => new Request(url(path));
const send = (path: string, method: string, body?: unknown) =>
  new Request(url(path), {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const eventsFile = () => JSON.parse(readFileSync(join(sandbox, ".data", "events.json"), "utf8")) as { kind: string; at: string }[];

test("GET /api/health reports the real backend, and does not leak the key", async () => {
  const res = await health.GET(get("/api/health?deep=1"));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, "ok");
  assert.equal(body.store.backend, "file");
  assert.equal(body.store.databaseUrlSet, false);
  // Rules-only is a valid, fully working state — not a fault.
  assert.equal(body.detector.providerConfigured, false);
  assert.equal(body.detector.provider, "none");
  assert.ok(body.world.items > 0 && body.world.updates > 0);
  assert.doesNotMatch(JSON.stringify(body), /sk-|api[_-]?key/i);
});

test("GET /api/base and /api/world agree about the items", async () => {
  const b = await (await base.GET(get("/api/base"))).json();
  const w = await (await world.GET(get("/api/world"))).json();
  assert.ok(b.items.length > 0);
  assert.equal(w.items.length, b.items.length);
  assert.equal(w.updates.length, b.updates.length);
  assert.deepEqual(w.events, []);
});

test("GET /api/jira/search returns the payload the adapter consumes", async () => {
  const res = await jira.GET(get("/api/jira/search"));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.total, body.issues.length);
  assert.ok(body.issues[0].fields.summary);
});

test("POST /api/events records one decision and the world reflects it", async () => {
  const item = (await (await base.GET(get("/api/base"))).json()).items.find(
    (i: { status: string }) => i.status === "in_progress",
  );
  assert.ok(item, "the seed should contain an item in progress");

  const res = await events.POST(
    send("/api/events", "POST", {
      actor: "m-002",
      draft: {
        kind: "update.posted",
        itemId: item.id,
        status: "blocked",
        text: "Waiting on the client for sandbox credentials",
        blocker: "No sandbox credentials",
      },
    }),
  );
  assert.equal(res.status, 201);
  const ev = await res.json();
  assert.ok(ev.id && ev.at, "the server stamps the id and the time, not the client");
  assert.equal(ev.actor, "m-002");

  const after = await (await world.GET(get("/api/world"))).json();
  const changed = after.items.find((i: { id: string }) => i.id === item.id);
  assert.equal(changed.status, "blocked", "the decision changed the item");
  assert.equal(after.events.length, 1);
});

test("POST /api/events rejects a malformed body with field-level detail", async () => {
  const res = await events.POST(send("/api/events", "POST", { draft: { kind: "update.posted" } }));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.code, "VALIDATION_FAILED");
  assert.ok(body.details.some((d: { field: string }) => d.field === "actor"));
  assert.ok(body.requestId);
});

test("POST /api/events refuses an event kind the system does not have", async () => {
  const res = await events.POST(
    send("/api/events", "POST", { actor: "m-002", draft: { kind: "item.deleted", itemId: "req-001" } }),
  );
  assert.equal(res.status, 400);
  assert.ok((await res.json()).details.some((d: { field: string }) => d.field === "draft.kind"));
});

test("POST /api/events refuses an actor id that is not an id", async () => {
  const res = await events.POST(
    send("/api/events", "POST", { actor: "'; DROP TABLE events; --", draft: { kind: "feedback.given", target: "x", helpful: true } }),
  );
  assert.equal(res.status, 400);
});

test("POST /api/agent/analyze reads an edited draft with the rule detector", async () => {
  const res = await analyze.POST(
    send("/api/agent/analyze", "POST", {
      itemId: "req-001",
      text: "I am completely stuck on the HMAC signature and not sure how to proceed",
    }),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.verdict, "blocked");
  assert.ok(body.score >= body.threshold, "the verdict must follow the published threshold");
  assert.ok(body.hits.length > 0, "and name the phrases behind it");
  assert.equal(body.provider, null, "no model ran, and the response says so");
  assert.ok(body.answer.length > 0);
});

test("POST /api/agent/analyze validates its body", async () => {
  const bad = await analyze.POST(send("/api/agent/analyze", "POST", { itemId: "", text: 42 }));
  assert.equal(bad.status, 400);
  const details = (await bad.json()).details.map((d: { field: string }) => d.field);
  assert.deepEqual(details.sort(), ["itemId", "text"]);

  const badStatus = await analyze.POST(send("/api/agent/analyze", "POST", { itemId: "req-001", text: "x", status: "shipped" }));
  assert.equal(badStatus.status, 400);
});

test("POST /api/agent/analyze refuses an oversized body rather than prompting with it", async () => {
  const res = await analyze.POST(send("/api/agent/analyze", "POST", { itemId: "req-001", text: "x".repeat(5_000) }));
  assert.equal(res.status, 400, "4 KB is the stated ceiling for one update");
});

test("POST /api/agent/summarize falls back to a rule cleanup with no model configured", async () => {
  const res = await summarize.POST(
    send("/api/agent/summarize", "POST", { itemId: "req-001", mode: "cleanup", raw: "  still   waiting on the client  " }),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.source, "rules");
  assert.equal(body.text, "Still waiting on the client.");
  assert.equal(body.proposedStatus, null, "a rule cleanup never proposes a status");
  assert.deepEqual(body.questions, []);
});

test("POST /api/agent/summarize rejects an unknown mode", async () => {
  const res = await summarize.POST(send("/api/agent/summarize", "POST", { itemId: "req-001", mode: "rewrite", raw: "x" }));
  assert.equal(res.status, 400);
});

test("POST /api/agent/run performs a real run and records it", async () => {
  const res = await agentRun.POST(send("/api/agent/run", "POST", { trigger: "manual" }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.trigger, "manual");
  assert.equal(body.detector, "rules");
  assert.equal(body.provider, null);
  assert.equal(body.llmCalls, 0, "rules-only must not call a model");
  assert.ok(body.itemsScanned > 0);
  assert.equal(body.errors, 0);

  const listed = await (await agentRun.GET(get("/api/agent/run?limit=5"))).json();
  assert.ok(listed.length >= 1);
  assert.equal(listed[0].trigger, "manual");
  assert.ok(!("summary" in listed[0]), "the list stays small — the snapshot is not sent");
});

test("POST /api/agent/run joins a run already in flight instead of starting a second", async () => {
  const [a, b] = await Promise.all([
    agentRun.POST(send("/api/agent/run", "POST", { trigger: "manual" })),
    agentRun.POST(send("/api/agent/run", "POST", { trigger: "event" })),
  ]);
  const bodies = [await a.json(), await b.json()];
  assert.equal(bodies.filter((x) => x.joined).length, 1, "exactly one of the two triggers joined the other");
});

test("GET /api/data/retention is a dry run that removes nothing", async () => {
  const before = eventsFile().length;
  const res = await retention.GET(get("/api/data/retention?days=30"));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.olderThanDays, 30);
  assert.equal(body.total, before);
  assert.equal(body.expired, 0, "the events just written are inside any sane window");
  assert.equal(eventsFile().length, before, "a dry run must not delete anything");
});

test("GET /api/data/retention refuses an absurd window instead of quietly reinterpreting it", async () => {
  assert.equal((await (await retention.GET(get("/api/data/retention?days=0"))).json()).code, "VALIDATION_FAILED");
  assert.equal((await (await retention.GET(get("/api/data/retention?days=99999"))).json()).code, "VALIDATION_FAILED");
  // Omitted entirely, the policy's own window applies.
  const body = await (await retention.GET(get("/api/data/retention"))).json();
  assert.equal(body.olderThanDays, 180);
});

test("POST /api/data/retention removes expired decisions and records that it did", async () => {
  // Plant one decision older than the window — the state a nightly sweep meets.
  const log = eventsFile();
  log.unshift({ kind: "feedback.given", at: "2020-01-01T00:00:00.000Z" } as never);
  writeFileSync(join(sandbox, ".data", "events.json"), JSON.stringify(log, null, 2));

  const res = await retention.POST(send("/api/data/retention", "POST", { days: 30 }));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.removed, 1);

  const after = eventsFile();
  assert.ok(!after.some((e) => e.at === "2020-01-01T00:00:00.000Z"), "the expired decision is gone");
  // The gap is explained: the sweep appends its own marker to the log it shortened.
  const marker = after.filter((e) => e.kind === "data.retained");
  assert.equal(marker.length, 1);
});

test("POST /api/data/retention adds no marker when there was nothing to remove", async () => {
  const before = eventsFile().length;
  const body = await (await retention.POST(send("/api/data/retention", "POST", { days: 30 }))).json();
  assert.equal(body.removed, 0);
  assert.equal(eventsFile().length, before, "a no-op sweep must not grow the audit trail every night");
});

test("DELETE /api/events empties the log and reports how much went", async () => {
  const before = eventsFile().length;
  assert.ok(before > 0);
  const body = await (await events.DELETE(send("/api/events", "DELETE"))).json();
  assert.equal(body.deleted, before);
  assert.deepEqual(eventsFile(), []);
  // And the world is back to the base snapshot.
  const w = await (await world.GET(get("/api/world"))).json();
  assert.deepEqual(w.events, []);
});

test("an unreadable store file is quarantined, not silently treated as empty", async () => {
  writeFileSync(join(sandbox, ".data", "events.json"), "{ this is not json");
  // Reading still works (degraded, logged) rather than throwing…
  const res = await events.GET(get("/api/events"));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), []);
  // …and the damaged file was moved aside instead of being overwritten.
  const { readdirSync } = await import("node:fs");
  assert.ok(readdirSync(join(sandbox, ".data")).some((f) => f.startsWith("events.json.corrupt-")));
});
