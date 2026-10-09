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
- **Decisions are stored in the browser** (localStorage) in the prototype. Each
  viewer has their own session; *Agent → Your data → Clear all* resets it.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
```

Node 18+. Runs as-is on **WSL**. Regenerate the dataset (idempotent, keeps the
hand-written demo items): `node scripts/generate-seed.mjs`.

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

### 6. Privacy by design
Reads work-item updates only (never chat, mail or calendars) · author-first prompts ·
no individual scoring or leaderboard · adoption counted per team and per signal type,
never per person · member drill-downs and personal trends are hidden from the manager
role · *Your data* panel to export or delete everything stored.

### 7. Adoption (`Insights → Adoption`)
Signals raised / accepted / dismissed, accept rate per signal type (below 60% flags a
rule to retune), dismiss reasons, approved vs rejected changes, questions answered,
helpful votes on summaries, retro actions adopted. These figures feed confidence.

### 8. Visuals — honest by construction (`components/charts.tsx`, `lib/metrics.ts`)
Clickable status donut, burndown (ideal + real endpoints; future days not drawn),
velocity, impact deltas (each labelled *computed* or *recorded by the team*), progress
rings and a team-level pulse (streak, badge wall, kudos — no leaderboard).

## Code map

```
app/            one folder per screen; all render inside components/AppShell.tsx
  overview/ agent/ board/ item/[id]/ delivery/ people/ people/[memberId]/
  insights/ retro/ inbox/ manager/ my-work/ get-help/ trends/
components/     AppShell, Nav, PersonaSwitcher, RoleProvider, ui, charts,
                hic (human-in-control controls), privacy
lib/            data (seed + World), demo (frozen clock), facts, priorityScore,
                detect, agent, insights (brief, roll-up, root cause, retro, adoption),
                metrics (charts), events (decision log), world (seed + events),
                useWorld (React hooks), nav, types
data/           seed JSON + kb.json
scripts/        generate-seed.mjs
```

**Roles** (switch from the persona menu): **Facilitator** (Sarah) — Overview · Agent ·
Board · Inbox · Delivery · People · Insights · Retro. **Manager** (Dana, read-only) —
Overview · Agent · Delivery · Insights. **Member** (Marcus) — My work · Board · Get help ·
My trends.

## Roadmap — phase by phase

| Phase | Scope | Status |
|---|---|---|
| **1. Honest engine** | Computed score (14 rules), computed + calibrated confidence, language detector, computed brief / roll-up / root cause / retro / impact; seed reduced to raw facts | **Done** |
| **2. Human in control, end to end** | Decision log; accept / dismiss / snooze; previewed + approved changes and outbox; author-first prompts; member updates; undo; read-only manager; adoption metrics; privacy panel | **Done** (browser store) |
| **3. Live agent on WSL** | Server-side store (SQLite → Postgres) replaces localStorage so the team shares one record; run / answer API; real clock + scheduler; daily snapshots → real burndown, cumulative flow, cycle time; LLM detection behind the same `Detection` shape, judged against the accept/dismiss record; extraction from newly pasted meeting notes; team-tunable rule weights | Next |
| **4. Pilot with one team** | Jira / ADO read sync and approved write-back (AGENT-ARCHITECTURE.md §10); SSO + roles enforced on the server; Teams / Slack bot for questions and updates; a measured first-week baseline; consent statement and retention policy | Planned |
| **5. Enterprise** | Many teams, programme roll-up and cross-team dependencies; audit export; data residency; admin configuration; accessibility review | Planned |

Presenting the prototype: [DEMO-SCRIPT.md](DEMO-SCRIPT.md). Pitch and requirement
mapping: [PROPOSAL.md](PROPOSAL.md). Agent design: [AGENT-ARCHITECTURE.md](AGENT-ARCHITECTURE.md).
