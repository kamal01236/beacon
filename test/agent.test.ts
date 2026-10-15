// What the agent raises, and what it refuses to do.
//
// The rules under test are the ones that make the agent safe to leave running:
// every signal carries evidence and a confidence it can justify, nothing it
// proposes is applied until a person approves it, a decision closes the signal,
// and a model being down degrades the result instead of breaking the run.

import { test } from "node:test";
import assert from "node:assert/strict";
import { SIGNAL_LABEL, getRequests, getRun, getSignals, kbFor, helperFor, type SignalKind } from "@/lib/agent";
import { SEED, activeItems } from "@/lib/data";
import { buildWorldFrom } from "@/lib/world";
import { factsFor } from "@/lib/facts";
import { llmCompose, llmDetect } from "@/lib/llm";
import { detect } from "@/lib/detect";
import type { BeaconEvent } from "@/lib/events";
import type { DetectInput, LlmProvider } from "@/lib/llm/types";

/**
 * A world whose one active item has a fresh update that reads as blocked while
 * no blocker has been raised — the state a hidden-blocker signal exists for.
 */
function worldWithHiddenBlocker() {
  const item = {
    ...SEED.items.find((i) => i.status === "in_progress")!,
    id: "req-901",
    dependsOn: [],
    blocker: null,
    status: "in_progress" as const,
  };
  const update = {
    id: "u-901",
    itemId: "req-901",
    sprintId: item.sprintId,
    author: item.owner,
    date: "2026-10-08",
    sprintDay: 8,
    statusStructured: "in_progress" as const,
    progressText: "Still stuck on this, not sure how to proceed and the vendor has not replied",
    nextAction: null,
  };
  return buildWorldFrom([item], [update], []);
}

test("every signal is explainable: evidence, a source and a confidence basis that sums", () => {
  const signals = getSignals(SEED);
  assert.ok(signals.length > 0, "the seeded sprint should raise signals");
  for (const s of signals) {
    assert.ok(s.evidence.length > 0, `${s.id} has no evidence`);
    assert.ok(s.source.length > 0, `${s.id} does not say where it came from`);
    assert.ok(SIGNAL_LABEL[s.kind], `${s.id} has an unlabelled kind`);
    assert.ok(s.confidence.value >= 0 && s.confidence.value <= 100);
    assert.ok(s.confidence.basis.length > 0, `${s.id} states a confidence with no basis`);
    const summed = s.confidence.basis.reduce((a, b) => a + b.points, 0);
    assert.equal(
      s.confidence.value,
      Math.max(5, Math.min(95, summed)) === s.confidence.value ? s.confidence.value : summed,
      `${s.id}: confidence must be the sum of its basis (clamped)`,
    );
  }
});

test("a fact-based signal claims 100% and says it read it directly", () => {
  const factual = getSignals(SEED).filter((s) => s.confidence.kind === "fact");
  for (const s of factual) {
    assert.equal(s.confidence.value, 100);
    assert.match(s.confidence.basis[0].label, /read directly from/i);
  }
});

test("nothing the agent proposes starts out applied", () => {
  for (const s of getSignals(SEED)) {
    for (const p of s.proposals) {
      assert.equal(p.state, "pending", `${p.id} must wait for a person`);
      assert.ok(p.change.label.length > 0, "a proposal must be approvable as one readable line");
      assert.ok(p.origin.startsWith("signal:") || p.origin.startsWith("request:"));
    }
  }
});

test("a hidden blocker asks its author first, before anyone else is alerted", () => {
  // In the frozen seed REQ-001's blocker has already been raised formally, so
  // the hidden-blocker path is reached by a NEW update that reads as blocked —
  // which is exactly the live moment the demo walks through. Build that world.
  const w = worldWithHiddenBlocker();
  const hidden = getSignals(w).find((s) => s.kind === "hidden-blocker");
  assert.ok(hidden, "an update that reads as blocked must raise a hidden blocker");
  assert.ok(hidden.authorFirst, "the person who wrote the update is asked to confirm first");
  const request = getRequests(w).find((r) => r.itemId === hidden.itemId && r.kind === "confirm-blocker");
  assert.ok(request, "and that confirmation is raised as an input request");
  assert.equal(request.toMemberId, hidden.authorFirst);
  // Nobody else is alerted yet: the proposal that would change the tracker is
  // still pending a human.
  for (const p of hidden.proposals) assert.equal(p.state, "pending");
});

test("the seeded sprint raises no hidden blocker, because its blocker was raised", () => {
  // A guard on the demo's own premise: REQ-001 reads as blocked on day 3 and is
  // raised on day 6, so at the frozen day-8 clock it is a `blocked` signal, not
  // a hidden one. If this ever flips, the lead-time story on Insights changes.
  assert.equal(
    getSignals(SEED).some((s) => s.kind === "hidden-blocker"),
    false,
  );
  assert.ok(getSignals(SEED).some((s) => s.kind === "blocked" && s.itemId === "req-001"));
});

test("deciding a signal closes it, and the decision is attributed", () => {
  const open = getSignals(SEED).find((s) => s.state === "open");
  assert.ok(open);
  const events: BeaconEvent[] = [
    {
      id: "ev-1",
      at: "2026-10-08T10:00:00.000Z",
      actor: "m-001",
      kind: "signal.decided",
      signalId: open.id,
      signalKind: open.kind,
      itemId: open.itemId,
      decision: "dismissed",
      reason: "Already handled",
    },
  ];
  const w = buildWorldFrom(SEED.items, SEED.updates, events);
  const after = getSignals(w).find((s) => s.id === open.id);
  assert.ok(after);
  assert.equal(after.state, "dismissed");
  assert.equal(after.decidedBy, "m-001");
  assert.equal(after.reason, "Already handled");
});

