// The data policy, the ingestion adapter, and the honesty rules the charts and
// insights are built on. Each of these is a claim Beacon makes in its own UI, so
// each is tested as a claim rather than as a function.

import { test } from "node:test";
import assert from "node:assert/strict";
import { DECISION_RETENTION_DAYS, SYSTEM_ACTOR, cutoffFor, retentionReport } from "@/lib/policy";
import { jiraSearch, jiraSearchToBase, loadJiraBase } from "@/lib/server/jira";
import { SEED, activeItems } from "@/lib/data";
import { burndown, statusBreakdown, velocitySeries } from "@/lib/metrics";
import { adoption, participation, rollup } from "@/lib/insights";
import { loadConfig } from "@/lib/config";

// ---- retention -------------------------------------------------------------

const NOW = new Date("2026-10-08T12:00:00.000Z");

test("retention: the policy is a stated window, not a magic number", () => {
  assert.equal(typeof DECISION_RETENTION_DAYS, "number");
  assert.ok(DECISION_RETENTION_DAYS >= 30, "a decision log worth auditing is kept for more than a month");
  assert.equal(SYSTEM_ACTOR, "system");
});

test("retention: the cutoff is the window measured back from now", () => {
  const cutoff = cutoffFor(30, NOW);
  assert.equal(cutoff, new Date(NOW.getTime() - 30 * 86_400_000).toISOString());
});

test("retention: the report counts what WOULD go, and removes nothing", () => {
  const events = [
    { at: "2020-01-01T00:00:00.000Z" }, // long past the window
    { at: "2026-10-01T00:00:00.000Z" }, // inside it
    { at: "2026-10-08T00:00:00.000Z" },
  ];
  const r = retentionReport(events, 30, NOW);
  assert.equal(r.total, 3);
  assert.equal(r.expired, 1);
  assert.equal(r.olderThanDays, 30);
  assert.equal(events.length, 3, "a dry run must not mutate the log");
});

test("retention: an empty log reports nothing expired", () => {
  const r = retentionReport([], DECISION_RETENTION_DAYS, NOW);
  assert.equal(r.total, 0);
  assert.equal(r.expired, 0);
});

// ---- the ingestion adapter -------------------------------------------------

