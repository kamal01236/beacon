# Beacon

An AI companion layer over Jira / Azure DevOps for agile delivery teams. Beacon
does not replace the tracker — it reads the same work and adds what the tracker
can't: it surfaces hidden blockers from update language, explains *why* each item
needs attention (a computed, rule-based score — never a black box), rolls delivery
risk up honestly, and keeps a person in control of every action.

This README is the single source of truth for what is built and what comes next
(see **Roadmap**). The product flows live in code; there is no separate design canvas.

## What the prototype is

- **One team, predefined data.** ~100 work items across four sprints (`data/*.json`),
  frozen at **Sprint 2, Day 8 of 10** (`lib/demo.ts`). No Jira/ADO/mail connection,
  no login — those are planned (Roadmap phases 3–4), not faked.
- **Everything else works end to end.** Scores, signals, confidence, the daily brief,
  the roll-up, root causes and retro themes are all *computed* from the data. People
  post updates, answer the agent, accept or dismiss findings, approve tracker changes
  and undo them — and every screen updates.
- **Decisions are stored in whichever backend is running.** With the server build
  (`npm run local`) they go to the shared server-side event log — Postgres if
  `DATABASE_URL` is set, otherwise `.data/` — so the team sees one record and the
  agent can read it. With the static export there is no backend, so they stay in
  that browser's localStorage. *Agent → Your data* states which is live, what is
  kept and for how long; emptying the shared log is a separate, facilitator-only
  **reset** that records itself in the log it emptied (`lib/policy.ts`).

## Run

Node 18+. Runs as-is on **WSL**. There are two ways to run it, and they differ only
in whether the backend is there.

```bash
npm install

# UI only — no /api, decisions in this browser. Fine for the screens.
npm run dev            # http://localhost:3000

# The whole stack: build + server (with /api) + the agent worker, on a free port.
npm run local          # Postgres if DATABASE_URL is set, else .data/
npm run local:nodb     # force the no-database path

npm run build          # production build (BUILD_TARGET=pages for the static export)
```

On Windows, use `npm run local` rather than `npm run dev` when you need `/api`: the
dev server's incremental compile has been seen to corrupt the webpack runtime for the
route handlers, while the production build it runs does not.

Other scripts: `npm run agent` / `agent:once` (the worker alone, against a running
server), `npm run data:retain` (dry run: what the retention policy would drop) and
`data:retain:apply`, `npm run db:seed` / `db:reset` (load `data/*.json` into Postgres),
`npm run check:secrets` (refuses to commit a key). Regenerate the dataset
(idempotent, keeps the hand-written demo items): `node scripts/generate-seed.mjs`.
Full backend setup, including the WSL walkthrough: [BACKEND-PLAN.md](BACKEND-PLAN.md) §7.

## Deploy

- **GitHub Pages (static, live):** https://kamal01236.github.io/beacon/ — every push to
  `main` rebuilds via `.github/workflows/deploy.yml`. The whole human-in-control loop
  works there too, because the prototype keeps decisions in the browser.
- **WSL / Vercel / container:** `npm run build && npm start`. Static-export settings
  only switch on under `BUILD_TARGET=pages`.

Runtime and hosting options for the live agent: [DEPLOYMENT-AND-RUNTIME.md](DEPLOYMENT-AND-RUNTIME.md).

## How it works

### 1. The seed holds raw facts only
Items (status, owner, due date, priority, dependencies, blocker text), the updates
people wrote, sprints, members, kudos, stories and a small knowledge base
(`data/kb.json`). **No score, signal or confidence is stored** — exactly as with a
live tracker feed.

### 2. Facts → score (`lib/facts.ts`, `lib/priorityScore.ts`)
`factsFor(item)` derives dates, cadence, blocker timeline, update language and the
dependency graph once. The **attention score** is the sum of **14 named rules**
(priority, blocked + blocked days, blocker language not raised, past due, due soon,
blocks other work, blocked upstream, client impact, spillover, gone quiet, no owner,
owner stretched, unmitigated risk, unclear story). Every point traces to a rule; the
board's *How scoring works* panel lists them. 65+ = needs attention.

### 3. Update language (`lib/detect.ts`)
A transparent phrase detector: "struggling" +3, "not sure how to proceed" +3,
"waiting on others" +2 … minus relief phrases ("fix in hand" −2). Score ≥ 4 reads as
blocked. It finds REQ-001's day-3 struggle (raised formally on day 6) and ACT-001's
"still waiting on infra… escalated" (never raised; it went overdue). The same module
classifies root causes (external dependency, technical gap, unclear requirements,
capacity).

