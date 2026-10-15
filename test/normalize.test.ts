// Whatever a model returns, what reaches the rest of Beacon must obey Beacon's
// invariants. A local model in particular will omit fields, send a weight as a
// string, get its own arithmetic wrong, or propose a status that does not exist.
//
// The rule: the model supplies EVIDENCE; the threshold decision and the sum are
// ours. These tests hold that line.

import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeDetection, normalizeSummarize } from "@/lib/llm/normalize";
import { THRESHOLD } from "@/lib/detect";

test("the score is recomputed from the phrases, never taken from the model", () => {
  const d = normalizeDetection({
    signal: false, // the model says no…
    score: 0, // …and claims zero…
    hits: [{ phrase: "stuck", weight: 3 }, { phrase: "no response", weight: 2 }], // …while reporting 5 points of evidence
    relief: [],
    rationale: "it is fine",
  });
  assert.equal(d.score, 5, "the score is the sum of the weights the model reported");
  assert.equal(d.signal, 5 >= THRESHOLD, "and the threshold decision is ours");
  assert.equal(d.signal, true);
});

test("weights are coerced to the right sign and clamped to the rule detector's range", () => {
  const d = normalizeDetection({
    hits: [{ phrase: "a", weight: -9 }, { phrase: "b", weight: "2" }],
    relief: [{ phrase: "c", weight: 7 }],
  });
  assert.equal(d.hits[0].weight, 3, "a distress phrase cannot score negatively, and 9 is clamped to 3");
  assert.equal(d.hits[1].weight, 2, "a numeric string is accepted");
  assert.equal(d.relief[0].weight, -3, "relief is always negative");
  assert.equal(d.score, 3 + 2 - 3);
});

test("junk entries are dropped rather than carried into a verdict", () => {
  const d = normalizeDetection({
    hits: [null, "nope", { weight: 2 }, { phrase: "   " }, { phrase: "real", weight: 1 }],
    relief: "not an array",
  });
  assert.deepEqual(d.hits, [{ phrase: "real", weight: 1 }]);
  assert.deepEqual(d.relief, []);
});

test("an empty or missing response is a zero-score verdict, not a crash", () => {
  for (const raw of [undefined, null, {}, "", 7]) {
    const d = normalizeDetection(raw);
    assert.equal(d.score, 0);
    assert.equal(d.signal, false);
    assert.deepEqual(d.hits, []);
  }
});

test("summarize: a proposed status outside the allowed set is dropped, not guessed", () => {
  const allowed = ["in_progress", "blocked", "done"];
  assert.equal(normalizeSummarize({ text: "x", proposedStatus: "shipped" }, allowed).proposedStatus, null);
  assert.equal(normalizeSummarize({ text: "x", proposedStatus: "blocked" }, allowed).proposedStatus, "blocked");
  assert.equal(normalizeSummarize({ text: "x" }, allowed).proposedStatus, null);
});

test("summarize: questions are coerced to a short list of non-empty strings", () => {
  assert.deepEqual(normalizeSummarize({ text: "x", questions: "just one?" }).questions, ["just one?"]);
  assert.deepEqual(normalizeSummarize({ text: "x", questions: ["a?", "", "  ", "b?", "c?"] }).questions, ["a?", "b?"]);
  assert.deepEqual(normalizeSummarize({ text: "x" }).questions, []);
});

test("summarize: the text is trimmed, and an empty result stays empty for the caller to reject", () => {
  assert.equal(normalizeSummarize({ text: "  tidy update.  " }).text, "tidy update.");
  assert.equal(normalizeSummarize({}).text, "");
});
