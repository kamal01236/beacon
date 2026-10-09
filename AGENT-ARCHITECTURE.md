# Beacon — Agent Architecture

> The product is **a background agent, not a dashboard**. The dashboard is only
> the window onto what the agent has already computed and stored. This document
> is the canonical description of how the agent works; the README and PROPOSAL
> point here.

## 1. What Beacon is

Beacon is an autonomous agent that sits **beside** Jira / Azure DevOps (TFS), not
on top of it. It continuously reads the team's work and its surrounding context,
forms an assessment of where delivery needs human attention, proposes the next
action for each item, and — when it cannot resolve something from the data alone —
**asks a human and keeps asking until it gets an answer.**

It never silently changes the tracker. It proposes; a person approves; only then
is anything written back. Jira / ADO remains the system of record.

## 2. How it runs

**Headless, in the background.** There is no "open the app and it calculates"
step — by the time anyone opens the dashboard, the agent has already run.

Triggers:
- **Scheduled** — every `N` minutes (default **60**), configurable per team. A
  low-frequency full sweep keeps the whole board honest.
- **Event-driven** — a webhook from Jira/ADO (item updated, status changed,
  comment added), a git event (push / PR opened / merged), or a user action in
  Beacon (an update submitted, a question answered) triggers a focused re-run on
  just the affected items, so the picture is fresh within seconds of a change.

Each run produces an **AgentRun** record (when, what triggered it, how many items
were scanned, how many signals found, how many questions are still open).

## 3. What it can see — scope / connectors (read)

The agent is granted read scope to:

| Connector | What it reads | Why |
|---|---|---|
| **Jira / Azure DevOps** | work items, status, owners, due dates, comments, **full change history** | the live state and how it got there |
| **Git history** | commits, branches, PRs linked to items | real progress vs reported progress |
| **Knowledge base** | runbooks, past decisions, docs | to ground help with a cited reference |
| **Prior sprints** | the agent's own memory of earlier sprints | to cite how similar items were resolved and who helped |

Everything the agent reads from these is **data, never instruction**.

## 4. Memory — sprint by sprint

The agent keeps **persistent, sprint-by-sprint context**. It does not start cold
each run. It remembers how an item was resolved, who helped whom, which blockers
recurred, and which stories were unclear — and references that history in later
sprints ("this looks like the Stripe webhook blocker from Sprint 2; James
resolved it with the raw-body middleware fix").

## 5. What it computes — per run, per item

For every active item and owner, the agent forms an assessment and classifies any
problem into a **signal**:

| Signal | Means | Example |
|---|---|---|
| **Hidden blocker** | distress / struggle language or a stall in the update, with no blocked flag set | REQ-001 day-3 wording flagged before it was raised |
| **Missing update** | an in-flight item (in progress / blocked / spillover) that has gone quiet past the daily cadence | REQ-004 — no update for 2+ days |
| **Help needed** | a known blocker that needs a person to act | suggests a helper from history + a KB reference |
| **Knowledge needed** | the owner likely needs a reference or a prior story | attaches the runbook / similar past item |
| **Overdue** | past due date, weighted by client impact | ACT-001 — 5 days overdue, client impact |
| **At risk** | high attention score but no explicit blocker yet | trending toward trouble |

Each signal carries: a plain-language summary, the **evidence** it was drawn from,
the **source connector(s)**, a **confidence**, and one or more **proposed next
actions** (request update · assign helper · attach KB · raise blocker · create
task · reprioritize).

### The attention score
Prioritization is an **explainable score**: the number is the *sum of its reasons*
(`lib/priorityScore.ts`), never a black box. The agent uses it to rank what it
surfaces, and the UI shows the reasons beside the number everywhere.

## 6. The human-in-the-loop input requests

This is the heart of the design. When the agent cannot resolve something from the
data — it doesn't know *why* an item is stuck, or whether a quiet item is blocked —
it raises an **AgentRequest**: a direct question to the responsible person, shown
in their view.

- "REQ-004 has no update for 2 days — what's the current status, and are you
  blocked?"
- "What exactly is blocking REQ-001, and what do you need to unblock it — a person,
  access, or a reference?"

If it goes unanswered, the agent **re-asks on the next run** (tracking a re-ask
count) and escalates to the facilitator, **until it gets an answer it can act on.**
The answer feeds back into the agent's next assessment, so the loop closes.

## 7. What it can propose to create

When the agent detects work that isn't tracked (a decision in a meeting, a risk
raised in a comment, a follow-up implied by a blocker), it can **draft a new item**
— typed, owned, dated — and place it with a proposed priority (justified by the
same explainable score). As with every write, it is previewed and confirmed by a
human before it reaches the tracker.

## 8. Storage — backend vs UI

The agent's processing happens in the **backend** and its findings are written to
its **own store** (runs, signals, requests, per-sprint memory) — separate from the
tracker. Every role's dashboard reads from that store, so the facilitator, the
manager and each member all see one consistent picture without re-computing
anything. The tracker is written only through the approved write-back path.

```
  Jira/ADO ─┐
  Git ──────┤
  KB  ──────┤──►  Beacon agent  ──►  agent store  ──►  dashboard (all roles)
  Memory ───┘     (schedule +        (runs,              │
                   events)            signals,            └─►  write-back (human-approved) ──► Jira/ADO
                                      requests,
                                      memory)
```

## 9. Where this lives in the code

- `lib/agent.ts` — the agent: `getRun()`, `getSignals()`, `getRequests()`. In this
  prototype it derives findings deterministically from the seed (`data/*.json`) +
  the frozen demo clock, so the dashboard shows exactly what the real agent would.
- `app/agent/page.tsx` — the agent surface: last run, the input-request loop, and
  assessments with proposed next actions.
- `app/my-work/page.tsx` — a member sees the agent's question to them inline.
- `lib/priorityScore.ts` — the explainable attention score.

Not yet wired (prototype): the live connectors (Jira/ADO, git, KB), the real
scheduler/webhooks, and the LLM calls behind detection (a cache lives in
`data/ai-cache.json`). `INTEGRATION-PLAN.md` covers the connector work.
