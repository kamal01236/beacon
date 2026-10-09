# Beacon — Solution Audit

> **Purpose:** test every proposed capability and every drawn screen against the hackathon ask, then cut what doesn't earn its place.
> **Inputs:** [HACKATHON-BRIEF.md](./HACKATHON-BRIEF.md) (immutable ask) · [PROPOSAL.md](./PROPOSAL.md) · [UI-FLOWS.md](./UI-FLOWS.md) · [design/DESIGN-FLOWS.md](./design/DESIGN-FLOWS.md)
> **Date:** 2026-10-09 · audit of canvas v14 (23 screens)

---

## 1. The test

Every item below is scored on the brief's own terms, plus one test the brief implies but doesn't state:

| Test | Source |
|---|---|
| **T1 — Real pain** | Can we name the person who feels it, in our own seed data? (§2 "meaningful problem") |
| **T2 — AI earns it** | Does AI change the outcome, or just reformat data a query could return? (§3 criterion 02) |
| **T3 — Demoable** | Can a judge see it work in a 5-minute walkthrough? (§3 criterion 03) |
| **T4 — Adoptable** | Does it survive contact with a real team that already lives in Jira? (§3 criterion 04) |

A capability that fails **T2** is a report, not an AI intervention. A capability that fails **T1** is scope we invented.

---

## 2. Verdict — the 11 AI interventions

| # | Capability | T1 pain owner | T2 | Verdict |
|---|---|---|---|---|
| 1 | **Hidden-blocker detection** from NL wording | Marcus, Day 3 distress language then silence | Yes — no query finds "sounds stuck" | **KEEP — this is the demo** |
| 2 | **Explainable attention score** | Sarah ranking 12 items by gut | Yes, as the *explanation*; the sort alone is rules | **KEEP** — sell the `reasons[]`, not the number |
| 3 | **Meeting → items extraction** | Apex call actions lost | Yes | **KEEP** |
| 4 | **Clarity checker + rewrite** | 3/10 story bounced in refinement | Yes | **KEEP** |
| 5 | **Voice/keyboard update → AI finalize** | Marcus, 10 min/day of stand-up admin | Yes | **KEEP** |
| 6 | **KB-grounded blocker assist** (citations) | Marcus blocked 5 days on a solved problem | Yes — strongest "AI as teammate" proof | **KEEP — elevate** |
| 7 | **Collaborative assist thread** | James helping on an item he doesn't own | No — it's a comment thread | **THIN** — keep as UI, drop the "AI" claim |
| 8 | **Retro + root-cause analytics** | Sarah writing retro from memory | Partly — grouping is AI, counting is not | **KEEP, narrowed** to themes + evidence |
| 9 | **Deliverability roll-up / "cannot deliver"** | Sarah learning on Day 9 that REQ-001 can't ship | Yes — inference across children, capacity, leave | **KEEP — promote to headline** |
| 10 | **Bug RCA drafting** | Marcus writing the same RCA as PORTAL-412 | Yes | **KEEP** |
| 11 | **Cross-sprint insight (ask-anything)** | Sarah's "why did velocity dip?" | Yes, but needs history we don't have | **DEFER** — see §5 |

**Net:** 9 keep, 1 thin, 1 defer. The spine of the product survives the test. The problem is not the capability list — it's §4 and §5.

---

## 3. Screens: 23 → 15

| Merge | Screens | Why |
|---|---|---|
| **Overview** ← ManagerDashboard | 2 → 1 | Our own UI-FLOWS §1.5 says *role is a lens over the same data*. Building a second dashboard for the manager contradicts the model we're pitching, and duplicates velocity + participation + blocker-visibility + KPI tiles. One Overview, read-only aggregate under the Manager persona. |
| **Item** ← ItemDetailFull + ItemDetail (mobile) | 2 → 1 | Same screen at two widths. We claim one responsive codebase; two files disprove it. |
| **My work** ← MemberDashboard + MyUpdates (mobile) | 2 → 1 | Same — MyUpdates *is* My work at 390px. |
| **Insights** ← RootCause + CrossSprint + Metrics | 3 → 1 (3 lenses) | All three answer "what does the data say?" Three sidebars, three chart sets, overlapping charts. One screen, lenses: **Root cause · Trends · Impact**. |
| **People** ← TeamStatus + Planning | 2 → 1 (2 tabs) | Both are "the team as people": today's stand-up readiness, and capacity/leave/next sprint. Same member-card control, drawn twice. |
| **Recognition** | 1 → 0 | See §5. |

