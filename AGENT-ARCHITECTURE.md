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

| Signal | Means | Example (seed) |
|---|---|---|
| **Hidden blocker** | the latest update *reads* as blocked (phrase detector, `lib/detect.ts`) but no blocker is raised | a member writes "not sure how to proceed" on REQ-004 |
| **Blocked — needs help** | formally blocked; suggests a helper and a runbook | REQ-001 — wording read as blocked on day 3, raised day 6 |
| **Cannot deliver** | its own status looks fine, but something upstream is blocked | REQ-027 "in progress", waits on REQ-001 |
| **Overdue** | status says overdue | ACT-001 — 5 days, client impact |
| **Status out of date** | past due while the status still says in progress / to do / monitoring | ACT-002 — UAT booked on day 5, still "in progress" |
| **Missing update** | in-flight work quiet for 2+ days | REQ-004 — no update this sprint |
| **At risk** | high attention score with no single explanation above (a prediction) | — |

Each signal carries a plain-language summary, the **evidence** (quoted update text,
matched phrases, fields), its **source**, a **confidence**, and **proposals** —
previewed tracker changes (raise blocker · comment to pair a helper · link a runbook ·
mark "is blocked by" · ask for a new date).

**Confidence is computed.** Signals read straight from tracker fields are labelled
*fact*. Inferred ones show a percentage with its basis (detector baseline + match
strength, or baseline + independent warning drivers); after 3+ team decisions on that
signal type, the observed accept rate is blended in. Dismissals therefore lower the
confidence of the rule that keeps being wrong.

### The attention score
The score is the sum of 14 named rules over the item's facts (`lib/facts.ts` →
`lib/priorityScore.ts`), never stored, never typed in. The agent uses it to rank what it
surfaces, and the UI shows the reasons beside the number everywhere.

## 6. The human-in-the-loop input requests

This is the heart of the design. When the agent cannot resolve something from the
data, it raises an **AgentRequest**: a direct question to one person, shown in their view.

- **Update requests** — "REQ-004 has had no update for 7 days — what's the status, and
  are you blocked?" Answered by posting an update; re-asked at each daily run until then.
- **Author-first confirmation** — when an update *reads* as blocked, the agent asks only
  its author: "Are you blocked?" **Yes** approves the previewed change (status → Blocked
  with their words as the blocker note); **No** dismisses the concern. Nobody else is asked
  to act on someone's wording before the author has answered.

Every human response is an event in one append-only log (`lib/events.ts`): updates,
accept / dismiss (with reason) / snooze, approve / reject, retro adoptions, helpful votes,
and undo. The world the agent assesses next is the tracker data plus those events
(`lib/world.ts`), so the loop closes, and the same log produces the adoption metrics.

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

- `lib/facts.ts` — per-item facts (dates, cadence, blocker timeline, language, dependency graph).
- `lib/priorityScore.ts` — the 14-rule attention score.
- `lib/detect.ts` — the update-language detector and root-cause categories.
- `lib/agent.ts` — `getSignals()`, `getRequests()`, `getRun()`, `detections()`, helper and runbook matching, computed confidence.
- `lib/insights.ts` — daily brief, delivery roll-up, root causes, retro themes, adoption.
- `lib/events.ts`, `lib/world.ts`, `lib/useWorld.ts` — the decision log and seed + events → world.
- `components/hic.tsx` — signal cards, proposal approval, update form, requests, activity log, outbox.
- `app/agent/page.tsx` — the agent surface; `app/my-work/page.tsx` — a member answers the agent.

Not yet wired (prototype): live connectors (Jira/ADO, git), a server-side store, the
real scheduler/webhooks, and an LLM detector. The prototype stores decisions in the
browser and runs the agent on render. README → Roadmap phases 3–4; §10 below covers
the connector work.

## 10. Integration & write-back (Jira / Azure DevOps)

Beacon is a **companion**, not a replacement: Jira/ADO stay the system of record.
It syncs a **thin, selective slice** (the active sprint/board, not the whole
backlog) and writes back only on **explicit, previewed, AI-labelled user action**.

**Read.** Jira Cloud via `POST /rest/api/3/search` (JQL, scoped to open sprints);
ADO via WIQL (`/_apis/wit/wiql`) → batch `GET /_apis/wit/workitems`. Parent/child
hierarchy comes from Jira sub-tasks/Epic link and ADO hierarchy links; roll-up
health and the deliverability forecast are computed **in the hub**, not in Jira.

**Field mapping** (the heart of the adapter):

| Beacon | Jira | Azure DevOps |
|---|---|---|
| `title` | `summary` | `System.Title` |
| `status` | `status` (+ transition id) | `System.State` |
| `workPriority` | `priority` | `Microsoft.VSTS.Common.Priority` |
| `owner` | `assignee` | `System.AssignedTo` |
| `dueDate` | `duedate` | `…Scheduling.DueDate` |
| `description` | `description` (ADF) | `System.Description` (HTML) |
| blocker flag | "Flagged" / impediment / label | tag `Blocked` / Impediment link |
| parent/children | `parent` + sub-tasks / Epic link | Hierarchy-Forward/Reverse links |

Hub-only (never round-trips): attention score, `reasons[]`, AI summaries, assist
threads, clarity score, retro, analytics. Capacity/leave comes from a separate
`capacitySource` (Tempo / HR / calendar), never written back.

**Write-back** (all explicit, preview-diff first, stamped *"Added by Beacon •
AI-suggested • <user>"*): push the AI story rewrite into the description
(`PUT …/issue/{key}` ADF · ADO JSON-Patch on `System.Description`); append a
comment for clarity/blocker/daily/retro summaries; update status/priority/blocker
(Jira moves by **transition**, ADO by JSON-Patch); create items from meeting
extraction.

**Adapter seam** — the same screens work on JSON now and Jira/ADO later with no UI
rebuild:

```ts
interface TicketSource {
  getItems(query): Promise<Item[]>;  getItem(id): Promise<Item>;
  updateItem(id, patch): Promise<void>;     // status, priority, dueDate, owner
  setDescription(id, doc): Promise<void>;   // push AI rewrite
  addComment(id, body): Promise<void>;      // clarity / summary / blocker notes
  transition(id, toStatus): Promise<void>;  // Jira transition / ADO state
  setBlockerFlag(id, on, note?): Promise<void>;
  createItem(input): Promise<{ id, url }>;  // from meeting extraction
}
// JsonSource (now) · JiraSource · AdoSource (pilot)
interface KnowledgeSource { search(query): Promise<Passage[]>; }  // blocker assist
```

**Auth / sync / safety.** OAuth 2.0 (3LO / Connect-Forge) or API token/PAT scoped
least-privilege (read + write items + comments). Initial pull scoped to the active
sprint; stay fresh via webhooks/service hooks + a poll fallback, keyed by
`externalId` + `externalSystem`. Two-way fields re-fetch the remote value before
writing so nothing is silently overwritten; every write is audited
(`who/what/when/before→after`) and reversible. Rollout: **prototype** JsonSource +
`/data` → **pilot** one real adapter (read + comment/description/status write-back)
→ **production** both systems, webhooks, audit store, SSO.
