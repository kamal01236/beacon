# Beacon — Deployment & Agent Runtime

Two separable concerns:
1. **The dashboard UI** — a web app; can be static or server-rendered.
2. **The agent** — a long-running/triggered background process with memory.

GitHub Pages can serve (1). It can **not** run (2). This document covers both and
defines scope + next steps.

---

## A. Deploying the UI

One codebase, two build targets (`scripts/build.mjs`, `next.config.mjs`), so the
choice is an env var rather than a branch.

### Option 1 — GitHub Pages (static UI only) — **live**
`BUILD_TARGET=pages` produces a static export: `output: 'export'`, `basePath: '/beacon'`,
`generateStaticParams()` on `/item/[id]` and `/people/[memberId]`, client-side
`useSearchParams` filtering on the board and insights. The build **hides `app/api`**
for the duration of the export, because a static export cannot contain route
handlers — so there is no backend there: no schedule, no triggered run, no
write-back, and decisions stay in the viewer's own browser.

Pushes to `main` deploy it via `.github/workflows/deploy.yml`. Live at
`https://kamal01236.github.io/beacon/`.

Use when you want a **free, shareable demo** and accept that the agent is
illustrative. It is also the safest thing to present: it makes no network calls.

### Option 2 — WSL / container / Vercel (full app + agent) — **built**
The default build keeps `app/api` and serves the real backend. `npm run local`
brings up the whole stack (database or `.data/`, build, server, worker) on a free
port; see [BACKEND-PLAN.md](BACKEND-PLAN.md) §7 for the WSL walkthrough. A Node
container or Vercel runs the same thing — on Vercel the worker's clock becomes
Vercel Cron hitting `POST /api/agent/run`, which is all `agent/run.mjs` does.

### Option 3 — Enterprise host (Azure, Render, Fly)
The same container inside the client's cloud / VNet with SSO and a managed
Postgres. Same app, same agent, their infra.

**Recommendation:** Pages for the public link, and a server build (WSL locally, a
container or Vercel hosted) for anything that must actually *run the agent*. They
coexist: Pages shows the UI, the server runtime hosts the agent.

---

## B. The long-running agent runtime

The agent is not a page load — it is a process that runs, remembers, and asks.

### Triggers (all three)
- **Scheduled** — cron every N minutes (Vercel Cron, **GitHub Actions `schedule:`**, or Azure Timer). A full sweep.
- **Event** — webhook receiver (HTTP endpoint) for Jira/ADO item changes and git push/PR; runs a focused re-analysis of the affected items.
- **User action** — the UI calls `POST /api/agent/run` (or `/answer`) when a member submits an update or answers a question, so the agent reacts immediately.

On GitHub specifically, a repo-centric single team can run the agent **as a GitHub
Actions workflow**: `on: schedule` (cron) + `on: issues/push` (events) +
`workflow_dispatch` (manual/user), the job runs `node agent/run.mjs`, and state is
committed to a branch or pushed to the datastore.

### Memory & context — where it's preserved
The agent must load prior context, do incremental work, and persist new context.
For a **single common team** (multi-team is explicitly out of scope for now) it
keeps one "team brain":

| Store | Holds | Tech (prototype → enterprise) |
|---|---|---|
| **State store** | runs, signals, input-requests + answers, per-item/per-sprint status | JSON/SQLite → Postgres |
| **Rolling memory** | per-sprint summaries, how items were resolved, who helped, recurring blockers | rows in the state store + a compacted "sprint digest" |
| **Semantic memory** | **codebase understanding**, knowledge base, team guidance, repo/TFS layout, item assignments | a **vector store** (embeddings) → pgvector / a managed vector DB |
| **Connector cache** | last-seen Jira/ADO + git snapshots (for delta detection) | key-value store |

Everything is keyed by `teamId` (one team today; the key makes multi-team a later
flip, not a rewrite).

### Continuity — start to end
Each run: **load** last run's state + open requests + sprint digest + relevant
vectors → **diff** against the current tracker/git snapshot (only analyse what
changed) → **assess** → **update** memory (append signals, close answered requests,
refresh the digest) → **persist**. Because state is durable and keyed, the agent
continues exactly where it left off across runs, sprints and restarts.

### Context aggregation
Per run the agent rolls item-level findings up to a **sprint summary** and a
**team summary**, and compacts older detail into the sprint digest so memory stays
bounded (it doesn't reprocess all history every run — it reads the digest + deltas).

### Human-in-the-loop (persisted)
Open input-requests live in the state store. The UI renders them and collects
answers; an answer is written back, appended to the item's context, and the request
is closed — or, if still unanswered, **re-asked on the next run** and escalated.
The agent keeps asking until it has what it needs to proceed.

### Enterprise-grade concerns
Read-only, least-privilege connector scopes; per-team data isolation; an **audit
log** of every agent action and every human approval; SSO for the UI; the tracker
stays system-of-record (writes only via approved preview); and **no individual
performance scoring**, by design.

**Data policy** is the part that constrains this runtime, so it is stated in code
([lib/policy.ts](lib/policy.ts)) rather than as a promise. Because the event log
*is* the audit trail, it is append-only: **retention** ages events out on a
schedule (`POST /api/data/retention`, clocked by `scripts/retain.mjs` exactly as
`agent/run.mjs` clocks runs — a cron entry or Vercel Cron in a hosted deploy) and
records what it removed; **access** is a per-subject export; **erasure**
pseudonymises the actor instead of deleting the decision, which needs the phase-4
sign-in to know who is asking. Emptying the log is an operator reset, not a
privacy control, and it appends a row saying so.

---

## C. Scope

**In scope (next build):** one team; read-only connectors (Jira/ADO, git, KB);
a state store; scheduled + user-action triggers; memory (state + sprint digest +
a vector index of repo/KB); persisted human-in-the-loop requests; human-approved
write-back.

**Out of scope (later):** multiple teams / portfolio aggregation; autonomous writes
without approval; predictive completion dates; the native Teams/Slack channel.

---

## D. Where this stands

This document is the **runtime design**. What is built against it, and what is not,
is tracked in exactly two places — so nothing here restates a status that can drift:

- **The phased plan:** README → Roadmap.
- **Backend status, file by file, with how each piece was verified:**
  [BACKEND-PLAN.md](BACKEND-PLAN.md) §8.

In short: the state store, the `/api` surface, the scheduled + manual triggers and
the persisted human-in-the-loop requests of §B are built (Postgres or `.data/`);
the **semantic memory** row (embeddings / pgvector) and the **connector cache** are
not, and neither are the real Jira/ADO connectors or the webhook receiver — those
are the phase-4 items in AGENT-ARCHITECTURE.md §10.
