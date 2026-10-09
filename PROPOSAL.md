# Beacon — Product Plan

> **This document is our implementation plan** — what we are building and why. It evolves.
> **The hackathon requirement is kept separate** in [HACKATHON-BRIEF.md](./HACKATHON-BRIEF.md) (the fixed reference). If our product diverges or grows beyond the hackathon, that brief stays clean so we can always trace back to the original ask.
> **Primary challenge area (our choice):** Agile Practices, with benefits across the other five.
> **Status:** Plan v2 (prototype planning). See also [PROPOSAL-REVIEW.md](./PROPOSAL-REVIEW.md), [UI-FLOWS.md](./UI-FLOWS.md).

---

## 1. Scope separation & traceability

To keep the two contexts clean (hackathon ask vs. our product), every capability sits in one of three buckets. The **Hackathon demo** column is what we build and show; the **Vision / beyond** column is our product direction that we mention on a slide but do not build for the demo.

| Hackathon requirement (see [HACKATHON-BRIEF.md](./HACKATHON-BRIEF.md)) | Our hackathon-demo implementation | Vision / beyond hackathon |
|---|---|---|
| **Meaningful problem** (§2) — lost client actions, hidden blockers, unclear stories, stand-up overhead | Meeting extraction, hidden-blocker detection, clarity checker, structured updates on realistic 2-sprint data | Org-wide rollout, cross-team portfolio view |
| **AI intervention** (§3.02) — AI improves a workflow/decision | 5 AI features, each human-confirmed, each with before/after | Auto-estimated completion dates, auto-retro narratives, predictive risk |
| **Working concept** (§3.03) — a prototype that proves the idea | Responsive web app (mobile-first), live or cached AI | Native Teams/Slack bot as the member channel |
| **Adoption path** (§3.04) — route to implementation + controls | **Companion layer** over Jira/TFS via `ticketSource` plug-in (no migration), governance controls, 2-sprint pilot | Live two-way Jira / Azure DevOps sync, knowledge-base connector (Confluence/SharePoint), SSO, audit store |
| **Agile Practices** (primary) — outcome-focused events & artefacts | Priority board, spillover & decision tracking, collaborative assist, recognition, metrics | Auto retro + **root-cause analytics** (who's blocked, on what, why), capacity planning |

**Rule:** a capability may only enter the demo scope (§4 "Must/Should") if it maps to a hackathon requirement above. Anything that serves only the product vision goes to the roadmap (§4 "Roadmap") or the Vision column — never the demo.

---

## 2. Our proposal: Beacon

### The problem

Day to day, delivery teams lose time and create client-facing delay because:

- Client discussions produce requirements, decisions and actions that are **not captured consistently**, or have **no clear owner**.
- Daily stand-ups become **status reporting**. Facilitators spend time chasing and consolidating updates.
- **Blockers are mentioned but not owned**, and are often noticed days late.
- User stories are **vague or incomplete**, which causes rework and delay.
- Remote team members feel **disconnected** and good work goes unrecognized.
- Delivery status and flow metrics exist but are **not turned into insight**.

### The idea

One platform with one data model, not six separate tools:

> **Client discussion -> items (requirement / decision / action / risk) -> owner -> daily update -> status -> clarity and recognition -> metrics**

**Pitch line:** *Nothing agreed with the client gets lost, every item has an owner and a daily pulse, and unclear requirements get fixed before they cause delay.*

### How it works — a background agent, not a dashboard

Beacon is delivered as an **autonomous agent** that runs headless beside Jira /
Azure DevOps (TFS) — the dashboard is only the window onto what the agent has
already computed. The agent:

- **Runs on a schedule** (default every 60 min) **and on events** (tracker
  webhooks, git events, a member submitting an update), so the picture is always
  current before anyone opens it.
- **Reads broadly, with memory:** the tracker + its full change history, **git
  history**, the **knowledge base**, and its own **sprint-by-sprint memory** of how
  past items were resolved and who helped.
- **Assesses every item** each run and classifies problems into signals — *hidden
  blocker, missing update, help needed, knowledge needed, overdue, at risk* — each
  with evidence, a cited source, a confidence, and a **proposed next action**,
  ranked by the explainable attention score.
- **Closes the loop with people:** when it can't resolve something from the data,
  it **asks the responsible person in the UI** ("REQ-004 has no update for 2 days —
  what's blocking you?") and **re-asks each run until answered**, escalating to the
  facilitator. The answer feeds the next assessment.
- **Proposes, never imposes:** findings are written to the agent's own store (which
  every role's view reads from); the tracker stays the system of record and any
  write-back is previewed and human-approved. The agent can also **draft new items**
  (typed, owned, dated, prioritized) for approval when it spots untracked work.

Full detail: **[AGENT-ARCHITECTURE.md](./AGENT-ARCHITECTURE.md)**. This reframes the
five AI features below as *capabilities of one agent* rather than separate tools.

### Positioning — a companion to Jira / Azure DevOps, not a replacement

Jira and TFS/Azure DevOps are where work is *recorded*. They are powerful but too heavy for a clean, day-to-day **organizational overview** — the state of the sprint, who's blocked, what's at risk, what was agreed. Beacon is a **thin companion layer on top** that provides exactly that overview and adds the AI value Jira/TFS don't.

| | Stays in Jira / TFS | Lives in / added by Beacon |
|---|---|---|
| **Source of record** | Tickets, boards, workflows, estimates | — (we don't duplicate the backlog) |
| **Sync** | Read the subset we need (items, owners, status, priority, due dates) | **Selective, two-way on a few fields** (status, our work-priority ↔ Jira priority, blocker flag). Not a full mirror. |
| **The overview** | — | One-glance sprint/org status, attention ranking, per-member view |
| **AI value** | — | Hidden-blocker detection, meeting extraction, clarity scoring, **knowledge-base blocker suggestions**, retro + root-cause analytics |
| **Collaboration** | Comments on a ticket | **Any teammate can post an update or offer help** on an item/action; threaded into one place |

**Why this matters for adoption:** teams keep their system of record. Beacon is additive — a lightweight overview + AI assist — so there's no migration and low switching cost. It also connects to the **project knowledge base** (past tickets, docs, runbooks) to ground its blocker suggestions, which a ticket tool cannot do.

### AI interventions

| # | Capability | What AI does | Human in the loop |
|---|---|---|---|
| 1 | **Discussion -> action items** | Extracts items from client meeting notes: type, title, owner, due date, priority, client-delay risk | User reviews and confirms before saving |
| 2 | **Daily update and blocker detection** | Turns free-text updates into structured fields (work item, progress, next action, blocker). Flags stale items and unowned blockers. Ranks by a transparent priority score | Facilitator confirms owners and escalations |
| 3 | **Requirement clarity checker** | Scores each story, lists what is missing (acceptance criteria, edge cases, dependencies), and suggests a rewrite | Developer edits, then applies to the item |
| 4 | **Recognition** | Points and badges calculated from real activity (completed items, on-time updates, clarity fixes, unblocking others) | Kudos can be given manually too |
| 5 | **Metrics and insight** | Before/after view of time saved, participation, blocker age and more | n/a |
| 6 | **Knowledge-base blocker assist** | For a blocked item, retrieves relevant material from the project knowledge base (past tickets, docs, runbooks) and suggests likely causes and next steps, **with citations** | Owner/helper accepts, adapts or dismisses |
| 7 | **Collaborative assist** | Any teammate can post an update or offer help on another person's item/action; AI threads it into that item's context so understanding gaps close fast | Visible to all; the owner stays accountable |
| 8 | **Retro & root-cause analytics** | At sprint end, AI produces "what went well / didn't / to improve" and analyses **who keeps getting blocked, on which items, and why** — patterns Jira doesn't surface | Facilitator edits before sharing |
| 9 | **Deliverability forecast & roll-up** | Predicts whether each item (and the sprint) will land, with reasons; rolls child state up so a **blocked task or open child bug flags the parent story as "cannot deliver"**, factoring in owner capacity & leave | Facilitator reviews the forecast |
| 10 | **Bug RCA drafting** | Drafts root-cause analysis for a bug/defect (summary · cause · fix · prevention) from its history + KB | Facilitator approves, then pushes to the Jira fields |
| 11 | **Cross-sprint insight (on request)** | Answers questions over this sprint **and past sprints**, correlates open **retro action items** across sprints, and gives consistent insight on demand | Advisory; human acts |

**Priority score (explainable):** blocker age + item priority + number of dependent items + proximity to due date or sprint end + whether an owner exists. Reasons are shown next to the score so users can trust and override it.

### Mapping to the hackathon criteria

| Criterion | How we meet it |
|---|---|
| 01 Meaningful problem | Lost client actions, hidden blockers, unclear requirements and stand-up overhead affect every Agile team |
| 02 AI intervention | Extraction, structuring, clarity scoring and prioritisation, with a clear before/after workflow |
| 03 Working concept | Live demo on realistic data: paste notes, see items, flagged blocker, clarity fix, points and metrics |
| 04 Adoption path | Uses existing tools via a plug-in integration layer, privacy-first, 2-sprint pilot with measured impact |

---

## 3. Success metrics

Every metric gets a **baseline** and a **target** so improvement is measurable. The values below are examples to be replaced with real baselines.

| Metric | What to measure | Example baseline -> target |
|---|---|---|
| Stand-up time saved | Time spent collecting and consolidating updates, before vs after | 25 min/day -> under 10 |
| Participation | % of team members submitting by the deadline | 70% -> 90% |
| Blocker visibility | Time from reporting a blocker to facilitator awareness | Next-day meeting -> under 15 min |
| Update quality | % of submissions that identify the relevant work item and next action | 50% -> 85% |
| Actionability | % of identified blockers with an owner or follow-up action | 40% -> 80% |
| Team experience | Short pulse survey on friction, usefulness and interruption (1-5) | Neutral -> 4+ |

**Additional metrics:**

- **Items with an owner:** % of client-discussion items with an owner and due date
- **Story readiness:** % of stories scoring "ready" after the clarity check
- **Blocker resolution time:** the real outcome, not just visibility
- **AI accuracy:** % of extracted items and links accepted without edits (builds trust, guards against hallucination)
- **Adoption signal:** % of pilot users who choose to keep using it

---

## 4. Scope

### Prototype (build for the demo)

| Priority | Feature |
|---|---|
| **Must** | Meeting notes -> extracted items (confirm before save) |
| **Must** | Priority board with daily updates, "Request update" and "Nudge", overdue indicators |
| **Must** | Spillover tracking: items carried from prior sprint flagged on the board |
| **Must** | Decision tracking: decisions extracted from meeting notes and displayed alongside actions and requirements |
| **Must** | Requirement clarity checker with suggested rewrite and "Apply to item" |
| **Must** | Two-layer priority: explainable **attention score** (computed) + **work priority** the facilitator can raise/lower per item, with pin/snooze and a logged reason (see §6) |
| **Must** | Item taxonomy: every item typed (Story, Task, Bug, Defect, Change Request, Spike, Doc, Risk, Decision, Action, Requirement) with its own context panel (discussion summary, importance, progress %, projected completion, health) |
| **Must** | Metrics strip with before/after cards |
| **Should** | Voice or keyboard update → AI drafts a finalized, structured response the developer approves before it is recorded |
| **Should** | Collaborative assist: any teammate can post an update or offer help on another person's item/action, threaded into the item |
| **Should** | Knowledge-base blocker assist: for a blocked item, retrieve related KB material and suggest likely causes + next steps with citations |
| **Should** | Recognition: points, badges, leaderboard and kudos feed (derived from existing data) |
| **Should** | Auto sprint review/retro + root-cause analytics: "what went well / didn't / to improve" and who-gets-blocked-on-what patterns, with auto charts |
| **Should** | Actionable charts: every chart element (status donut, velocity bar, burndown point, KPI tile) drills into the filtered items — analytics lead straight to action |
| **Should** | Write-back to Jira / Azure DevOps: push the AI story rewrite into the description, append clarity / blocker / daily-summary as a comment, and update status / priority / blocker — all preview-first and labelled AI-assisted (see [INTEGRATION-PLAN.md](./INTEGRATION-PLAN.md)) |
| **Should** | Item hierarchy & roll-up: show stories with their child tasks/bugs; a blocked child or open child bug flags the parent as "cannot deliver" and surfaces the bug for prioritisation |
| **Should** | Deliverability forecast: per-item and per-sprint "will it land?" with reasons, factoring estimate, remaining capacity, blockers and leaves |
| **Should** | Capacity & leave planning: team availability calendar; flag when a prioritised item's owner is on leave; feed next-sprint planning |
| **Should** | Bug RCA write-back: AI-drafted root cause pushed into the bug's Jira fields / description |
| **Should** | Cross-sprint analytics dashboard: correlate this sprint with prior sprints, track retro action items across sprints, on-demand AI insight |

### Roadmap (mention on a slide, do not build yet)

See **[DIFFERENTIATION.md](./DIFFERENTIATION.md)** for the full "why it's different" and the vision ladder. Headlines:

- Live two-way Jira / Azure DevOps integration + **independent mode** and **create-here → replicate-to-Jira** (see [INTEGRATION-PLAN.md](./INTEGRATION-PLAN.md))
- Teams / Slack bot with quick-reply buttons and push notifications
- **AI Scrum Master (proactive):** auto-draft items from meetings, propose owners/estimates, auto-nudge, keep the board prioritised, generate stand-up digest + retro — all human-approved
- **AI teammate & onboarding / KT assistant:** reads the project KB + KT recordings/docs, answers "how does X work here?" with citations, and generates a **team-specific onboarding plan** that ramps a new joiner with no extra hand-holding
- Dependency and handoff tracker (Open Innovation)
- Short team games or quiz rounds (Team Culture)
- Role-based dashboards and configuration console
- Team-level workload and pulse insights

---

## 5. User experience

**Who uses what**

| Layer | Users | Purpose |
|---|---|---|
| Conversational agent (Teams/Slack) | Team members | Where people act: receive requests, give updates, get nudges (roadmap) |
| Backend service | None directly | Orchestration, AI extraction, integrations, scheduling, rules, audit |
| Dashboard (web) | Facilitators, delivery managers, leads | Priority view, trends, metrics, configuration |

Team members should rarely need to open the dashboard; the agent comes to them.

**Facilitator-request flow**

1. Facilitator triggers a check-in (scheduled or on demand), optionally with a custom question.
2. Each member gets a private notification with quick replies (On track / At risk / Blocked) and a free-text box.
3. A gentle reminder goes out before the deadline. Non-responders are visible to the facilitator only.
4. AI structures the update, links it to the work item and asks one follow-up if something key is missing.
5. The board and digest re-rank items using the priority score.
6. A blocker alerts the facilitator and suggested owner with one-click Assign / Escalate / Resolved.
7. The requester is notified when the blocker is resolved.

**Prototype screens**

1. **Meeting inbox:** paste notes, Extract, review, confirm
2. **Priority board:** ranked list with owner, age, blocker badge, update-overdue flag, Request Update
3. **Item detail:** update history, add today's update, clarity checker (score, missing list, suggested rewrite, Apply)
4. **Team and recognition:** points, badges, kudos feed
5. **Metrics:** before vs after cards and a trend chart

---

## 6. Technical approach

### Recommended stack (fastest path to a working prototype)

| Layer | Choice | Reason |
|---|---|---|
| App | Next.js (React + TypeScript) with API routes | One codebase and one deploy for front end and back end |
| UI | Tailwind + shadcn/ui, Recharts | Polished quickly, easy to match the hackathon's navy and teal palette |
| Data | JSON files in `/data` behind a repository layer | Fast to build, replaceable by Jira or a database |
| AI | LLM adapter with structured JSON output (company-approved endpoint) | Reliable extraction, model choice stays flexible |
| Demo safety | Cache AI responses for demo scenarios | Protects against network or API issues on the day |

Alternative if the team prefers Python: **FastAPI + React (Vite)**, same structure.

**Key design decision:** keep a `ticketSource` interface (`getItems`, `updateItem`) with a `JsonSource` implementation now and a `JiraSource` / `AdoSource` later. Integration becomes plug-in, not a rebuild.

**Companion sync boundary (not a mirror):** the `ticketSource` reads only the subset we need (items, owners, status, priority, due dates) and writes back only a few fields two-way — `status`, our **work priority ↔ Jira priority**, and the **blocker flag**. Everything Beacon adds (attention score, AI summaries, discussion/assist threads, clarity, retro, analytics) lives in our own store and never needs to round-trip to Jira/TFS. This keeps Jira the system of record and Beacon a lightweight overlay.

**Knowledge-base source:** a second plug-in interface, `knowledgeSource` (`search(query) → passages[]` with source + url), backs the blocker-assist feature. Prototype uses a small local corpus in `/data/kb.json` (past tickets, a runbook, API docs); later it points at Confluence / SharePoint / a vector index. Suggestions always cite the passage they came from.

**Collaborative assist:** each item carries an `assists[]` thread — `{ id, itemId, from, kind(update|offer-help|info), text, date }` — so a teammate who isn't the owner can contribute an update or offer help, threaded into the item's context. The owner stays accountable; the AI summary folds assists into the item's discussion summary.

**Read + write-back to Jira / Azure DevOps:** the `ticketSource` interface extends beyond read to `setDescription`, `addComment`, `transition`, `setBlockerFlag`, `createItem` — so the tool can **fetch items directly from Jira or ADO and push results back** (AI story rewrite → description; clarity / blocker / daily-summary → comment; status / priority / blocker → fields; extracted actions → new items). Writes are explicit, preview-first, labelled AI-assisted, and audited. Full field mapping, API endpoints, auth, sync model and rollout scope are in **[INTEGRATION-PLAN.md](./INTEGRATION-PLAN.md)**.

### Data model

```
Meeting   { id, title, date, client, notes }
Item      { id, meetingId, type, title, owner, dueDate,
            parentId, childIds[],                               // hierarchy (story → sub-tasks/bugs)
            estimate, remaining, storyPoints,                   // effort
            workPriority, status, blocker, dependsOn[], clientImpact,
            attentionScore, attentionReasons[], pinned, snoozedUntil,
            rollupHealth, blockedByChildIds[], cannotDeliver,   // roll-up from children
            forecast: { willMakeSprint, confidence, reasons[] },// deliverability
            rca: { summary, cause, fix, prevention },           // bugs/defects → write-back
            context: { discussionSummary, importance, progressPct,
                       projectedCompletion, health } }
Update    { id, itemId, author, inputMode(voice|text), rawInput,
            aiFinalized, approvedByAuthor, date, status, nextAction, blocker }
Story     { itemId, description, acceptanceCriteria[], clarityScore, missing[], suggestedRewrite }
Member    { id, name, role, points, badges[], capacityHrs,
            leaves[] { from, to, reason }, availabilityPct }    // capacity & leave
Sprint    { id, name, start, end, goal, nextSprintId, plannedItemIds[] }
PriorityChange { id, itemId, by, from, to, reason, date }       // audit of manual overrides
Retro     { sprintId, wentWell[], didntGoWell[], toImprove[], rootCauses[], charts[] }
RetroAction{ id, sprintId, text, owner, status, carriedFromSprintId } // tracked across sprints
Assist    { id, itemId, from, kind(update|offer-help|info), text, date }   // any teammate
KnowledgeDoc { id, title, source(ticket|doc|runbook), url, text }          // KB corpus
```

**`type` taxonomy:** `story · task · bug · defect · change_request · spike · doc · risk · decision · action · requirement`. Each maps 1:1 to a standard Jira / Azure DevOps issue type on integration, so the plug-in layer stays a mapping, not a redesign. Each type has an icon and colour and is a board filter.

**Hierarchy & roll-up (parent ↔ children):** a **story/requirement** can hold child **tasks/bugs** (`parentId` / `childIds[]`); a **bug/defect/spike** is usually a leaf. The board rolls child state *up*: if a child task is **blocked**, the parent shows **blocked-by-child**; if a child **bug** is open, the parent is flagged **cannot-deliver** even when its own status still reads "in progress" — and that bug is surfaced for prioritisation. `rollupHealth` = the worst of the item and its children, so a green story with a red child reads amber/red, not green.

**Deliverability forecast:** from `estimate`/`remaining`, the owner's remaining capacity, blockers and leaves, AI computes `forecast.willMakeSprint` + a confidence and **reasons** (e.g. *"won't finish: blocked child bug + owner on leave Thu–Fri + 12h work in 1.5 days left"*). Shown per item and rolled up per sprint.

**Capacity & leave:** each member has `capacityHrs` and `leaves[]`; the sprint planner shows who is available when. Assigning or prioritising an item to someone **on leave** raises a flag ("owner unavailable — won't be picked up"), and leave feeds the deliverability forecast and next-sprint planning.

**Bug RCA → write-back:** for a bug/defect, AI drafts `rca { summary, cause, fix, prevention }`; the facilitator reviews and **pushes it into the bug's Jira fields / description / comment** (see [INTEGRATION-PLAN.md](./INTEGRATION-PLAN.md)), so the RCA lives on the ticket, not in a side doc.

**Per-item context:** every item carries its own thread so it "knows its own story" — an AI-maintained `discussionSummary` (rolled up from its updates and any meeting mentions), why it matters (`importance`), `progressPct`, an AI-estimated `projectedCompletion`, and a `health` signal (on-track / at-risk / blocked). This is what lets a reader catch up on any item in one glance instead of reading every update.

### Priority: two layers (key design decision)

The proposal's "explainable score" and the facilitator's need to "bump this up" are **two different things**, kept separate on purpose:

| Layer | What it is | Who sets it | Maps to Jira as |
|---|---|---|---|
| **Work priority** | Business importance: Critical / High / Medium / Low | Facilitator / PO, set manually, change logged with a reason (`PriorityChange`) | the native **Priority** column (plug-in reads/writes it) |
| **Attention score** | Computed 0–100 "what needs attention *now*" | Nobody by hand — derived by `priorityScore.ts` from work priority + blocker age + overdue + dependencies + due-proximity + client impact + spillover | a custom field / board rank |

The facilitator raises or lowers **work priority**; because work priority is an *input* to the attention score, the score moves transparently and the `reasons[]` explain exactly how (e.g. *"Work priority raised to Critical (+30)"*). The score itself is never hand-edited — that is what keeps it trustable. For one-off control the facilitator can **Pin** an item to the top or **Snooze** it, both logged. This gives full manual control without breaking explainability.

**Seed data:** 2 sprints of data (Sprint 1 closed, Sprint 2 active; demo clock frozen at **Day 8 of 10**, see [PROPOSAL-REVIEW.md](./PROPOSAL-REVIEW.md) D3). 6 named team members, 1 client meeting transcript (Apex Financial, 180 words, paste-ready), 12 Sprint 2 items spanning the type taxonomy, 4 user stories at scores 2/10, 3/10, 5/10 and 8/10, and 28 daily update records. Includes 2 spillover items from Sprint 1 and 2 tracked decisions extracted from the meeting.

**Story arc (key demo narrative):** REQ-001 (Payment gateway, Marcus Williams) — Day 1-2 normal updates, Day 3 free-text signals distress ("struggling…might need help"), Days 4-5 no update at all. AI detects the pattern, priority score rises to 84, facilitator is alerted. Blocker surfaced in hours, not days. Sprint 1 baseline shows the same item type sat unowned for 3.2 days on average before this tool existed.

**Attention score formula (explainable, single source of truth = `lib/priorityScore.ts`):**
`score = work_priority_weight + blocker_age_days×15 + overdue_days×15 + dependent_count×8 + due_proximity_penalty + no_owner_penalty×20 + client_impact_flag×10 + spillover_flag×15`
where `work_priority_weight` = Critical 40 / High 30 / Medium 20 / Low 10. Output includes a `reasons[]` array that **sums exactly to the score** (so a reader can audit it) — shown next to the score with a "how this is calculated" popover. The facilitator adjusts **work priority** (an input) rather than the score; see the two-layer model above. *The current seed scores must be regenerated from this function — see [PROPOSAL-REVIEW.md](./PROPOSAL-REVIEW.md) D1.*

**AI response cache:** All five AI scenarios (meeting extraction, update structuring, blocker explanation, clarity-vague, clarity-good) have pre-computed responses stored in `/data/ai-cache.json`. Demo is protected against API or network issues on the day.

> Full seed data specification: see `SEED-DATA-PLAN.md` (entity counts, item table, story arc timeline, metrics baseline numbers, and initial file checklist).

### Target enterprise architecture

```
 Teams/Slack bot  --+                        +-- Jira / Azure DevOps
 Web dashboard    --+-> API Gateway + SSO -> Orchestration service --+-- Calendar / Outlook
 Email/mobile push--+    (Entra ID/Okta)     (scheduler, rules,      +-- Confluence / SharePoint
                                              workflow engine)
                                                    |
                       +----------------------------+--------------------+
                       v                            v                    v
               AI layer (approved LLM,      Data store (updates,   Audit & monitoring
               extraction, summarisation,   blockers, metrics;     (AI decisions, access,
               PII redaction, guardrails)   encrypted, retention)  cost, accuracy)
```

---

## 7. Enterprise controls (adoption path)

- **Identity and access:** SSO, role-based views (member, facilitator, manager), team-level data isolation
- **Data protection:** encryption in transit and at rest, PII redaction before model calls, retention limits, approved model tenant, no training on our data
- **AI governance:** human approval for owner assignment and escalation, confidence scores, "AI-suggested" labels, citations to source tickets, feedback buttons
- **Privacy by design:** team-level insights only, **no individual performance scoring**, and a published statement of what is and is not collected
- **Reliability:** queue-based notifications with retries, idempotent integrations, graceful fallback to the raw update if AI fails
- **Observability:** accuracy, latency, cost per team and adoption tracked, feeding the hackathon metrics directly
- **Extensibility:** each use case is a "skill" (prompt + data connector + view) on the same platform

**Rollout:** 2-sprint pilot with 2-3 teams -> compare against baseline -> publish a playbook -> scale.

---

## 8. Plan

### One-day build

| Block | Output |
|---|---|
| Hours 0-1 | Generate and validate all seed data JSON files; verify story arcs and blocker timeline produce correct priority scores |
| Hours 1-2 | Scaffold app, repository layer (`ticketSource` interface + `JsonSource`), base layout |
| Hours 3-4 | Priority board and item detail with updates |
| Hours 5-6 | Meeting extraction and clarity checker (with response caching) |
| Hour 7 | Points, leaderboard, metrics |
| Hour 8 | Polish, rehearsed demo path, architecture and roadmap slides |

### 3-minute demo script

1. Show the old way (chasing updates, notes that disappear)
2. Paste client meeting notes -> extract items -> confirm
3. Priority board with a stale blocker flagged -> Request Update
4. Open a vague story -> see the gaps -> apply the suggested fix
5. Show points awarded and the before/after metrics
6. One slide: production path and controls

### Pitch one-liner

> "We turn stand-ups from status reporting into blocker removal and make sure nothing agreed with the client gets lost, cutting prep time, surfacing blockers in minutes instead of days, and fixing unclear requirements before they cause delay."

---

## 9. Open questions / inputs needed

- [ ] Confirm stack: Next.js (TypeScript) vs FastAPI + React
- [ ] Which AI endpoint is approved for the prototype
- [ ] Real (anonymised) client meeting notes for the extraction demo
- [ ] Real baseline numbers for stand-up time, blocker age and participation
- [ ] Hackathon colour palette / branding assets
- [ ] Which ticketing tool the pilot teams use (Jira or Azure DevOps)

---

## 10. Next steps

1. Confirm the stack and approved AI endpoint
2. Scaffold the project and seed data
3. Build the priority board, then the two AI features
4. Add recognition and metrics
5. Prepare architecture and roadmap slides and rehearse the demo
