# Beacon

An AI companion layer over Jira / Azure DevOps for agile delivery teams. Beacon
does not replace the tracker — it reads the same work and adds what the tracker
can't: it surfaces hidden blockers from update language, explains *why* each item
needs attention (an explainable score, never a black box), rolls delivery risk up
honestly, and keeps the human in the loop on every AI action.

The product flows now live **in code** (this Next.js app). The design canvas under
`design/` is the earlier source and is being retired.

## Architecture: a background agent (not just a dashboard)

Beacon is really an **autonomous agent** that runs headless beside the tracker.
It runs on a **schedule** (default every 60 min) and on **events** (Jira/ADO
webhooks, git events, user actions), reading Jira/Azure DevOps + git history + the
knowledge base with **sprint-by-sprint memory**. Each run it assesses every item,
classifies problems into signals (hidden blocker · missing update · help needed ·
overdue · at risk), proposes a prioritized next action, and — when it can't resolve
something from the data — **raises an input request to the responsible person and
re-asks each run until answered.** It never writes to the tracker on its own;
findings go to the agent's own store, the dashboard reads from there, and any
write-back is previewed and human-approved.

The full model is in **[AGENT-ARCHITECTURE.md](AGENT-ARCHITECTURE.md)**. In code:
`lib/agent.ts` (runs / signals / requests), `app/agent/page.tsx` (the agent surface),
`lib/priorityScore.ts` (the explainable score). In this prototype the agent derives
its findings deterministically from the seed data so the UI shows exactly what the
live agent would produce.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
```

Node 18+. Runs as-is on **WSL** — this is the recommended environment for the full
end-to-end app + agent. The demo clock is frozen at **Sprint 2, Day 8 of 10**
(`lib/demo.ts`).

## Data — predefined, no database

There are **~100 predefined work items** across four sprints (s0 completed → s3
planned) in `data/*.json`. There are **no connectors and no database**: the agent
and UI run entirely off this JSON, and the agent *derives* its findings
deterministically (frozen clock), so every load reproduces the same state. A
database is only needed once the live agent must remember across runs and store
human answers — see [DEPLOYMENT-AND-RUNTIME.md](DEPLOYMENT-AND-RUNTIME.md).

Regenerate / resize the dataset (idempotent; keeps the crafted demo items):

```bash
node scripts/generate-seed.mjs
```

## Deploy

- **GitHub Pages (static UI, live):** https://kamal01236.github.io/beacon/ — every
  push to `main` rebuilds and redeploys via `.github/workflows/deploy.yml`. This is
  the read-only dashboard; the agent is build-time static there.
- **WSL / Vercel / container (full app + live agent):** `npm run build && npm start`.
  The static-export settings only switch on under `BUILD_TARGET=pages`, so the
  server build is unaffected.

Full options and the agent runtime plan: [DEPLOYMENT-AND-RUNTIME.md](DEPLOYMENT-AND-RUNTIME.md).

## How it's built

Everything renders inside **one shared shell** — `components/AppShell.tsx` — so the
header (brand, sprint, search, persona switcher) is identical on every screen and
cannot drift. The persona switcher is the single way to move between the three
role views; the sidebar nav is generated per role from `lib/nav.ts`. At ≤860px the
sidebar becomes a fixed bottom bar (one responsive rule in `app/globals.css`), so
there are no separate mobile pages.

```
app/
  layout.tsx            RoleProvider + AppShell wrap every page
  globals.css           the whole design system (ported from design/beacon.css)
  overview/             facilitator landing — "cannot deliver" roll-up + attention
  agent/                the agent surface — last run, input-request loop, assessments
  board/                priority board — ranked by explainable score (?status=, ?min=, ?type=)
  people/               team status ; people/[memberId] = facilitator member drill-down
  item/[id]/            item detail — the AI hidden-blocker timeline
  inbox/ delivery/ insights/ retro/      facilitator tools
  manager/              manager view (team-level only, no individual scoring)
  my-work/ get-help/ trends/             member views
components/   AppShell, Nav, PersonaSwitcher, RoleProvider, ui (Avatar, ScoreReasons, AiBlock…)
lib/          types, data (seed loaders), demo (frozen clock), priorityScore, nav
data/         seed JSON (members, sprints, items, updates, meetings, stories, kudos, ai-cache)
```

### The attention score
`lib/priorityScore.ts` defines the score as the **sum of its explainable reasons** —
the number can never disagree with the chips shown beside it. Seed scores were
reconciled to this invariant (Phase 0).

## Roles
- **Facilitator** (Sarah) — Overview · Agent · Board · Inbox · Delivery · People · Insights · Retro
- **Manager** (Dana, read-only) — Overview · Agent · Delivery · People · Insights
- **Member** (Marcus) — My work · Board · Get help · My trends (the agent reaches members through input-request banners)

Switch between them from the persona menu in the header.