**Result: 23 → 15 screens, no capability lost.** Fewer screens is a better pitch: it's evidence of the "one simplified overview" claim we make against Jira.

---

## 4. Redundancy, measured

Not an opinion — counted across `design/screens/*.dc.html`:

| Finding | Number |
|---|---|
| Total screen source | 214 KB |
| Of which CSS | **84 KB (39%)** |
| `.side` / `.nav` redefined | **22 of 23 files** |
| `.pg` shell redefined | 20 files |
| `@media (max-width:860px)` bottom-bar block re-authored | **23 of 23** |
| `.card` / `.btn` redefined | 15 / 13 files |
| Distinct hard-coded hex literals | **40+** |
| Velocity chart drawn from scratch | 3 screens |
| Participation + blocker-visibility charts | 3 screens each |
| KPI tile block | 3 screens |

**Palette drift** — these are all doing one job each, with no token to stop the next screen inventing another:
- borders: `#E7EDF3`, `#E2E8F0`, `#D4DEE8`, `#CBD5E1`
- amber: `#B9700A`, `#8A5300`, `#8B4A1A`
- green: `#0F6E3C`, `#2E7D52`
- navy chrome: `#0F2A4A`, `#16375A`, `#1B3A5C`, `#153A5E`

**The worst one — navigation.** The sidebar is a different set on every screen:

| Screen | Its sidebar |
|---|---|
| Overview | Member view · Board · Team status · Item detail · Meeting inbox · Metrics · Root cause |
| Board (Main) | Overview · Team status · Item detail · Meeting inbox · Metrics · Recognition |
| Metrics | Overview · Board · Team status · Item detail · Meeting inbox · Recognition |
| Manager | Overview · Forecast · Planning · Analytics · Retro · Metrics |
| Cross-sprint | Overview · Board · Forecast · Planning · Retro · Manager |
| Member | Board · Get help · Recognition |

Six screens, six navigations. **From Overview — the default landing screen — you cannot reach Forecast, Planning, Analytics or Retro at all.** The six screens added in the last pass formed their own island. (This corrects the "all screens are click-through" note in DESIGN-FLOWS.md, which was true before that pass.)

---

## 5. What does *not* solve a pain area

| Cut / demote | Reason |
|---|---|
| **Recognition — kudos, badges, leaderboard** (`Team.dc.html`, flow I) | **Cut from nav and demo.** No pain owner in our own seed data: nobody said recognition was missing. Worse, it *contradicts us* — ManagerDashboard carries the badge "team-level only · no individual performance scoring", while Recognition ranks individuals on a leaderboard. A judge who spots both reads it as unprincipled. It also pulls toward the Team Culture track when we chose Agile Practices. File kept, off the nav. |
| **Manager dashboard as a screen** | Redundant with Overview under a role lens (§3). Keeping it also weakens the lens story. |
| **"Before / after" metrics as a product screen** | The "before" numbers are an **estimated baseline**, not measured. Presented as a product screen it reads as a results claim we can't support, and criterion 04 is exactly where a judge pushes. **Reframe** as the *Impact* lens: what we will instrument, how, from which date — a measurement plan, honestly labelled. Stronger on T4, not weaker. |
| **Cross-sprint trend charts** | Three data points (S1, S2, a forecast) is not a trend. **Defer the charts**, keep the part that is real now: retro actions carried over vs closed. Label trend panels "accumulates from Sprint 3". |
| **Ask-anything AI insight box** | Can't be grounded on two sprints; a judge who asks it a second question gets an empty answer. Demote to the vision slide. |
| **Create + replicate** | Not a pain — a positioning proof. Nobody's day improves because an item can be born in Beacon. Keep one screen to answer "can it stand alone?", off the demo path. |
| **Collaborative assist as an "AI intervention"** | It's a thread. Keep the UI, drop it from the AI table (§2 #7) so the other ten are credible. |

