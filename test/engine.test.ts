// The deterministic brain: detection, the attention score, and the facts both
// read from.
//
// These tests pin the two invariants the product's credibility rests on:
//
//   1. the score IS the sum of the reasons shown beside it (nothing hidden)
//   2. every contribution names a RULE a team can read in "How scoring works"
//
// If either breaks, the number stops being explainable, which is the whole
// claim Beacon makes over a tracker's own priority field.

import { test } from "node:test";
import assert from "node:assert/strict";
import { CAUSES, THRESHOLD, causesOf, detect, detectionGeneration, setDetectionOverrides } from "@/lib/detect";
import { ATTENTION_THRESHOLD, RULES, attentionScore, bandFor, byAttention, needsAttention } from "@/lib/priorityScore";
import { SEED, activeItems, isDone } from "@/lib/data";
import { factsFor } from "@/lib/facts";

// ---- detection -------------------------------------------------------------

test("detection: plain distress wording crosses the threshold and names its phrases", () => {
  const d = detect("I am completely stuck on the webhook signature and not sure how to proceed");
  assert.equal(d.signal, true);
  assert.ok(d.score >= THRESHOLD);
  assert.ok(d.hits.some((h) => h.phrase === "stuck"));
  // The score is the sum of the weights it reports — same invariant as the score.
  assert.equal(
    d.score,
    [...d.hits, ...d.relief].reduce((a, h) => a + h.weight, 0),
  );
});

test("detection: ordinary progress does not flag", () => {
  const d = detect("Wired up the payment form and started on validation. On track for Thursday.");
  assert.equal(d.signal, false);
});

test("detection: relief wording pulls a borderline update back under the line", () => {
  const distress = detect("Had issues with the sandbox and cannot reach it");
  const resolved = detect("Had issues with the sandbox and cannot reach it — identified the problem, working on the fix");
  assert.ok(resolved.score < distress.score);
  assert.ok(resolved.relief.length > 0);
});

test("detection: empty and null text are safe and score zero", () => {
  for (const input of ["", null, undefined]) {
    const d = detect(input);
    assert.equal(d.score, 0);
    assert.equal(d.signal, false);
  }
});

test("detection: an override replaces the verdict for exactly that text, then is cleared", () => {
  const text = "all fine here";
  const before = detect(text).signal;
  assert.equal(before, false);
  const gen = detectionGeneration();
  setDetectionOverrides(new Map([[text, { score: 9, hits: [{ phrase: "model read it as blocked", weight: 9 }], relief: [], signal: true }]]));
  try {
    // The generation must change, or memoised facts would serve stale verdicts.
    assert.notEqual(detectionGeneration(), gen);
    assert.equal(detect(text).signal, true);
    // Any other text still goes through the rules.
    assert.equal(detect("something else entirely").signal, false);
  } finally {
    setDetectionOverrides(null);
  }
  assert.equal(detect(text).signal, false);
});

test("root causes: each category matches its own wording and nothing else", () => {
  assert.deepEqual(causesOf("still waiting on the client for credentials"), ["external"]);
  assert.ok(causesOf("the SDK docs are wrong about the HMAC signature").includes("technical"));
  assert.ok(causesOf("acceptance criteria are unclear").includes("requirements"));
  assert.ok(causesOf("no owner and no time this sprint").includes("capacity"));
  assert.deepEqual(causesOf("finished the report"), []);
  // Every cause carries the prevention line the retro screen renders.
  for (const c of CAUSES) assert.ok(c.action.length > 20, `${c.key} needs an action line`);
});

// ---- the attention score ---------------------------------------------------

test("score: the value equals the sum of its reasons, for every seeded item", () => {
  for (const item of SEED.items) {
    const s = attentionScore(item, SEED);
    assert.equal(
      s.value,
      s.reasons.reduce((a, r) => a + r.points, 0),
      `${item.id}: the score must be the sum of the reasons shown with it`,
    );
  }
});

test("score: every reason names a rule documented in RULES", () => {
  const known = new Set(RULES.map((r) => r.key));
  for (const item of SEED.items) {
    for (const r of attentionScore(item, SEED).reasons) {
      assert.ok(known.has(r.rule), `${item.id}: reason "${r.label}" cites unknown rule "${r.rule}"`);
    }
  }
});

