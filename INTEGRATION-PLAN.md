# Beacon — Integration & Write-back Plan (Jira / Azure DevOps)

> **Companion to:** [PROPOSAL.md](./PROPOSAL.md) (§2 Positioning, §6 Technical) · [UI-FLOWS.md](./UI-FLOWS.md) · [design/DESIGN-FLOWS.md](./design/DESIGN-FLOWS.md)
> **Answers:** Can we fetch items directly from Jira **and** Azure DevOps (TFS)? What's the integration scope? Can we push the final design back into the description or as a comment? → **Yes. Here's the scope and how.**
> **Principle:** Beacon is a **companion**, not a replacement. Jira/ADO stay the system of record. We sync a **thin, selective slice** and write back only on **explicit user action**, always labelled as AI-assisted.

---

## 1. What syncs vs what stays in Beacon

| Data | Direction | Notes |
|---|---|---|
| Items (title, type, owner, status, priority, due date, description) | **Read** from Jira/ADO | Scoped to the active board/sprint via JQL/WIQL — not the whole backlog |
| `status` | **Two-way** | Hub can transition the item |
| `workPriority` ↔ native **Priority** | **Two-way** | Hub's work priority maps 1:1 to the tool's priority field |
| **Blocker flag** | **Two-way** | Jira "Flagged"/impediment or a label; ADO tag/`Blocked` |
| **Description** (AI story rewrite) | **Write** (on Apply) | Pushed into the native description field |
| **Comments** (clarity report, blocker summary, extracted actions, daily/retro summary) | **Write** (on user action) | Appended to the item's comment stream |
| attentionScore, reasons[], AI summaries, discussion/assist threads, clarityScore, retro, analytics | **Hub only** | Never round-trips; optionally surfaced *as a comment* if the team wants it visible in Jira |

> Why thin: no migration, no duplicate backlog, no fighting Jira's workflow engine. We overlay value and write back only what a human chooses to.

---

## 2. Reading items

### Jira Cloud (REST API v3)
- **Query:** `POST /rest/api/3/search` with JQL, e.g. `project = PORTAL AND sprint in openSprints() ORDER BY updated DESC`, requesting only needed `fields`.
- **One issue:** `GET /rest/api/3/issue/{key}`.
- **Pagination:** `startAt` / `maxResults`.

### Azure DevOps / TFS (REST API 7.1)
- **Query:** `POST /{org}/{project}/_apis/wit/wiql?api-version=7.1` with a WIQL query → returns work-item ids.
- **Batch fetch:** `GET /{org}/{project}/_apis/wit/workitems?ids=1,2,3&fields=System.Title,System.State,...&api-version=7.1`.

### Field mapping (the heart of the adapter)

| Beacon | Jira field | Azure DevOps field |
|---|---|---|
| `title` | `summary` | `System.Title` |
| `type` | `issuetype` (Story/Task/Bug/Epic…) | `System.WorkItemType` (User Story/Task/Bug/Issue) |
| `status` | `status` (+ transition id to change) | `System.State` |
| `workPriority` | `priority` | `Microsoft.VSTS.Common.Priority` (1–4) |
| `owner` | `assignee` (accountId) | `System.AssignedTo` |
| `dueDate` | `duedate` | `Microsoft.VSTS.Scheduling.DueDate` / target date |
| `description` | `description` (ADF) | `System.Description` (HTML) |
| blocker flag | "Flagged" field / impediment link / label | tag `Blocked` or linked Impediment |
| storyPoints / estimate | `customfield_100xx` (story points) / `timetracking` | `Microsoft.VSTS.Scheduling.StoryPoints` / `RemainingWork` |
| **parent / children** | `parent` + sub-tasks; Epic link | `System.LinkTypes.Hierarchy-Forward/Reverse` (parent/child links) |
| **bug RCA** | custom field (e.g. `customfield_RCA`) or description/comment | custom field / `System.Description` |

Anything with no column (attention score, assists, clarity, summaries, forecast, roll-up health) is Hub-only.

**Hierarchy fetch:** both tools expose parent/child natively — Jira sub-tasks + `parent` (and Epic link for the story→epic level); ADO parent/child **hierarchy links**. We fetch the tree in the sprint query and reconstruct `parentId`/`childIds[]`, then compute roll-up health and the deliverability forecast **in the Hub** (not in Jira).

**Capacity & leave — a separate source.** Jira/ADO don't hold leave natively, so capacity/leave comes from a `capacitySource` plug-in: a Jira **Tempo** timesheet/plan feed, an HR system, or **Google/Outlook calendar** ("out of office") — or, for the prototype, `/data/members.json` `leaves[]`. The sprint planner and the forecast read from it; nothing leave-related is written back to Jira.

---

## 3. Writing back — "manage it in one place"

All writes are **explicit** (a button), show a **preview/diff first**, and stamp the change as AI-assisted (`panelLabel: "Added by Beacon • AI-suggested • <user>"`).

### a) Push the AI story rewrite into the description
- **Jira:** `PUT /rest/api/3/issue/{key}` → `fields.description` as **ADF** (Atlassian Document Format). We render the rewrite (ACs, edge cases, dependencies) to ADF. Option: keep the original under a collapsed heading.
- **ADO:** `PATCH /{org}/{project}/_apis/wit/workitems/{id}?api-version=7.1` with a JSON-Patch `replace` on `/fields/System.Description` (HTML).

