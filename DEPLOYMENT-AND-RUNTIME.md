# Beacon — Deployment & Agent Runtime

Two separable concerns:
1. **The dashboard UI** — a web app; can be static or server-rendered.
2. **The agent** — a long-running/triggered background process with memory.

GitHub Pages can serve (1). It can **not** run (2). This document covers both and
defines scope + next steps.

---

## A. Deploying the UI

### Option 1 — GitHub Pages (static UI only)
Pages serves static files from a repo. **Possible, with changes**; the agent on
Pages is "frozen" (data baked at build time — no live schedule, no user-triggered
run, no write-back).

Changes required to the current Next.js app:
- `next.config.mjs`: `output: 'export'`, `basePath: '/beacon'`, `images: { unoptimized: true }`, `trailingSlash: true`.
- `generateStaticParams()` on the dynamic routes `/item/[id]` and `/people/[memberId]` (we have fixed seed ids, so this is trivial).
- Move request-time `searchParams` filtering (board, insights) to the **client**
  (`useSearchParams`) — a static export has no server at request time.
- Replace the `/` `redirect()` with a client redirect, add `public/.nojekyll`.
- A GitHub Actions workflow that builds, exports to `out/`, and deploys with
  `actions/deploy-pages`. Repo → Settings → Pages → Source = "GitHub Actions".
- Live at `https://kamal01236.github.io/beacon/`.

Use when: you want a **free, shareable, read-only demo** of the UI and accept that
the agent is illustrative.

### Option 2 — Vercel (recommended — full app + agent)
Zero-config for Next.js. Gives SSR + **serverless functions** (for the agent's
API routes and webhook receivers) + **Vercel Cron** (the schedule). One import of
the GitHub repo. This is the only option that runs the real app *and* the agent in
one place. Live at `https://beacon-<id>.vercel.app`.

### Option 3 — Container / enterprise host (Azure, Render, Fly)
A Node container (or Azure Functions + a managed DB) when the client needs it
inside their own cloud / VNet with SSO. Same app, same agent, their infra.

**Recommendation:** GitHub Pages for a quick public UI link **if needed**; Vercel
(or a container) for anything that must actually *run the agent*. They can coexist:
Pages shows the UI, a Vercel/Actions runtime hosts the agent API the UI calls.

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
log** of every agent action and every human approval; data retention controls;
SSO for the UI; the tracker stays system-of-record (writes only via approved
preview); and **no individual performance scoring**, by design.

---

## C. Scope

**In scope (next build):** one team; read-only connectors (Jira/ADO, git, KB);
a state store; scheduled + user-action triggers; memory (state + sprint digest +
a vector index of repo/KB); persisted human-in-the-loop requests; human-approved
write-back.

**Out of scope (later):** multiple teams / portfolio aggregation; autonomous writes
without approval; predictive completion dates; the native Teams/Slack channel.

---

## D. Next steps (phased)

- **Phase A — Deploy the demo.** Pick Pages (static UI) and/or Vercel (full app).
  If Pages: apply the Option-1 changes + Actions workflow. If Vercel: import the repo.
- **Phase B — Agent state store + API.** Add `app/api/agent/run` and `/answer`
  routes; introduce a state store (start with SQLite/JSON, interface it so it swaps
  to Postgres); have the UI read runs/signals/requests from the store instead of
  recomputing in `lib/agent.ts`.
- **Phase C — Triggers.** Wire the scheduler (Vercel Cron or GitHub Actions cron),
  a webhook receiver, and the user-action endpoint.
- **Phase D — Memory.** Sprint digests + a vector index of the repo and KB;
  retrieval-grounded suggestions ("resolved like this in Sprint 2").
- **Phase E — Connectors + write-back.** Real Jira/ADO + git + KB adapters behind
  a `ticketSource`-style interface (see AGENT-ARCHITECTURE.md §10); approved write-back.

The current `lib/agent.ts` already defines the shapes (runs, signals, requests) and
derives them from data — Phase B is "persist these and serve them over an API"
rather than a redesign.