test("score: finished work scores zero and carries no reasons", () => {
  const done = SEED.items.filter(isDone);
  assert.ok(done.length > 0, "the seed should contain completed work");
  for (const item of done) {
    const s = attentionScore(item, SEED);
    assert.equal(s.value, 0);
    assert.deepEqual(s.reasons, []);
    assert.equal(s.band, "low");
  }
});

test("score: bands follow the published thresholds", () => {
  assert.equal(bandFor(ATTENTION_THRESHOLD), "high");
  assert.equal(bandFor(ATTENTION_THRESHOLD - 1), "medium");
  assert.equal(bandFor(35), "medium");
  assert.equal(bandFor(34), "low");
  assert.equal(bandFor(0), "low");
});

test("score: ranking is by value, descending, and needsAttention agrees with it", () => {
  const ranked = byAttention(activeItems(SEED), SEED);
  const values = ranked.map((i) => attentionScore(i, SEED).value);
  assert.deepEqual(values, [...values].sort((a, b) => b - a));
  for (const item of ranked) {
    assert.equal(needsAttention(item, SEED), attentionScore(item, SEED).value >= ATTENTION_THRESHOLD);
  }
});

test("score: raising work priority raises the score, transparently", () => {
  const item = activeItems(SEED).find((i) => i.priority === "medium" && !isDone(i));
  assert.ok(item, "the seed should contain a medium-priority active item");
  const before = attentionScore(item, SEED);
  const after = attentionScore({ ...item, priority: "high" }, SEED);
  assert.ok(after.value > before.value);
  // And the change is visible as a reason, not an unexplained jump.
  assert.ok(after.reasons.some((r) => r.rule === "priority" && /high/i.test(r.label)));
});

test("score: the demo's headline item is the one that needs attention most", () => {
  // REQ-001 is the arc the demo walks through (a day-3 update that read as
  // blocked, raised formally on day 6). If a scoring change ever demotes it
  // below the attention line, the story the screens tell has silently changed.
  const req001 = SEED.items.find((i) => i.id === "req-001");
  assert.ok(req001);
  const s = attentionScore(req001, SEED);
  assert.equal(s.band, "high");
  assert.ok(s.value >= ATTENTION_THRESHOLD);
});

// ---- facts -----------------------------------------------------------------

test("facts: a blocked item reports its blocker timeline", () => {
  const blocked = activeItems(SEED).find((i) => i.status === "blocked");
  assert.ok(blocked, "the seed should contain a blocked item");
  const f = factsFor(blocked, SEED);
  assert.equal(f.blocked, true);
  assert.ok(f.blockedSinceDay !== null);
  assert.ok(f.blockedDays >= 0);
});

test("facts: the dependency walk is transitive and finds blocked upstream work", () => {
  const withUpstream = activeItems(SEED).find((i) => factsFor(i, SEED).blockedUpstream.length > 0);
  assert.ok(withUpstream, "the seed should contain an item that cannot deliver");
  const f = factsFor(withUpstream, SEED);
  for (const up of f.blockedUpstream) assert.ok(up.status === "blocked" || up.blocker);
  // The blocking item sees it from the other side.
  const blocker = f.blockedUpstream[0];
  assert.ok(factsFor(blocker, SEED).dependents.length > 0);
});

test("facts: a cycle in dependsOn does not hang the walk", () => {
  const a = { ...SEED.items[0], id: "cyc-a", dependsOn: ["cyc-b"], status: "in_progress" as const };
  const b = { ...SEED.items[0], id: "cyc-b", dependsOn: ["cyc-a"], status: "blocked" as const };
  const world = { items: [a, b], updates: [], events: [] };
  const f = factsFor(a, world);
  assert.ok(f.blockedUpstream.some((i) => i.id === "cyc-b"));
});

test("facts: silence only counts where a daily update is expected", () => {
  for (const item of activeItems(SEED)) {
    const f = factsFor(item, SEED);
    if (!f.expectsDaily) {
      // A decision or a watched risk is never nagged, whatever its staleness.
      assert.ok(!attentionScore(item, SEED).reasons.some((r) => r.rule === "stale"));
    }
  }
});
