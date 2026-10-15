// The long-running agent worker.
//
// Deliberately tiny: the agent's brain lives in the Next server (so it shares
// the exact same lib/ code the UI uses, TypeScript and all). This process is
// only the CLOCK — it triggers runs on the configured cadence by calling
// POST /api/agent/run, and runs once immediately on start. Event-driven runs
// come from a webhook hitting the same endpoint; "Run now" comes from the UI.
//
//   node agent/run.mjs            # run once, then every BEACON_AGENT_INTERVAL_MINS
//   node agent/run.mjs --once     # a single run, then exit (cron / CI mode)
//
// Being a clock that runs unattended for days, it owes an operator four things
// (docs/OPERATIONS.md):
//
//   NO OVERLAP        a run that outlasts the interval is not run again
//                     alongside itself; the tick is skipped and said so. The
//                     server also joins concurrent triggers, so this is the
//                     second of two guards.
//   A DEADLINE        every trigger is aborted after BEACON_AGENT_TIMEOUT_MS, so
//                     a server that accepts the connection and never answers
//                     cannot wedge the worker forever.
//   BACKOFF           repeated failures (server down, bad deploy) stop hammering
//                     the endpoint every minute and log one line per attempt
//                     with the consecutive count.
//   A CLEAN EXIT      SIGINT/SIGTERM stop the timer, let an in-flight run
//                     finish, and exit 0 — so a container restart or a Ctrl-C
//                     never kills a run halfway through writing its snapshot.
//
// Exit codes: 0 success (or a clean shutdown), 1 the run failed in --once mode,
// so cron and CI can tell.
//
// Config (all optional, see .env.example):
//   BEACON_URL                 default http://localhost:3000
//   BEACON_AGENT_INTERVAL_MINS default 60
//   BEACON_QUIET_HOURS         e.g. "20:00-07:00" (no scheduled runs in window)
//   BEACON_AGENT_TIMEOUT_MS    default 600000 (10 min — a run may call a model
//                              once per item)

import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

// Load .env.local with override so its values win over any stale same-named
// machine/user environment variable.
config({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env.local"), override: true });

const num = (raw, fallback, min, max) => {
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
};

const BASE = (process.env.BEACON_URL || "http://localhost:3000").replace(/\/$/, "");
const INTERVAL_MIN = num(process.env.BEACON_AGENT_INTERVAL_MINS, 60, 1, 1440);
const TIMEOUT_MS = num(process.env.BEACON_AGENT_TIMEOUT_MS, 600_000, 5_000, 3_600_000);
const QUIET = process.env.BEACON_QUIET_HOURS || "";
const once = process.argv.includes("--once");

/** Wait this long after N consecutive failures, capped — not the full interval. */
const backoffMs = (failures) => Math.min(30_000 * 2 ** (failures - 1), INTERVAL_MIN * 60_000);

function inQuietHours(now = new Date()) {
  const m = QUIET.match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
  if (!m) return false;
  const [, h1, m1, h2, m2] = m.map(Number);
  const cur = now.getHours() * 60 + now.getMinutes();
  const start = h1 * 60 + m1;
  const end = h2 * 60 + m2;
  return start <= end ? cur >= start && cur < end : cur >= start || cur < end; // wraps midnight
}

let running = false;
let failures = 0;
let nextAllowedAt = 0;
let stopping = false;
let inFlight = null;

async function runOnce(trigger = "schedule") {
  if (running) {
    console.warn(`[${new Date().toISOString()}] previous run still in flight — skipping this tick`);
    return false;
  }
  running = true;
  const at = new Date().toISOString();
  const requestId = randomUUID();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/api/agent/run`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": requestId },
      body: JSON.stringify({ trigger }),
      signal: controller.signal,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `${res.status} ${res.statusText}`);
    failures = 0;
    nextAllowedAt = 0;
    console.log(
      `[${at}] ${trigger} run — detector=${body.detector} provider=${body.provider ?? "rules"}${body.model ? `(${body.model})` : ""} ` +
        `scanned=${body.itemsScanned} llmCalls=${body.llmCalls} disagreements=${body.disagreements} composed=${body.composed ?? 0} ` +
        `open=${body.signalsOpen} errors=${body.errors}${body.joined ? " (joined a run already in progress)" : ""} req=${requestId}`,
    );
    return true;
  } catch (err) {
    failures++;
    const aborted = err?.name === "AbortError";
    const wait = backoffMs(failures);
    nextAllowedAt = Date.now() + wait;
    console.error(
      `[${at}] run failed (${failures} in a row): ${aborted ? `no response within ${TIMEOUT_MS}ms` : err.message}` +
        `  (is the Next server up at ${BASE}?)  next attempt in ${Math.round(wait / 1000)}s  req=${requestId}`,
    );
    return false;
  } finally {
    clearTimeout(timer);
    running = false;
  }
}

/** Wrap a run so shutdown can wait for it. */
async function tracked(trigger) {
  inFlight = runOnce(trigger);
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

// `--once` is the cron/CI mode: the caller chose the moment, so it always runs.
// The worker's own startup run respects quiet hours like every scheduled run —
// otherwise restarting the worker at 03:00 would fire the run the window exists
// to prevent.
let startupOk = true;
if (once || !inQuietHours()) {
  startupOk = await tracked("schedule");
} else {
  console.log(`quiet hours ${QUIET}: skipping the startup run`);
}

if (once) {
  process.exit(startupOk ? 0 : 1);
}

console.log(
  `agent worker: every ${INTERVAL_MIN} min, target ${BASE}${QUIET ? `, quiet ${QUIET}` : ""}, timeout ${TIMEOUT_MS}ms`,
);

const ticker = setInterval(() => {
  if (stopping) return;
  if (inQuietHours()) return;
  // Honour the failure backoff: a server that has been down for an hour should
  // not be polled on every tick.
  if (Date.now() < nextAllowedAt) return;
  void tracked("schedule");
}, INTERVAL_MIN * 60_000);

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  clearInterval(ticker);
  console.log(`${signal}: stopping the agent worker${inFlight ? " after the run in flight finishes" : ""}`);
  try {
    await inFlight;
  } catch {
    // runOnce already logged it; a shutdown is not the place to retry
  }
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
// A clock that silently dies on an unexpected rejection is worse than one that
// says why and lets the supervisor restart it.
process.on("unhandledRejection", (err) => {
  console.error("agent worker: unhandled rejection —", err instanceof Error ? err.stack : err);
});