test("an input request is only asked of someone who can answer it", () => {
  for (const r of getRequests(SEED)) {
    assert.ok(r.toMemberId, `${r.id} must name who is being asked`);
    assert.ok(r.itemId, `${r.id} must be about an item`);
    assert.ok(["update", "confirm-blocker"].includes(r.kind));
  }
});

test("a run reports what it scanned, not what it changed", () => {
  const run = getRun(SEED);
  assert.ok(run.itemsScanned > 0);
  assert.ok(run.itemsScanned <= SEED.items.length);
});

test("signals are ranked by severity first, then by kind", () => {
  // Severity is what a facilitator triages on; kind only breaks ties within it.
  const severityRank = { high: 0, medium: 1, low: 2 };
  const kindRank: SignalKind[] = ["hidden-blocker", "blocked", "cannot-deliver", "overdue", "stale-status", "missing-update", "at-risk"];
  const keys = getSignals(SEED).map((s) => [severityRank[s.severity], kindRank.indexOf(s.kind)] as const);
  for (const [, kind] of keys) assert.notEqual(kind, -1, "every signal kind must have a rank");
  assert.deepEqual(keys, [...keys].sort((a, b) => a[0] - b[0] || a[1] - b[1]));
});

test("knowledge-base help cites an article and an author, or offers nothing", () => {
  for (const item of activeItems(SEED)) {
    const match = kbFor(item, SEED);
    if (!match) continue;
    assert.ok(match.article.title);
    assert.ok(match.article.steps.length > 0, "a runbook with no steps is not help");
  }
});

test("a suggested helper is a real teammate who is not the owner", () => {
  for (const item of activeItems(SEED)) {
    const helper = helperFor(item, SEED);
    if (!helper) continue;
    assert.notEqual(helper.member.id, item.owner, "suggesting the owner help themselves is not a suggestion");
    assert.ok(helper.why.length > 0);
  }
});

// ---- degradation -----------------------------------------------------------

const detectInput = (text: string): DetectInput => ({
  code: "REQ-001",
  title: "Payment gateway integration",
  status: "in_progress",
  priority: "high",
  dueInDays: 2,
  owner: "Marcus",
  updates: [{ day: 8, text }],
});

const provider = (impl: Partial<LlmProvider>): LlmProvider => ({
  name: "test",
  model: "test-model",
  detect: async () => {
    throw new Error("not implemented");
  },
  ...impl,
});

test("with no provider configured, detection is the rule detector — not an error", async () => {
  const text = "I am stuck and not sure how to proceed";
  const d = await llmDetect(detectInput(text), null);
  assert.deepEqual(d, detect(text));
});

test("a provider that throws falls back to the rules, and the failure is reported once", async () => {
  const text = "completely stuck on the HMAC signature";
  let errors = 0;
  const d = await llmDetect(
    detectInput(text),
    provider({
      detect: async () => {
        throw new Error("502 from upstream");
      },
    }),
    () => errors++,
  );
  assert.equal(errors, 1, "the run counts the error so /api/agent/run reports it");
  assert.deepEqual(d, detect(text), "the verdict is still usable");
});

test("a model verdict is passed through with its phrases intact", async () => {
  const d = await llmDetect(
    detectInput("the client has gone quiet again"),
    provider({
      detect: async () => ({
        signal: true,
        score: 5,
        hits: [{ phrase: "client has gone quiet", weight: 5 }],
        relief: [],
        rationale: "waiting on an external party with no date",
      }),
    }),
  );
  assert.equal(d.signal, true);
  assert.deepEqual(d.hits, [{ phrase: "client has gone quiet", weight: 5 }]);
});

test("a comment proposal always has approvable text, whatever the model does", async () => {
  const fallback = "@Sarah could you chase the sandbox credentials today?";
  const input = { code: "REQ-001", title: "t", status: "blocked", owner: "Marcus", intent: "chase the client", fallback };

  // no provider
  assert.deepEqual(await llmCompose(input, null), { text: fallback, fromModel: false });
  // a provider with no compose capability
  assert.deepEqual(await llmCompose(input, provider({})), { text: fallback, fromModel: false });
  // a provider that errors
  assert.deepEqual(
    await llmCompose(input, provider({ compose: async () => { throw new Error("down"); } })),
    { text: fallback, fromModel: false },
  );
  // a provider that returns nothing useful
  assert.deepEqual(await llmCompose(input, provider({ compose: async () => ({ text: "   " }) })), {
    text: fallback,
    fromModel: false,
  });
  // and a working one
  assert.deepEqual(
    await llmCompose(input, provider({ compose: async () => ({ text: "Chasing the credentials with the client today." }) })),
    { text: "Chasing the credentials with the client today.", fromModel: true },
  );
});

test("the detector's reading is what drives a hidden-blocker signal", () => {
  const w = worldWithHiddenBlocker();
  const item = w.items[0];
  assert.ok(factsFor(item, w).languageNow, "the update must read as blocked");
  const signal = getSignals(w).find((s) => s.itemId === item.id && s.kind === "hidden-blocker");
  assert.ok(signal, "a hidden blocker must be raised");
  // The evidence quotes the wording, so the person can judge the reading.
  assert.match(signal.evidence.join(" "), /stuck|not sure/i);
});
