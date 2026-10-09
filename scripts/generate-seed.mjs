// Deterministic seed expander.
//
// Grows the hand-crafted demo data up to ~100 work items across four sprints,
// with owners, dependencies, statuses and updates — so the UI and the agent have
// realistic volume to work with. No connectors, no DB: this writes the predefined
// JSON the app reads. Re-runnable and stable (seeded PRNG).
//
// The seed holds only RAW tracker facts. Attention scores, blocker signals and
// confidence are never stored here — the app computes them (lib/priorityScore.ts,
// lib/detect.ts, lib/agent.ts), exactly as it would over a live Jira/ADO feed.
//
// Run:  node scripts/generate-seed.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const read = (f) => JSON.parse(readFileSync(join(DATA, f), "utf8"));
const write = (f, v) => writeFileSync(join(DATA, f), JSON.stringify(v, null, 2) + "\n");

// --- seeded PRNG (mulberry32) so output is identical every run -------------
let _s = 0x9e3779b9;
function rnd() {
  _s |= 0; _s = (_s + 0x6d2b79f5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (a) => a[Math.floor(rnd() * a.length)];
const chance = (p) => rnd() < p;

const members = read("members.json").map((m) => m.id); // m1..m6
// keep only the hand-crafted rows; drop anything a previous run generated so
// this script is idempotent.
// Derived fields from older seed versions are stripped: they are computed now.
const existingItems = read("items.json")
  .filter((i) => !i._generated)
  .map(({ priorityScore, priorityReasons, blockerDetectedByAI, blockerDetectedDate, ...rest }) => rest);
const craftedIds = new Set(existingItems.map((i) => i.id));
const existingUpdates = read("updates.json")
  .filter((u) => craftedIds.has(u.itemId))
  .map(({ blockerSignal, blockerSignalConfidence, blockerSignalKeywords, aiNote, ...rest }) => rest);
const sprints = read("sprints.json");

// --- two more sprints for history + backlog (keeps s1 completed, s2 active) -
function ensureSprint(s) {
  if (!sprints.find((x) => x.id === s.id)) sprints.push(s);
}
ensureSprint({
  id: "s0", name: "Sprint 0", goal: "Project setup, discovery and environment provisioning",
  startDate: "2026-09-03", endDate: "2026-09-12", status: "completed",
  velocityGoal: 6, velocityActual: 5, client: "Apex Financial Services",
  project: "Client Portal Modernization", metrics: { note: "Pre-baseline setup sprint" },
});
ensureSprint({
  id: "s3", name: "Sprint 3", goal: "Refunds, saved payment methods, and reporting exports",
  startDate: "2026-10-15", endDate: "2026-10-24", status: "planned",
  velocityGoal: 10, velocityActual: null, client: "Apex Financial Services",
  project: "Client Portal Modernization", metrics: { note: "Planned — backlog being readied" },
});
// keep sprint order chronological
sprints.sort((a, b) => a.startDate.localeCompare(b.startDate));

// --- content vocabulary (realistic titles, not lorem) ----------------------
const AREAS = [
  "Payments", "Dashboard", "Notifications", "Reporting", "User profile", "Admin console",
  "Search", "Auth / SSO", "Audit log", "Onboarding", "PDF export", "API gateway",
  "Settings", "Billing", "Data retention", "Performance", "Accessibility", "Localization",
  "Statements", "Transaction history", "Role management", "Session handling",
];
const REQ = ["Build the {a} module", "Implement {a} UI", "Add {a} to the client portal", "Redesign the {a} screen", "Integrate {a} with the back end"];
const ACT = ["Send {a} credentials to the client", "Schedule {a} walkthrough with Apex", "Update {a} documentation", "Confirm {a} acceptance criteria", "Provision {a} environment"];
const DEC = ["Confirm {a} approach with the client", "Agree {a} scope for this release", "Sign off {a} design"];
const RSK = ["{a} load under peak traffic", "{a} third-party rate limits", "{a} data migration risk", "{a} dependency on an external team"];
const fill = (t, a) => t.replace("{a}", a);

// per-type running code numbers, continuing past the crafted ids
const counters = { requirement: 6, action: 4, decision: 3, risk: 3 };
const prefix = { requirement: "req", action: "act", decision: "dec", risk: "rsk" };
function nextId(type) {
  const n = counters[type]++;
  return `${prefix[type]}-${String(n).padStart(3, "0")}`;
}


function makeItem(sprint, forcedStatus) {
  const type = (() => {
    const x = rnd();
    if (x < 0.5) return "requirement";
    if (x < 0.72) return "action";
    if (x < 0.86) return "risk";
    return "decision";
  })();
  const area = pick(AREAS);
  const tmpl = { requirement: REQ, action: ACT, decision: DEC, risk: RSK }[type];
  const id = nextId(type);
  const owner = pick(members);
  const priority = pick(["high", "medium", "medium", "low"]);
  const clientImpact = chance(type === "decision" ? 0.7 : 0.25);

  let status = forcedStatus;
  if (!status) {
    if (sprint.status === "completed") status = type === "decision" ? "confirmed" : type === "risk" ? "resolved" : chance(0.12) ? "spillover" : "done";
    else if (sprint.status === "planned") status = "todo";
    else status = pick(["in_progress", "in_progress", "done", "todo", "monitoring"]);
  }
  chance(0.22); // retired draw, kept so the seeded sequence (and the dataset) stays stable

  // due date within the sprint window
  const start = new Date(sprint.startDate).getTime();
  const end = new Date(sprint.endDate).getTime();
  const due = new Date(start + rnd() * (end - start)).toISOString().slice(0, 10);

  return {
    id, sprintId: sprint.id, type,
    title: fill(pick(tmpl), area),
    description: `${fill(pick(tmpl), area)} for the Apex client portal.`,
    owner, dueDate: due, priority, status,
    blocker: null, dependsOn: [], clientImpact,
    spillover: status === "spillover",
    clarityScore: type === "requirement" ? pick([null, 5, 6, 7, 8, 4]) : null,
    _generated: true,
  };
}

// --- target counts per sprint (crafted items already present are kept) ------
const have = (sid) => existingItems.filter((i) => i.sprintId === sid).length;
const TARGET = { s0: 22, s1: 22, s2: 30, s3: 26 };

const generated = [];
const updates = [];
for (const sprint of sprints) {
  const need = (TARGET[sprint.id] || 0) - have(sprint.id);
  for (let k = 0; k < need; k++) {
    const it = makeItem(sprint);
    generated.push(it);

    // give active in-flight items a few updates (so the agent has signal)
    if (sprint.status === "active" && ["in_progress", "spillover", "blocked"].includes(it.status)) {
      const fresh = chance(0.7); // most are current; some go stale for the agent to flag
      const lastDay = fresh ? pick([7, 8]) : pick([3, 4, 5]);
      for (let d = 1; d <= lastDay; d += pick([1, 2])) {
        updates.push({
          id: `upd-${it.id}-d${d}`, itemId: it.id, sprintId: sprint.id, author: it.owner,
          date: new Date(new Date(sprint.startDate).getTime() + (d - 1) * 86400000).toISOString().slice(0, 10),
          sprintDay: d, statusRaw: it.status, statusStructured: it.status,
          progressText: `Progress on ${it.title.toLowerCase()} — day ${d}.`,
          nextAction: d >= lastDay ? `Continue ${it.title.toLowerCase()}.` : null,
          blockerText: null, aiStructured: true, submittedOnTime: fresh,
        });
      }
    }
  }
}

// Explicit cross-item dependencies on generated rows (the generator can't infer
// them from titles). The Billing screen can't ship until the Payment gateway does,
// which is what makes the "cannot deliver" roll-up real rather than asserted.
const LINKS = { "req-027": ["req-001"] };
for (const it of generated) if (LINKS[it.id]) it.dependsOn = LINKS[it.id];

write("sprints.json", sprints);
write("items.json", [...existingItems, ...generated]);
write("updates.json", [...existingUpdates, ...updates]);

const all = [...existingItems, ...generated];
console.log(`items: ${all.length} total (${generated.length} generated, ${existingItems.length} crafted)`);
for (const s of sprints) console.log(`  ${s.id} (${s.status}): ${all.filter((i) => i.sprintId === s.id).length}`);
console.log(`updates: ${existingUpdates.length + updates.length} total (${updates.length} generated)`);