---

## 6. What is required and still missing

Ordered by what a judge will ask first.

1. **What happens when the AI is wrong.** Zero screens today. Criterion 04 lives here. Needed: low-confidence state, "no signal / not enough data", AI-unavailable fallback, and a visible **Dismiss → why** on every AI output that feeds back. *This is the single highest-value gap.*
2. **One canonical role-based navigation** (§4). Currently broken, and it's the first thing a judge touches.
3. **Actionable charts (flow R).** We claim every chart drills into a filtered board. None do.
4. **Audit trail.** Who changed work priority, who accepted which AI output, what got pushed to Jira and when. Partly in Priority control; needs to be one consistent control.
5. **Measurement instrumentation** — the concrete answer to "how would you know this worked?" (blocker-visibility lag, update participation, spillover rate, forecast accuracy; baseline captured in week 1 of a pilot).
6. **Empty / loading / offline** frames.

---

## 7. How to represent it better

Five changes, in order of pitch impact:

1. **Lead with "cannot deliver."** Our most defensible claim — *a child bug silently kills a parent story, and only Beacon says so on Day 3 instead of Day 9* — is currently buried on the Forecast screen. It belongs as the top banner of Overview, with the blocking child named and a one-click path to it.
2. **Standardise one AI block control.** Every AI surface — blocker detection, extraction, clarity, assist, RCA, forecast reason, insight — is the same object: *AI output + confidence + cited source + Accept / Edit / Dismiss*. It is currently drawn eight different ways. Drawing it once, identically, everywhere is both the consistency fix and the trust story: the user is always in the loop, in the same place, with the same controls.
3. **Make the score explain itself inline.** The `reasons[]` chips are the differentiator against Jira's priority column. One `.reasons` control, on every surface an item appears.
4. **Three lenses, not three dashboards** (Insights, §3). Judges read three chart screens as padding.
5. **Show the loop closing.** Meeting → item → blocker → assist → resolved → retro action → next sprint. Add the back-links so the demo can walk the loop in one direction without going through the sidebar.

---

## 8. The common design system

Being built as the fix for §4 — one source of truth at [design/beacon.css](./design/beacon.css):

**Tokens** — surfaces, text, borders, the six semantic states (blocked / overdue / spillover / healthy / AI / neutral), nav chrome, radii, spacing, type scale, shadow. One value per job; the drift list in §4 collapses to it.

**Controls** — `.app` shell · `.topbar` · `.sidenav` (canonical, role-based, one set) · `.card` · `.btn` (primary/secondary/ghost/danger) · `.chip` · `.pill` · `.kpi` · `.field` · `.row` · `.avatar` · `.bar` (progress) · `.reasons` (score explainer) · `.ai` block (output + confidence + source + accept/edit/dismiss) · `.state` (empty/loading/error/low-confidence) · `.chart` frame with shared axis/grid/legend styling.

**Responsive** — one `@media (max-width:860px)` block in the system, authored once: sidenav becomes the fixed bottom bar, grids collapse to one column, tables scroll in place. No screen re-authors it.

**Rule going forward:** a screen's own `<style>` may only contain rules for things unique to that screen. Anything that appears twice becomes a control.

---

## 9. Decision summary

| | Count |
|---|---|
| AI interventions kept | 9 (of 11) · 1 thinned · 1 deferred |
| Screens | 23 → **15** |
| Features cut or demoted | 7 (§5) |
| Gaps to close | 6 (§6), AI-failure states first |
| CSS | 84 KB duplicated → one system |
| Navigations | 6 → **1** role-based |
