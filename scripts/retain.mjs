// The retention sweep's clock.
//
// Deliberately tiny, for the same reason agent/run.mjs is: the policy itself
// lives in TypeScript (lib/policy.ts) and runs inside the Next server, so there
// is exactly one definition of what is kept and for how long. This process only
// decides *when*, and reports what happened.
//
//   node scripts/retain.mjs                 # dry run — what the policy would remove
//   node scripts/retain.mjs --apply         # remove it, and log that it was removed
//   node scripts/retain.mjs --days 30       # a different window (dry run)
//   node scripts/retain.mjs --days 30 --apply
//
// Config (optional, see .env.example):
//   BEACON_URL   default http://localhost:3000
//
// In production this is a cron entry (or Vercel Cron on POST /api/data/retention).
// Nothing is removed without --apply, so it is safe to run by hand.

import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
config({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env.local"), override: true });

const BASE = (process.env.BEACON_URL || "http://localhost:3000").replace(/\/$/, "");
const apply = process.argv.includes("--apply");
const daysArg = process.argv.indexOf("--days");
const days = daysArg > -1 ? Number(process.argv[daysArg + 1]) : null;
if (daysArg > -1 && (!Number.isFinite(days) || days <= 0)) {
  console.error("--days needs a positive number of days");
  process.exit(1);
}

const url = `${BASE}/api/data/retention${!apply && days ? `?days=${days}` : ""}`;

try {
  const res = await fetch(url, {
    method: apply ? "POST" : "GET",
    ...(apply ? { headers: { "content-type": "application/json" }, body: JSON.stringify(days ? { days } : {}) } : {}),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || res.statusText);

  if (apply) {
    console.log(
      body.removed > 0
        ? `retention: removed ${body.removed} event(s) older than ${body.olderThanDays} days (before ${body.cutoff}); the removal is recorded in the log`
        : `retention: nothing older than ${body.olderThanDays} days — no change, and no row added to the log`,
    );
  } else {
    console.log(
      `retention (dry run): ${body.expired} of ${body.total} event(s) are older than ${body.olderThanDays} days ` +
        `(before ${body.cutoff}). Re-run with --apply to remove them.`,
    );
  }
} catch (err) {
  console.error(`retention failed: ${err.message}  (is the Next server up at ${BASE}?)`);
  process.exit(1);
}
