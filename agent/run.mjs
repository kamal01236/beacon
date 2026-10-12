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
// Config (all optional, see .env.example):
//   BEACON_URL                 default http://localhost:3000
//   BEACON_AGENT_INTERVAL_MINS default 60
//   BEACON_QUIET_HOURS         e.g. "20:00-07:00" (no scheduled runs in window)

import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
// Load .env.local with override so its values win over any stale same-named
// machine/user environment variable.
config({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env.local"), override: true });

const BASE = (process.env.BEACON_URL || "http://localhost:3000").replace(/\/$/, "");
const INTERVAL_MIN = Number(process.env.BEACON_AGENT_INTERVAL_MINS || 60);
const QUIET = process.env.BEACON_QUIET_HOURS || "";
const once = process.argv.includes("--once");

function inQuietHours(now = new Date()) {
  const m = QUIET.match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
  if (!m) return false;
  const [, h1, m1, h2, m2] = m.map(Number);
  const cur = now.getHours() * 60 + now.getMinutes();
  const start = h1 * 60 + m1;
  const end = h2 * 60 + m2;
  return start <= end ? cur >= start && cur < end : cur >= start || cur < end; // wraps midnight
}

async function runOnce(trigger = "schedule") {
  const at = new Date().toISOString();
  try {
    const res = await fetch(`${BASE}/api/agent/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trigger }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || res.statusText);
    console.log(
      `[${at}] ${trigger} run — detector=${body.detector} provider=${body.provider ?? "rules"}${body.model ? `(${body.model})` : ""} ` +
        `scanned=${body.itemsScanned} llmCalls=${body.llmCalls} disagreements=${body.disagreements} composed=${body.composed ?? 0} open=${body.signalsOpen} errors=${body.errors}`,
    );
  } catch (err) {
    console.error(`[${at}] run failed: ${err.message}  (is the Next server up at ${BASE}?)`);
  }
}

await runOnce("schedule");
if (!once) {
  console.log(`agent worker: every ${INTERVAL_MIN} min, target ${BASE}${QUIET ? `, quiet ${QUIET}` : ""}`);
  setInterval(() => {
    if (inQuietHours()) return;
    runOnce("schedule");
  }, INTERVAL_MIN * 60_000);
}
