# Beacon — Why It's Different (and where it's going)

> **Companion to:** [PROPOSAL.md](./PROPOSAL.md) · [INTEGRATION-PLAN.md](./INTEGRATION-PLAN.md) · [HACKATHON-BRIEF.md](./HACKATHON-BRIEF.md)
> **Purpose:** Answer the question judges (and sponsors) always ask — *"doesn't Jira already do this?"* — honestly, and set out the independent/companion modes and the longer vision.
> **Honesty rule:** we don't claim to invent features that exist. We claim a **combination + an AI layer + simplicity** that no single tool gives today.

---

## 1. The honest landscape

| Tool class | What it already does well | What it does **not** do |
|---|---|---|
| **Jira / Azure DevOps** (system of record) | Backlog, boards, sprints, workflows, estimates, velocity/burndown dashboards, manual impediment flags; emerging AI (Atlassian Intelligence / Rovo) for summaries & Confluence Q&A | Heavy for a daily overview; blocker flag is manual; no reading of free-text updates to *detect* an undeclared blocker; priority is a static field, not an explainable score; no root-cause analytics across people |
| **Stand-up bots** (Geekbot, Standuply, DailyBot) | Async stand-up collection in Slack/Teams, reminders, basic blocker list, light analytics, Jira links | No explainable cross-signal priority; no KB-grounded blocker help; don't connect stand-up → clarity → decisions → retro; no "who keeps getting blocked and why" |
| **BI add-ons** (EazyBI, dashboards) | Rich charts and reports | Reporting, not *action*; no AI; charts don't drill into work you can act on |
| **Clarity / DoR plugins** | Checklists, "definition of ready" gates | Rule checklists, not an AI score + rewrite grounded in the story's domain |

**Takeaway:** every *piece* exists somewhere. Nobody puts them together as **one simplified, explainable, AI-assisted daily overview that you don't have to migrate to.**

---

## 2. What actually makes Beacon different

Five things, in combination:

1. **Hidden-blocker detection from natural language.** We read how people *actually write* their update ("struggling… might need someone… not sure how to proceed") and flag a probable blocker the same day — before anyone sets a flag. Jira's flag is manual; bots don't infer.
2. **An explainable attention score that blends signals Jira keeps separate** — blocker age, overdue, dependencies, client impact, spillover, and the facilitator's work-priority — into one 0–100 number whose `reasons[]` sum to the score. Auditable, overridable.
3. **Knowledge-base-grounded blocker help.** For a blocked item it retrieves your project's own tickets/docs/runbooks and suggests causes + next steps *with citations*. A ticket tool can't; generic AI isn't grounded in your project.
4. **One simplified overview that ties the whole loop together** — meeting → items → daily pulse → clarity → decisions → recognition → metrics → retro — instead of six tools and a spreadsheet.
5. **Root-cause analytics.** Not just "how many points" but *who keeps getting blocked, on which items, and why* — the insight that changes how the next sprint is planned.

> One-liner for the pitch: **"Jira records the work. Beacon watches the pulse — it catches the blocker nobody flagged, explains what needs attention and why, and tells you at sprint end what to fix. As a thin layer on top, or on its own."**

---

## 3. Two ways to run it (companion **and** independent)

| Mode | How it works | For whom |
|---|---|---|
| **Companion** (default) | Overlays Jira/ADO; reads the sprint slice, writes back description/comments/status/priority (see [INTEGRATION-PLAN.md](./INTEGRATION-PLAN.md)) | Teams already on Jira/ADO who want the overview + AI without migrating |
| **Independent** | The Hub is the lightweight tracker itself — items are created and managed here | Small teams / fast projects with no heavy tool, or a team that wants the overview first |
| **Create-here → replicate** | A task created in the dashboard is mapped and **pushed to Jira/ADO on demand** (`createItem` → store `externalId` → ongoing two-way sync) | Start light, formalise into the system of record only when needed |

The **same data model and screens** serve all three — the only difference is which `ticketSource` is active (`JsonSource` / `JiraSource` / `AdoSource`).

---

## 4. Where it's going — the vision ladder

Clearly separated from hackathon scope (per our context-separation rule — hackathon scope is Tier 1 only).

**Tier 1 — Hackathon (now):** companion overview + the 5 AI features + explainable priority + write-back, on seed data. *Proves the core idea.*

**Tier 2 — Pilot:** real `JiraSource`/`AdoSource` read + write-back; independent-create + replicate; KB connector (Confluence/SharePoint) for blocker help; auto retro + root-cause.

**Tier 3 — AI Scrum Master (proactive):** the tool stops waiting to be asked —
- drafts items from meetings and proposes owners/estimates,
- auto-nudges for missing updates and escalates stale blockers,
- keeps the board prioritised and surfaces risks before stand-up,
- generates the stand-up digest and the retro.
Still human-approved, but it *initiates*.

**Tier 4 — AI teammate & onboarding / KT assistant:** acts like an additional team member that knows the project —
- accesses the project knowledge base **and KT recordings/documents**,
- answers "how does X work here?" with citations,
- generates a **team-specific onboarding plan** for a new joiner (what to read, in what order, which KT to watch, who to pair with),
- guides them through it and lets them revisit KT on demand,
so a new joiner ramps up **with no extra hand-holding steps**.

Tiers 3–4 are the product north star; they are *mentioned on a slide*, not built for the demo.

---

## 5. Why this wins on the hackathon criteria

- **Meaningful problem:** the daily-overview + hidden-blocker + onboarding gaps are real and unowned by any single tool.
- **AI intervention:** language-level blocker detection, grounded blocker help, clarity rewrite, root-cause — clear problem → AI → measurable improvement.
- **Working concept:** a running prototype, companion or standalone.
- **Adoption path:** thin layer, no migration, write-back into the system of record — the lowest-friction way to add AI value to how teams already work.