### b) Append a comment (clarity report, blocker summary, extracted actions, daily/retro summary)
- **Jira:** `POST /rest/api/3/issue/{key}/comment` (ADF body).
- **ADO:** `POST /{org}/{project}/_apis/wit/workItems/{id}/comments?api-version=7.1-preview.3` (text/HTML).
- Use cases: post the clarity score + missing list; post the structured daily stand-up summary; post "AI flagged a possible hidden blocker on Day 3" with evidence; post the retro root-cause note.

### c) Update status / priority / blocker (two-way fields)
- **Jira status:** `GET .../transitions` then `POST /rest/api/3/issue/{key}/transitions` with the transition id (Jira moves by transition, not by setting status directly).
- **Jira priority:** `PUT .../issue/{key}` → `fields.priority`.
- **Jira blocker:** set the "Flagged" field / add label / create impediment link.
- **ADO:** single `PATCH` with JSON-Patch ops on `/fields/System.State`, `/fields/Microsoft.VSTS.Common.Priority`, `/fields/System.Tags`.

### d) Create items from meeting extraction
- **Jira:** `POST /rest/api/3/issue` (project, issuetype, summary, description, assignee, duedate). Returns the key → we store the link.
- **ADO:** `POST /{org}/{project}/_apis/wit/workitems/${type}?api-version=7.1` with JSON-Patch add ops.
- Decisions/risks that aren't tracked as work items can instead be posted as a comment on a parent item or a Confluence/wiki page.

---

## 4. Auth, sync model, safety

- **Auth:** Jira Cloud — OAuth 2.0 (3LO) or email + API token (basic) for a PoC; Connect/Forge app for a product. ADO — OAuth 2.0 or a PAT scoped to Work Items (read/write). Tokens stored server-side (encrypted), never in the client.
- **Scopes (least privilege):** read + write work items/issues + add comments; nothing else.
- **Sync:** initial **pull** scoped to the active sprint/board; stay fresh with **Jira webhooks / ADO service hooks** (issue created/updated) plus a periodic **poll** fallback. Hub stores its own records keyed by `externalId` + `externalSystem`.
- **Conflict handling:** reads are source-of-truth from Jira/ADO; Hub-only fields never conflict. For the few two-way fields, write-back is user-initiated and shows the current remote value first, so we never silently overwrite. If the remote changed since we read it, we re-fetch and ask.
- **Governance:** every write is audited (`who, what, when, before→after`), labelled AI-assisted, and reversible by the user editing in Jira. Respect API **rate limits** (batch, backoff). Honour project permissions — if the user can't edit in Jira, the Hub can't either.

---

## 5. How it's implemented (adapter shape)

Extend the existing `ticketSource` seam (already in the plan) so the same screens work on JSON now and Jira/ADO later — no UI rebuild.

```ts
interface TicketSource {
  getItems(query): Promise<Item[]>;
  getItem(id): Promise<Item>;
  updateItem(id, patch): Promise<void>;          // status, priority, dueDate, owner
  setDescription(id, doc): Promise<void>;         // push AI rewrite
  addComment(id, body): Promise<void>;            // clarity / summary / blocker notes
  transition(id, toStatus): Promise<void>;        // Jira transition / ADO state
  setBlockerFlag(id, on, note?): Promise<void>;
  createItem(input): Promise<{ id, url }>;        // from meeting extraction
}
// implementations: JsonSource (now) · JiraSource · AdoSource (pilot)

interface KnowledgeSource { search(query): Promise<Passage[]>; }  // blocker assist
```

**Rollout scope:**
- **Prototype (now):** `JsonSource` + `/data`. Write-back actions are real UI, writing to the local store — demonstrates the flow safely offline.
- **Pilot:** add `JiraSource` **or** `AdoSource` read + write-back (comment + description + status/priority) against one real project.
- **Production:** webhooks, both systems, Connect/Forge app, audit store, SSO.

---

## 6. Actionable charts (drill-down)

Every chart element is a **filter into the board**, so analytics lead straight to action.

| Chart element | Click → |
|---|---|
| Status donut segment (e.g. "Blocked · 1") | Board filtered to that status |
| Velocity bar (Sprint 2 completed) | Items completed in that sprint |
| Burndown point (a day) | Items still remaining that day |
| Blocker-visibility point | The blocked item(s) + their timeline |
| KPI tile ("Overdue · 2") | Board filtered to overdue |
| "Needs attention" row | Item detail, with Escalate / Reassign / Request-update inline |

Implementation: each chart node is a real `<a>`/`<button>` carrying a board query (`?filter=blocked`), so it works for keyboard and screen-reader users too. (The current canvas charts are static mockups; wiring these is a small follow-up.)

---

## 7. Open questions for the team

- [ ] Which system first for the pilot — Jira Cloud or Azure DevOps? (changes the first adapter)
- [ ] Is a Connect/Forge app acceptable, or API token / PAT for the PoC?
- [ ] Which fields are mandatory on create (project default screens)?
- [ ] Where does the knowledge base live (Confluence / SharePoint / repo docs)?
- [ ] Do we post Hub summaries as Jira comments by default, or only on request?