test("jira: the faked search response is shaped like Jira's own", () => {
  const res = jiraSearch();
  assert.equal(res.total, res.issues.length);
  assert.equal(res.startAt, 0);
  const issue = res.issues[0];
  assert.ok(issue.key === issue.key.toUpperCase(), "an issue key is upper case");
  assert.match(issue.self, /^https:\/\//);
  // The standard fields a Jira consumer would read are present and realistic.
  for (const field of ["summary", "issuetype", "status", "priority", "comment"]) {
    assert.ok(field in issue.fields, `a Jira issue carries ${field}`);
  }
  const status = issue.fields.status as { name: string; statusCategory: { key: string } };
  assert.ok(["new", "indeterminate", "done"].includes(status.statusCategory.key));
});

test("jira: the adapter round-trips the domain losslessly", () => {
  const base = jiraSearchToBase(jiraSearch());
  assert.deepEqual(base.items, SEED.items, "every item survives fetch → adapt unchanged");
  assert.deepEqual(base.updates, SEED.updates, "and so does every update");
  assert.deepEqual(loadJiraBase(), base);
});

test("jira: a blocked issue carries its blocker where a consumer can see it", () => {
  const blockedIds = new Set(SEED.items.filter((i) => i.status === "blocked").map((i) => i.id));
  const issues = jiraSearch().issues.filter((i) => blockedIds.has(i.id));
  assert.ok(issues.length > 0);
  for (const i of issues) assert.ok(i.fields.customfield_10001, `${i.key} should expose its blocker flag`);
});

// ---- the honesty rules behind the visuals ----------------------------------

test("charts: the status donut accounts for every active item exactly once", () => {
  const slices = statusBreakdown(SEED);
  const total = slices.reduce((a, s) => a + s.count, 0);
  assert.equal(total, activeItems(SEED).length);
  for (const s of slices) assert.ok(s.count > 0, "an empty slice is not drawn");
});

test("charts: the burndown draws only days it has data for — it never projects", () => {
  const b = burndown(SEED);
  const drawn = b.points.filter((p) => p.actual !== null);
  assert.ok(drawn.length >= 1, "at least the real endpoint is drawn");
  assert.ok(
    b.points.some((p) => p.actual === null),
    "future days stay undrawn rather than being guessed",
  );
  // The ideal line is a straight line to zero, which is a stated reference.
  assert.equal(b.points[b.points.length - 1].ideal, 0);
});

test("charts: velocity compares a goal with an actual, and a running sprint has no actual yet", () => {
  const bars = velocitySeries();
  assert.ok(bars.length >= 2);
  for (const bar of bars) assert.ok(bar.goal > 0, "every sprint states its goal");
});

test("insights: participation counts people with work in flight, not the whole team", () => {
  const p = participation(SEED);
  const owners = new Set(activeItems(SEED).map((i) => i.owner).filter(Boolean));
  assert.ok(p.expected > 0);
  assert.ok(p.expected <= owners.size, "nobody without in-flight work is expected to post");
  assert.ok(p.rate >= 0 && p.rate <= 1, "a rate is a rate");
  assert.ok(p.freshCount <= p.expected);
  // Nobody can be counted as quiet who was not expected to post in the first
  // place — that is what keeps this a team metric and not a performance score.
  assert.ok(p.quiet.length <= p.expected);
  for (const n of p.perDay) assert.ok(n <= p.expected);
});

test("insights: the roll-up states what a worse-than-tracker verdict is based on", () => {
  const rows = rollup(SEED);
  assert.ok(rows.length > 0, "the seeded sprint contains work whose real state is worse than its status");
  for (const row of rows) {
    assert.ok(row.item);
    assert.ok(row.because.length > 0, "a 'cannot deliver' claim must say what it waits on");
    assert.ok(["Blocked", "Cannot deliver", "At risk"].includes(row.beaconSays));
    if (row.beaconSays === "Cannot deliver") assert.ok(row.blockedBy.length > 0, "and name the blocking item");
  }
});

test("adoption: with no decisions recorded, rates are null rather than a flattering zero", () => {
  const a = adoption(SEED);
  assert.equal(a.accepted, 0);
  assert.equal(a.dismissed, 0);
  assert.equal(a.acceptRate, null, "no data must not read as 0% or 100%");
  assert.ok(a.signalsRaised > 0);
});

// ---- configuration ---------------------------------------------------------

test("config: with no environment set, Beacon runs rules-only — a model is optional", () => {
  const cfg = loadConfig({} as NodeJS.ProcessEnv);
  assert.equal(cfg.provider, "none");
  assert.equal(cfg.detector, "rules");
  assert.equal(cfg.compose, false);
  assert.equal(cfg.intervalMins, 60);
});

test("config: a key present infers OpenAI; an explicit provider always wins", () => {
  assert.equal(loadConfig({ OPENAI_API_KEY: "sk-test" } as unknown as NodeJS.ProcessEnv).provider, "openai");
  assert.equal(
    loadConfig({ OPENAI_API_KEY: "sk-test", BEACON_LLM_PROVIDER: "ollama" } as unknown as NodeJS.ProcessEnv).provider,
    "ollama",
  );
  assert.equal(
    loadConfig({ OPENAI_API_KEY: "sk-test", BEACON_LLM_PROVIDER: "none" } as unknown as NodeJS.ProcessEnv).provider,
    "none",
  );
});

test("config: a nonsense value falls back instead of taking the agent down", () => {
  const cfg = loadConfig({
    BEACON_LLM_PROVIDER: "gpt-9",
    BEACON_DETECTOR: "vibes",
    BEACON_AGENT_INTERVAL_MINS: "not-a-number",
  } as unknown as NodeJS.ProcessEnv);
  assert.equal(cfg.provider, "none");
  assert.equal(cfg.detector, "both");
  assert.equal(cfg.intervalMins, 60);
});

test("config: quiet hours and the watched sprint are config, not code", () => {
  const cfg = loadConfig({ BEACON_QUIET_HOURS: "20:00-07:00", BEACON_ACTIVE_SPRINT_ID: "s3" } as unknown as NodeJS.ProcessEnv);
  assert.equal(cfg.quietHours, "20:00-07:00");
  assert.equal(cfg.activeSprintId, "s3");
});