### 4. The agent (`lib/agent.ts`)
Each run turns facts into **signals** (hidden blocker · blocked · cannot deliver ·
overdue · status out of date · missing update · at risk), **requests** (questions to
one person) and **proposals** (tracker changes). It also suggests a helper (the
matching runbook's author, else a teammate with a blocker-busting record) and a
runbook (tag overlap with the item's text).

**Confidence is computed, never typed in.** Facts read straight from tracker fields
are labelled *fact*. Inferences (hidden blocker, at risk) show a percentage with its
basis — e.g. *detector baseline 40 + match strength 8 × 6 = 88%* — and once the team
has decided 3+ signals of that type, the score blends in the observed accept rate
(*team feedback: 2 of 4 accepted → 69%*).

### 5. Human in control (`lib/events.ts`, `lib/world.ts`, `components/hic.tsx`)
| Principle | How it works in the app |
|---|---|
| The agent proposes, people decide | Every signal: **Accept**, **Dismiss** (with a reason) or **Snooze** |
| Nothing reaches the tracker unapproved | Proposed changes show an exact preview; **Approve** puts them in the **tracker outbox** (simulated in the prototype) |
| Ask the author first | When an update reads as blocked, only its author is asked *"Are you blocked?"* — **Yes** raises it, **No** drops it |
| People own their updates | Members post updates (with a live language check as they type); only the owner posts on an item |
| Every decision is reversible and visible | One append-only event log; **Activity log** with **undo** on every entry |
| Read-only where it should be | The manager view can see decisions but not make them |

The world every screen renders is *seed + events*: only a person's own update or an
**approved** proposal changes an item.

### 6. Privacy and the data policy (`lib/policy.ts`)
Reads work-item updates only (never chat, mail or calendars) · author-first prompts ·
no individual scoring or leaderboard · adoption counted per team and per signal type,
never per person · member drill-downs and personal trends are hidden from the manager role.

The decision log is **append-only** — it is the audit trail behind "every decision is
reversible and visible". So there is deliberately *no* "delete everything" button over a
shared log: one person could not be allowed to truncate everybody else's record. The four
things a data policy has to answer are answered separately, and the policy is stated once
in code so the UI copy, the endpoint and these docs cannot drift:

| Concern | How | Built |
|---|---|---|
| **Retention** | Events age out after `DECISION_RETENTION_DAYS` (180). Applied on a schedule — `POST /api/data/retention`, clocked by `npm run data:retain` — and the removal appends a `data.retained` event, so a gap in the log is never unexplained | **Yes** |
| **Access** | *Export my data* is scoped to the events the viewer is the subject of; exporting the whole team log is a separate facilitator action | **Yes** |
| **Erasure** | An erasure request **pseudonymises the actor** rather than deleting the decision: the audit trail survives, the identity does not. Needs sign-in to know who is asking | Phase 4 — stated, not claimed |
| **Preferences** | Theme, density and the rail never leave the viewer's browser and are never part of the team record | **Yes** |

Emptying the log is the one remaining destructive action, and it is framed as what it is:
a **demo-instance reset**, facilitator-only, confirmed, never offered an undo, and appended
to the log it just emptied.

### 7. Adoption (`Insights → Adoption`)
Signals raised / accepted / dismissed, accept rate per signal type (below 60% flags a
rule to retune), dismiss reasons, approved vs rejected changes, questions answered,
helpful votes on summaries, retro actions adopted. These figures feed confidence.

### 8. Visuals — honest by construction (`components/charts.tsx`, `lib/metrics.ts`)
Clickable status donut, burndown (ideal + real endpoints; future days not drawn),
velocity, impact deltas (each labelled *computed* or *recorded by the team*), progress
rings and a team-level pulse (streak, badge wall, kudos — no leaderboard).

### 9. The interface (`app/globals.css`, `components/`)
One stylesheet is the whole design system — screens compose its classes and
never define their own colours or shell, so a change lands everywhere at once.

| What | How it works |
|---|---|
| **Light and dark** | Every colour is a token, defined three times (light, system-dark, chosen-dark) so the in-app toggle wins over the OS either way. An inline boot script paints the theme before first paint, so there is no flash. |
| **Density** | Comfortable or compact, turning five spacing/type tokens — for the person who lives on the board all day. |
| **Command palette** | **Ctrl/Cmd-K** or **/** from anywhere: work items (by code, title, status *or* owner), saved board views with live counts, people, screens and the appearance commands. It searches the live world, so an item just moved to Blocked reads as blocked. Empty, it ranks by attention score. Person drill-downs are omitted for the manager role, so the palette can't route around the privacy rule. |
| **Decisions confirm themselves** | Every decision recorded through `useActor().act()` raises a toast naming what was recorded, with **Undo** attached — the way back at the moment of doubt. The Activity log keeps the permanent one. |
| **Keyboard and assistive tech** | Skip link, one never-removed focus ring, `aria-live` on decisions, arrow/Enter/Escape in the palette, Escape out of the persona menu. |
| **Scales** | Fluid type from a 13-inch laptop to a 4K display, content capped at 1520px, a collapsible nav rail, 44px touch targets on touch pointers, and `prefers-reduced-motion`, `prefers-contrast` and print all honoured. |

Theme, density and the rail are per-viewer conveniences in this browser
(`lib/prefs.ts`). They never reach the event log, never change a finding, and
travel with *Export my data*.

## Code map

```
app/            one folder per screen; all render inside components/AppShell.tsx
  overview/ agent/ board/ item/[id]/ delivery/ people/ people/[memberId]/
  insights/ retro/ inbox/ manager/ my-work/ get-help/ trends/
  api/          server build only; hidden from the static export
    base/ world/ events/        the snapshot, the folded world, the decision log
                                (events also answers DELETE — the instance reset)
    agent/run/                  POST triggers a run · GET lists recorded runs
    agent/analyze/ compose/     re-read an edited draft · draft one comment
    data/retention/             GET what the policy would drop · POST apply it
    jira/search/                the faked Jira REST payload Beacon ingests
components/     AppShell, Nav, PersonaSwitcher, RoleProvider, ui, charts,
                hic (human-in-control controls), privacy, AgentRun ("Run now"),
                CommandPalette, Toaster, ThemeControls
lib/            data (seed + World), demo (frozen clock), facts, priorityScore,
                detect, agent, insights (brief, roll-up, root cause, retro, adoption),
                metrics (charts), events (decision log), world (seed + events),
                useWorld (React hooks), prefs (theme/density), toast, nav, types,
                config (env → AgentConfig), policy (retention / access / erasure,
                stated once), analyze + compose (client API helpers)
  lib/server/   SERVER ONLY: store (Postgres or .data/), db, fileStore, jira, agent
                (the run: LLM → detection override → the same brain)
  lib/llm/      one LlmProvider seam, two implementations (openai, ollama),
                prompt, normalize (recomputes score from weights — never trusts
                the model's own arithmetic), types
agent/          run.mjs — the worker: just the clock, calls POST /api/agent/run
db/             schema.sql (items, updates, events, agent_runs, knowledge_base)
data/           seed JSON + kb.json
scripts/        build (two targets), local (one-command stack), seed-db,
                retain (the retention sweep's clock), check-secrets, generate-seed
```

**Roles** (switch from the persona menu): **Facilitator** (Sarah) — Overview · Agent ·
Board · Inbox · Delivery · People · Insights · Retro. **Manager** (Dana, read-only) —
Overview · Agent · Delivery · Insights. **Member** (Marcus) — My work · Board · Get help ·
My trends.

## Roadmap — phase by phase

| Phase | Scope | Status |
|---|---|---|
| **1. Honest engine** | Computed score (14 rules), computed + calibrated confidence, language detector, computed brief / roll-up / root cause / retro / impact; seed reduced to raw facts | **Done** |
| **2. Human in control, end to end** | Decision log; accept / dismiss / snooze; previewed + approved changes and outbox; author-first prompts; member updates; undo (in the log and on every confirmation toast); read-only manager; adoption metrics; privacy panel; light/dark, density, command palette and a keyboard + screen-reader baseline | **Done** |
| **3. Live agent on WSL** | Server-side store (Postgres, or `.data/` with no database) replaces localStorage so the team shares one record; `/api` for the world, the event log and agent runs; the worker as a real clock with cadence and quiet hours; LLM detection behind the same `Detection` shape with a guaranteed fallback to the rules; agent-drafted comments behind the same approval gate; a stated data policy with a working retention sweep | **Done (core)** — see [BACKEND-PLAN.md](BACKEND-PLAN.md) §8. Remaining: daily snapshots for real burndown / cycle time, KB semantic match, extraction from newly pasted notes, team-tunable weights |
| **4. Pilot with one team** | Jira / ADO read sync and approved write-back (AGENT-ARCHITECTURE.md §10); SSO + roles enforced on the server, which is also what makes **erasure by pseudonymisation** answerable (`lib/policy.ts`); Teams / Slack bot for questions and updates; a measured first-week baseline; consent statement | Planned |
| **5. Enterprise** | Many teams, programme roll-up and cross-team dependencies; audit export; data residency; admin configuration; full WCAG 2.2 AA audit on top of the phase-2 baseline; tenant theming from the token layer | Planned |

Presenting the prototype: [DEMO-SCRIPT.md](DEMO-SCRIPT.md). Pitch and requirement
mapping: [PROPOSAL.md](PROPOSAL.md). Agent design: [AGENT-ARCHITECTURE.md](AGENT-ARCHITECTURE.md).
