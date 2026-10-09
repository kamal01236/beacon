# Beacon — UI Design Flows

> **Reads with:** [PROPOSAL.md](./PROPOSAL.md) · [PROPOSAL-REVIEW.md](./PROPOSAL-REVIEW.md) · [INTEGRATION-PLAN.md](./INTEGRATION-PLAN.md) · [DIFFERENTIATION.md](./DIFFERENTIATION.md) · [design/DESIGN-FLOWS.md](./design/DESIGN-FLOWS.md) · [SEED-DATA-PLAN.md](./SEED-DATA-PLAN.md) · [DEMO-SCRIPT.md](./DEMO-SCRIPT.md)
> **Status:** Flows A–M are designed in the canvas; **N–W added this update** (role-based dashboards, KB assist, collaborative assist, Jira/ADO write-back, actionable charts, independent+replicate, root-cause, member journey, vision tiers). See **§9 — flow inventory & what remains**.
> **Principle:** **One responsive codebase, both views.** Every screen fills the browser as a desktop web page and reflows to mobile; the member capture screens stay phone-shaped on purpose. **Role decides the default view and which graphs/items are shown** (see §1.5).

---

## 1. Personas & the surfaces they live on

| Persona | Who | Primary surface | Core job |
|---|---|---|---|
| **Member** (Marcus, Priya, James…) | Developer / BA / QA | **Phone** | Give a daily update in seconds; see only *my* items; respond to a request. |
| **Facilitator** (Sarah) | Delivery Manager | **Desktop / tablet** (works on phone) | Triage the priority board, catch hidden blockers, confirm extracted items, request updates. |
| **Manager** (roadmap-light) | Lead / stakeholder | **Desktop** | Read-only metrics & before/after. |

> The **persona switcher** (top-right of the shell, requirement R4) lets the demo move Marcus → Sarah → Manager instantly. This is how one build shows both the mobile member experience and the desktop triage view.

## 1.5 Role-based views — what each role tracks (visibility by role)

Role is a **lens over the same data**: it sets the default landing view, which **graphs** are shown, and which **items** are in scope. This is how we give each person the right understanding without noise.

| Role | Lands on | Graphs / analytics they track | Items in scope | Purpose |
|---|---|---|---|---|
| **Member** (dev / QA / BA) | My Updates | My progress per item (% + projected done), my update streak, my blockers (aging), KB-assist on my blockers | **Only my items + items I'm helping on** | Focus + fast daily update, low noise |
| **Facilitator / Scrum Master** (Sarah) | Board + Overview | Status distribution, burndown, velocity, blocker-age trend, **team readiness** (who updated), needs-attention | **All team items** | Triage, catch hidden blockers, run stand-up |
| **Manager / Lead** (Dana) | Overview (read-only) | Before/after, velocity across sprints, **root-cause patterns**, delivery-risk, team health (aggregate) | Sprint / portfolio roll-up — **no individual performance scoring** (team-level only; privacy, R-privacy) | Org-level visibility + outcomes |
| **New joiner** *(vision, Tier 4)* | Onboarding plan | Onboarding progress, KT checklist completion | Starter items + team context | Ramp with no hand-holding |

Governance note: manager-level views are **aggregate and team-level only** — never individual performance scores — matching the privacy-by-design control in PROPOSAL §7.

---

## 2. Information architecture

```
Beacon
├── Board            (priority-ranked items)        ← Facilitator home
├── My Updates       (my items + give update)       ← Member home
├── Inbox            (meeting notes → extraction)
├── Item detail      (timeline · clarity · actions)  [pushed, not a tab]
├── Metrics          (before/after)
└── Team             (points · badges · kudos)
```

Item detail is a pushed view (full screen on mobile, side panel on desktop), reachable from Board, My Updates, and alerts.

### Navigation by surface

- **Mobile (< 768px):** bottom tab bar, max 5 targets. Tabs adapt to persona:
  - Member: **My Updates · Board · Inbox · Team**
  - Facilitator: **Board · Inbox · Metrics · Team**
  - The persona's home tab is selected on entry.
- **Desktop (≥ 1024px):** left sidebar (icons + labels), persistent. Item detail opens as a right-hand panel beside the board (two-pane). Metrics and Team are full-width.
- **Tablet (768–1023px):** collapsed icon sidebar; item detail is a slide-over.

---

## 3. Responsive strategy (mobile-first)

| Concern | Mobile (390px) | Tablet (768px) | Desktop (≥1024px) |
|---|---|---|---|
| Shell nav | bottom tabs | icon rail | labeled sidebar |
| Board | single-column card list | 1 col + filter bar | board list + detail side-panel (two-pane) |
| Item detail | full-screen push | slide-over | right panel |
| Update form | full-screen, thumb-reachable CTA | modal | inline panel |
| Meeting inbox | paste → stacked results | two-step | notes left / extracted items right |
| Metrics | stacked before/after cards | 2-up | side-by-side + trend chart |
| Priority reasons | tap chip → bottom sheet | popover | inline under score |

**Rules:** design the card and the form once; let grid/flex reflow (`min-width:0` on text/table children, wrap to one column at phone width). Touch targets ≥ 44px. CTAs sit in the thumb zone (bottom) on mobile. No horizontal page scroll; only tables/timelines scroll inside their own container.

---

## 4. Cross-cutting states (designed, not afterthoughts — R6)

Every AI-touching surface defines five states:

1. **Idle / ready** — the action is offered (e.g. "Extract items", "Check clarity").
2. **Thinking** — skeleton + "AI is reading the notes…" with the model indicator. Non-blocking elsewhere.
3. **Result (live)** — output + a green **"live"** chip, confidence %, and evidence link.
4. **Result (cached)** — identical layout + a grey **"cached"** chip. *The demo-safety story is visible, not hidden* (R3, A4).
5. **Error / offline** — "Couldn't reach the model — showing the last cached result" + retry. Never a dead end.

**Empty states:** Board with no high-priority items → "All clear — nothing needs attention." Inbox before paste → sample-notes hint. My Updates when all submitted → "You're up to date."

**The AI-action pattern (every AI output uses it):** `source → confidence/cached chip → the output → human action (Confirm / Edit / Dismiss) → audit line` (A5). Nothing AI-produced is saved without a human confirm.

---

## 5. The flows

Each flow: **entry → steps → states → exit.** Flow 1 and 4 are the demo centrepieces.

### Flow A — Enter & set the stage (persona + demo clock)
- **Entry:** app loads.
- **Steps:** (1) show **"Demo: Sprint 2 · Day 8 (8 of 10)"** banner (R2). (2) Persona switcher defaults to **Sarah (Facilitator)** → lands on Board. (3) Switching to **Marcus** re-roots to My Updates and filters to his items.
- **States:** persona persists per session (localStorage, wrapped in try/catch).
- **Exit:** persona's home screen.

### Flow B — Member gives a daily update *(mobile-first heart · voice or keyboard)*
- **Entry:** Marcus opens **My Updates** (or taps a "Request update" notification from Flow E).
- **Steps:**
  1. Sees his items as cards; REQ-001 shows a red **"Update requested"** ribbon.
  2. Taps REQ-001 → **"Add today's update"** → one big input with **two ways in: a mic button (voice) or the keyboard.** Placeholder: *"What did you do, what's next, anything in your way?"*
  3. He speaks a rough, rambling update *or* types. (Voice → transcript appears live; he can keep talking.)
  4. Taps **Finalize with AI**. **Thinking** → AI returns a **clean, finalized response**: a tidy summary paragraph *plus* structured fields — *work item · progress · next action · blocker?* — all editable. This is the "improved response" that gets recorded, not the raw ramble.
  5. If distress language is detected, a gentle inline prompt: *"This sounds like you might be blocked — want to flag it?"* (the Day-3 moment).
  6. Marcus reviews, edits a word if needed, taps **Approve & post**. Nothing is recorded until he approves (R3).
- **States:** listening (voice) / thinking / live / cached / error (keep the raw transcript on failure — graceful fallback). Offline → queued, "will finalize when back."
- **Exit:** the finalized update appears on his timeline, the item's context panel (Flow L) and progress % refresh, and the facilitator board re-ranks. Audit line: *"voice input · finalized by AI · approved by Marcus · Day 3."*

### Flow C — Facilitator triages the priority board
- **Entry:** Sarah on **Board** (home).
- **Steps:**
  1. Items ranked by score, highest first. Each card: title · owner avatar · type chip · status · **score + top reason** · badges (blocker 🔴 / overdue 🟠 / spillover 🟣 / client-impact).
  2. Two filter rows: **by state** (*All · Blocked · Overdue · Spillover · Decisions · Risks · My team*, satisfies D8) and **by type** (*Story · Task · Bug · Defect · CR · Spike · Doc · Risk · Decision · Action*). Pinned items show first (📌), snoozed are hidden under a "Snoozed (n)" toggle.
  3. Tap the **score chip** → bottom sheet / popover: full `reasons[]` that *sum to the score* (A1), including any manual work-priority change, + "How this is calculated".
  4. Row actions: **Open · Request Update · Nudge · Assign · set Work priority · Pin/Snooze** (Flow K).
- **States:** empty ("all clear"); loading skeleton rows.
- **Exit:** opens an item, or triggers Flow E/F.

### Flow D — Item detail & update timeline
- **Entry:** tap any item.
- **Steps:** header (title, owner, due, status, score-with-reasons) → **tabs: Timeline · Story (clarity) · Details**. Timeline shows each day's update; AI-flagged days carry a note chip; missing days render as a dashed "no update" row (D9). Dependency list distinguishes *done* vs *open* deps (D11).
- **Exit:** back to board / launches clarity (Flow G) or request-update (Flow E).

### Flow E — Hidden-blocker detection → facilitator alert *(the centerpiece — demo Beat 1)*
- **Entry:** Sarah sees REQ-001 at top of board, score highest, **"Hidden blocker — AI detected"** banner.
- **Steps:**
  1. Open REQ-001 → Timeline. **Day 3** update is highlighted; AI annotation: keywords *"struggling / might need someone / not sure how to proceed"* → *blockerSignal, confidence: high*.
  2. **Day 4–5** render as missing (dashed) with the escalation note ("priority raised to 84, alert fired").
  3. Alert card offers **suggested actions: Request Update · Assign Helper (James) · Escalate** — each one human-confirmed (R3).
  4. Sarah taps **Request Update** → Marcus gets it (links to Flow B).
  5. **Day 6** formal blocker appears, James assigned; **Day 7** pairing + 4-hr ETA. Blocker now *owned + healthy*.
- **States:** live/cached chip on the AI annotation; the whole arc works offline from cache.
- **Exit:** blocker owned; board shows it resolving. Ties to the metrics "same-day detection vs 3.2 days" story (D6).

### Flow F — Meeting notes → extracted items *(demo Beat 2)*
- **Entry:** Sarah opens **Inbox**.
- **Steps:**
  1. Paste the Apex notes (or tap "use sample"). **Extract**.
  2. **Thinking** → 5 items appear as review cards: 2 actions, 2 decisions, 1 risk — each with type · title · suggested owner · due date · evidence snippet · client-delay flag on ACT-001.
  3. Each card: **Confirm · Edit · Dismiss**. Edit opens the fields inline.
  4. **Confirm all** → items drop onto the board; ACT-001 immediately shows **overdue**.
- **States:** live/cached chip + confidence (0.97). Error → cached result + note.
- **Exit:** board updated; audit line per item (*"extracted from Apex notes · confirmed by Sarah · Oct 1"* — A5).

### Flow G — Requirement clarity check & rewrite *(demo Beat 3)*
- **Entry:** open REQ-001 → **Story** tab (or a "Check clarity" CTA).
- **Steps:**
  1. **Check clarity** → score **3/10**, verdict *Not ready*, score breakdown (ACs / edge cases / deps / language).
  2. Missing list (6 gaps: no ACs, no 3DS/SCA, no error states, no PCI scope, no payment-API dep…).
  3. **Show suggested rewrite** → full rewrite (6 ACs, edge cases, dependencies).
  4. Marcus edits → **Apply to item**. Score re-reads toward 8. (REQ-002 is the *reference* good story: 8/10, one WCAG gap, no rewrite — shows the tool isn't noisy.)
- **States:** thinking / live / cached. Apply is the human-in-the-loop confirm.
- **Exit:** story updated, clarity badge changes on the board.

### Flow H — Spillover & decision tracking *(demo micro-beat, closes D8)*
- **Entry:** Board → **Spillover** filter and **Decisions** filter.
- **Steps:** Spillover shows REQ-004 & ACT-003 with a purple badge and a "from Sprint 1 →" link to the origin item. Decisions shows DEC-001 (Stripe) and DEC-002 (deploy window) as confirmed, non-actionable records with their source meeting.
- **Exit:** proves nothing carried-over or agreed is lost — 10 seconds, high value.

### Flow I — Recognition
- **Entry:** **Team** tab.
- **Steps:** leaderboard (points), badge wall (blocker-buster / on-time-10 / story-crafter / early-adopter), kudos feed (4 entries). **Give kudos** → pick teammate + message + optional badge → posts to feed, awards points. All derived from real activity; manual kudos allowed.
- **Exit:** feed updates; points re-total.

### Flow J — Metrics before/after *(demo Beat 4)*
- **Entry:** **Metrics** tab.
- **Steps:** before/after cards (stand-up prep 28→9 min, participation 68→87%, blocker visibility 3.2 days→same-day, update quality 52→81%) + one trend chart. **In-context toggle (A7):** a "Before / After" switch that also re-skins the board to the Sprint-1 baseline for contrast.
- **States:** numbers labelled "estimated baseline" (honesty, matches governance story).
- **Exit:** close / Q&A.

### Flow K — Facilitator adjusts priority *(manual control without breaking explainability)*
- **Entry:** Sarah on the Board or in an item; a member is overloaded, so she needs to re-prioritise.
- **Steps:**
  1. On any item she sees **two controls**: **Work priority** (Critical / High / Medium / Low dropdown) and a **⋯ menu** with **Pin to top** and **Snooze**.
  2. She raises REQ-004's work priority Medium → **Critical**. A small prompt asks for a one-line **reason** (*"client escalation"*).
  3. The **attention score updates live** and a new reason chip appears: *"Work priority raised to Critical (+40 vs +20)"* — so the change is visible in the explanation, not hidden.
  4. **Pin** forces an item to the top regardless of score (badge: 📌 pinned by Sarah); **Snooze** hides it until a chosen day (badge: 💤). Both logged.
- **States:** the score re-sums instantly; every change writes a `PriorityChange` audit row.
- **Exit:** board re-ranks; the "how this is calculated" popover now shows the manual input as one line among the computed ones. *This is the bridge to Jira: work priority is the field the plug-in reads/writes; the score is ours.*

### Flow L — Item context panel *(every item "knows its own story")*
- **Entry:** open any item → **Details** tab (or a "Context" card at the top of the item).
- **Steps:** a single catch-up panel, AI-maintained from the item's updates + meeting mentions:
  - **Type** chip (story / task / **bug** / defect / **CR** / spike / doc / risk / decision / action / requirement) with its icon.
  - **Discussion so far** — a rolling 2–3 line summary (no need to read every update).
  - **Why it matters** (importance) · **Progress** (% bar) · **Projected completion** (AI estimate from update cadence + any ETA) · **Health** (on-track / at-risk / blocked).
  - **Work priority** + attention score with reasons (links to Flow K).
- **States:** summary shows a "cached/live" chip; recomputes when a new update is approved (Flow B).
- **Exit:** the reader is caught up in one glance; jumps to Timeline for detail. *Board filter by type (Bug / CR / Defect / Story / Task …) lives on Flow C.*

### Flow M — Auto sprint review / retro *(less time re-reporting; charts write themselves)*
- **Entry:** **Metrics** → **Sprint retro** (or end-of-sprint prompt).
- **Steps:**
  1. AI generates three columns from the tracked data — **What went well** (e.g. same-day blocker detection, 100% owned items), **What didn't** (REQ-001 blocked 3 days, 2 spillovers, ACT-001 client delay), **What to improve** (earlier credential prep, story clarity before sprint start).
  2. **Auto charts:** completion/burndown, velocity Sprint 1 vs Sprint 2, blocker-age trend, update-quality trend — all drawn from items/updates, no manual entry.
  3. Each retro point links to the evidence item(s). Facilitator can edit/accept before sharing.
- **States:** live/cached; charts render from seed data offline.
- **Exit:** a shareable retro — the "yesterday's activity" write-up produced from data instead of a meeting.

### Flow N — Role-based dashboard & visibility *(the right view per role)*
- **Entry:** login / persona switch.
- **Steps:** the shell adapts nav, default landing view, graph set and item scope to the role (table in §1.5). **Member** → My Updates + my-progress graphs + only my items. **Facilitator/Scrum Master** → Board + Overview + full analytics + all items. **Manager** → read-only aggregate Overview (before/after, root-cause, team health). A role picker switches the lens live for the demo.
- **States:** per-role empty states; manager view is read-only (no action buttons).
- **Exit:** drill into board/item from the role's dashboard.

### Flow O — Knowledge-base blocker assist *(grounded help, with citations)*
- **Entry:** a blocked item (REQ-001) shows **"Get help from the knowledge base"** (or auto-suggests when a blocker is raised).
- **Steps:** (1) AI searches `knowledgeSource` → 2–3 ranked passages (past ticket, runbook, API doc) each with a title + "why relevant". (2) A suggested **likely cause** + **next steps**, each **citing** a passage. (3) Owner/helper taps **Apply** (adds as an action/note on the item) or **Dismiss**.
- **States:** thinking / live / cached; empty ("no close matches — ask the team" → Flow P).
- **Exit:** suggestion saved as an assist/action; audit line *"KB-assisted · cites 2 sources"*.

### Flow P — Collaborative assist *(any teammate can help, not just the owner)*
- **Entry:** James opens an item that isn't his (from Board "needs attention", a mention, or Team status).
- **Steps:** an **Assist composer** on the item — kind **Update / Offer help / Info** — he posts; it threads into the item's discussion under his name; owner is notified; AI folds it into the context summary. "Offer help" can convert to **assigned helper**.
- **States:** posted; owner stays accountable; visible to all.
- **Exit:** understanding gap closed; discussion thread + context summary updated (Flow L).

### Flow Q — Write-back to Jira / ADO *(manage it in one place)*
- **Entry:** after Apply-rewrite (G), Confirm-extraction (F), or a status/priority/blocker change — a **"Push to Jira/ADO"** affordance (two-way fields can auto-offer).
- **Steps:** (1) a **preview / diff** shows exactly what will change — description before→after, or the comment body, or the field change — stamped *"Added by Beacon · AI-suggested · <user>"*. (2) Confirm → push. (3) Success toast + link to the external item.
- **States:** preview / pushing / success / **conflict** (remote changed → re-fetch & re-ask) / error. Never silently overwrites.
- **Exit:** item updated in Jira/ADO; audit row. (See [INTEGRATION-PLAN.md](./INTEGRATION-PLAN.md) §3.)

### Flow R — Actionable chart drill-down *(analytics → action)*
- **Entry:** any chart on Overview / Metrics.
- **Steps:** click a **donut segment / velocity bar / burndown point / KPI tile** → Board opens filtered to those items (e.g. status = blocked). Real `<a>`/`<button>` nodes → keyboard + screen-reader friendly.
- **Exit:** filtered board → act on the items.

### Flow S — Independent create + replicate-to-Jira *(companion and standalone)*
- **Entry:** **New item** in the dashboard (independent mode), or quick-add from a meeting/decision.
- **Steps:** (1) create natively (type, title, owner, due, work priority) — it lives in the Hub. (2) A **Replicate to Jira/ADO** action maps fields and creates the external item (Flow Q create), stores `externalId`, and turns on two-way sync. Until replicated it's Hub-only (badge **"local"**).
- **States:** local / replicating / linked.
- **Exit:** item exists in the Hub and (optionally) in Jira/ADO, mapped.

### Flow T — Root-cause analytics *(why, not just how much)*
- **Entry:** Metrics → **Root cause** (or from the retro, Flow M).
- **Steps:** AI surfaces patterns from the sprint — recurring blocker themes (e.g. "3rd-party integration"), items that stalled for lack of clarity, client-dependency delays, and **where help was slow to arrive** — each citing evidence items, **team-level (no individual blame)**. Produces an improvement list for next-sprint planning.
- **States:** live / cached.
- **Exit:** improvement list feeds planning.

### Flow U — Individual member journey *(the member's whole day, end to end)*
- **Entry:** Marcus opens the app (Member role, Flow N).
- **Steps:** (1) **My Updates** — items needing an update + the "update requested" ribbon. (2) **Give update** (Flow B, voice/AI). (3) See **my blockers** → **KB assist** (O) or **ask for help** (P). (4) **Offer help** on a teammate's item (P). (5) See **my recognition** (I). *(New joiner adds the onboarding plan, Flow W.)*
- **Exit:** the member's day is done in a few taps; the facilitator board reflects every change.

### Flow V — AI Scrum Master *(vision · Tier 3 · slide only)*
Proactive mode: drafts items from meetings, proposes owners/estimates, auto-nudges for missing updates, escalates stale blockers, keeps the board prioritised, and generates the stand-up digest + retro — all human-approved. *Mentioned on a slide, not built for the demo.*

### Flow W — Onboarding / KT assistant *(vision · Tier 4 · slide only)*
A new joiner gets an **auto-generated, team-specific onboarding plan** built from the project KB + KT recordings/docs: what to read, in what order, which KT to watch, who to pair with. Guided checklist, "how does X work here?" Q&A with citations, revisit-KT on demand. *Slide only.*

### Flow X — Item hierarchy & roll-up *(sub-tasks, and a child that blocks the parent)*
- **Entry:** Board or item — a story with children.
- **Steps:**
  1. Stories/requirements show an **expand** control; expanding reveals child **tasks/bugs** indented under the parent (bugs/spikes are leaves). Child rows carry their own status, owner, estimate.
  2. **Roll-up:** if a child task is **blocked** or a child **bug** is open, the parent shows **"cannot deliver — blocked by child"** with the child linked, even if the parent's own status is "in progress". `rollupHealth` = worst of self + children, so the parent reads amber/red.
  3. The offending **child bug is surfaced for prioritisation** (its own attention score rises; it appears in "needs attention").
- **States:** collapsed/expanded; a parent with no children shows no expander.
- **Exit:** open the child to act; clearing the child restores the parent's health.

### Flow Y — Deliverability forecast *(will it land this sprint, and why not)*
- **Entry:** item detail (per-item) and Overview/sprint header (per-sprint).
- **Steps:** a **forecast chip** — *On track / At risk / Won't make sprint* — with **reasons**: remaining estimate vs owner's remaining capacity, blockers, child bugs, and leave (e.g. *"12h left, 1.5 days, owner on leave Thu–Fri → won't make it"*). Sprint header aggregates: "9 of 12 forecast to land."
- **States:** recomputes when estimate, status, capacity or leave changes.
- **Exit:** facilitator rebalances (reassign, split, de-scope) — ties to Flows K and Z.

### Flow Z — Capacity & leave planning *(who's available, and the unavailability flag)*
- **Entry:** a **Planning / Capacity** view (and inline on assignment).
- **Steps:**
  1. A team **availability strip** across the sprint days — each member's capacity with **leave blocks** shaded.
  2. Assigning or prioritising an item to someone **on leave** raises a flag: *"Marcus is on leave Thu–Fri — this prioritised item won't be picked up."*
  3. Leave + capacity feed the forecast (Y) and next-sprint planning (AB).
- **States:** source = `capacitySource` (Tempo / calendar / HR) or seed `leaves[]`.
- **Exit:** reassign, or move the item to next sprint.

### Flow AA — Bug RCA → write-back *(root cause lands on the ticket)*
- **Entry:** a bug/defect item → **"Draft RCA"**.
- **Steps:** AI drafts **summary · cause · fix · prevention** from the bug's history + KB (cited). Facilitator edits, then **Push to Jira** → writes into the bug's RCA field / description / comment (preview-first, Flow Q).
- **Exit:** RCA lives on the Jira ticket, not a side doc.

### Flow AB — Next-sprint planning *(pick what's next, capacity-aware)*
- **Entry:** **Planning → Next sprint**.
- **Steps:** a backlog/candidate list → drag/select items into the **planned next sprint**; running **capacity meter** per member (respecting leave) warns on over-allocation; spillover from this sprint is pre-queued.
- **Exit:** a provisional next-sprint plan with a capacity check.

### Flow AC — Cross-sprint analytics & retro-action tracking *(the "similar dashboard" — yes)*
- **Entry:** **Analytics** (manager/facilitator).
- **Steps:**
  1. Trends across sprints — velocity, blocker themes, update quality, forecast accuracy.
  2. **Retro action items tracked across sprints**: each prior-sprint action shows done / carried-over, so recurring problems are visible (did we actually fix last retro's issue?).
  3. **Ask-anything insight:** a prompt — *"why did velocity drop in Sprint 2?"* — AI answers over this + past sprints with evidence, consistently.
- **Exit:** a cross-sprint action list that feeds planning (AB).

---

## 6. Screen inventory (what we'll build)

| # | Screen | Flows | Mobile | Desktop |
|---|---|---|---|---|
| 1 | App shell (nav + persona switcher + demo banner) | A | bottom tabs | sidebar |
| 2 | My Updates (member home) | B | ✓ primary | list |
| 3 | Update composer (free-text → AI structure) | B | full-screen | panel |
| 4 | Priority board | C, E, H | card list | list + detail pane |
| 5 | Item detail (timeline / story / details) | D, E, G | full-screen | right panel |
| 6 | Blocker alert card | E | banner + sheet | inline |
| 7 | Meeting inbox (paste → extract → confirm) | F | stacked | two-pane |
| 8 | Clarity checker panel | G | in Story tab | in Story tab |
| 9 | Team & recognition | I | ✓ | ✓ |
| 10 | Metrics before/after | J | stacked cards | side-by-side + chart |
| 11 | Priority controls (work priority / pin / snooze + audit) | K | inline + sheet | inline |
| 12 | Item context panel (type · summary · progress · ETA · health) | L | Details tab | top card |
| 13 | Auto sprint retro (3 columns + auto charts) | M | stacked | columns + charts |
| 14 | Member dashboard (my progress, streak, my blockers) | N, U | ✓ primary | ✓ |
| 15 | Manager dashboard (aggregate, read-only) | N | ✓ | ✓ |
| 16 | KB blocker-assist panel (passages + cited suggestion) | O | in item | side panel |
| 17 | Collaborative-assist composer + thread | P | in item | in item |
| 18 | Jira/ADO write-back preview dialog | Q | modal | modal |
| 19 | Independent create + replicate form | S | full-screen | modal |
| 20 | Root-cause analytics view | T | stacked | grid + charts |
| — | Shared states: thinking / cached / error / empty / offline | all | ✓ | ✓ |

The full status of every flow — designed vs specified vs vision, and what remains to draw — is in **§9**.

---

## 7. Design language (tokens to lock before building)

- **Palette:** hackathon navy + teal. Navy `#0F2A4A` (primary), teal `#1FA6A6` (accent/AI), with status hues: blocker red, overdue amber, spillover violet, done green, info slate. Neutrals biased slightly toward navy (not pure grey). Full light **and** dark token set (R7 / artifact theme rules).
- **Type:** one humanist sans for UI (e.g. Inter) + tabular-nums for all scores/metrics. Clear scale, balanced headings.
- **Components:** item card, score chip + reasons sheet, status/type badges, owner avatar, AI-result block (source · chip · confidence · confirm), update composer, timeline row (present / flagged / missing variants), before/after stat card.
- **AI visual signature:** teal accent + a small spark/"AI" mark on anything model-generated, always paired with the live/cached chip. Consistent everywhere so "this is AI, and here's whether it's live" is instantly readable.
- **Accessibility:** WCAG AA contrast, keyboard nav, ARIA on interactive chips, focus-visible — the app meets the bar its own clarity checker enforces (D13).

---

## 8. What approval of this unlocks

Once you're happy with the personas, IA, flows and screen inventory above, the next step (Phase 2→3) is:
1. Lock the design tokens (palette/type) and build the Tailwind theme.
2. Build the app shell + persona switcher + demo banner.
3. Build screens in demo order: Board → Item detail/timeline → Inbox → Clarity → Metrics.

Say the word and I'll start on the design tokens + a clickable shell, or adjust any flow first.

---

## 9. Flow inventory & what remains

**Status key:** ✅ designed in the canvas · 🟡 partially designed · 📝 specified only (not drawn) · 🔭 vision (slide only).

| Flow | What | Status | Scope |
|---|---|---|---|
| A | Enter · persona · demo clock (shell) | ✅ | Hackathon |
| B | Member update — voice/keyboard → AI finalize | ✅ | Hackathon |
| C | Facilitator board triage | ✅ | Hackathon |
| D | Item detail & timeline | ✅ | Hackathon |
| E | Hidden-blocker detection → alert (**centerpiece**) | ✅ | Hackathon |
| F | Meeting notes → extraction | ✅ | Hackathon |
| G | Clarity check & rewrite | ✅ | Hackathon |
| H | Spillover & decision tracking | ✅ | Hackathon |
| I | Recognition | ⛔ **demoted** — drawn, cut from nav + demo ([audit §5](./SOLUTION-AUDIT.md)) | Dropped |
| J | Metrics before/after | ✅ reframed as *Insights · Impact* + pilot instrumentation (audit §5) | Hackathon |
| K | Priority control (work-priority / pin / snooze) | ✅ (PriorityControl sheet) | Hackathon |
| L | Item context panel | ✅ | Hackathon |
| M | Auto sprint retro | ✅ (Retro narrative + charts exist) | Should |
| N | Role-based dashboards (member / manager) | ✅ one canonical role-based nav + role lens | Should |
| O | Knowledge-base blocker assist | ✅ (BlockerAssist) | Should |
| P | Collaborative assist (teammate help) | ✅ (BlockerAssist thread) — **not** counted as an AI intervention (audit §2) | Should |
| Q | Jira / ADO write-back preview | ✅ (WriteBackPreview) | Should / Pilot |
| R | Actionable chart drill-down | ✅ Overview wired (KPI tiles + donut segments + `.drill` captions); Insights/Manager charts pending | Should |
| S | Independent create + replicate-to-Jira | ✅ (CreateReplicate) | Pilot |
| T | Root-cause analytics | ✅ (RootCause) | Should |
| U | Individual member journey (end-to-end) | ✅ (MemberDashboard + B/O/P/I) | Hackathon |
| V | AI Scrum Master (proactive) | 🔭 | Vision (Tier 3) |
| W | Onboarding / KT assistant (new joiner) | 🔭 | Vision (Tier 4) |
| X | Item hierarchy & roll-up (child blocks parent) | ✅ (Hierarchy) | Should |
| Y | Deliverability forecast (will it land + why) | ✅ (Hierarchy — chips + sprint banner) | Should |
| Z | Capacity & leave planning | ✅ (Planning) | Should |
| AA | Bug RCA → write-back | ✅ (BugRCA → WriteBackPreview) | Should |
| AB | Next-sprint planning (capacity-aware) | ✅ (Planning) | Should / Pilot |
| AC | Cross-sprint analytics + retro-action tracking | ✅ (CrossSprint) — trend charts labelled "accumulates from Sprint 3"; retro-action carry-over is the live part | Should |
| **AD** | **AI trust: unsure / no-data / unavailable states, dismissal feedback, audit trail, guardrails, pilot instrumentation** | ✅ (AiTrust) | **Hackathon — criterion 04** |

### Remaining to design

All decided flows **A–AD are drawn**. The two polish items are now closed:

1. ✅ **Actionable charts (R)** — Overview's KPI tiles and donut segments link into the filtered board, each chart carrying a `.drill` caption. The control exists in the design system; Insights and Manager charts still to be wired.
2. ✅ **Empty / unsure / error states** — built as flow **AD** (AI activity & trust) instead of loose frames, because "what happens when the AI is wrong" is a product answer, not a state gallery.

Still open (small): drill-downs on the remaining chart screens; responsive variants of the two phone-only member screens if ever needed.

All screens are now built from one shared design system — [design/beacon.css](./design/beacon.css), applied by `node design/apply-theme.mjs`. See [SOLUTION-AUDIT.md](./SOLUTION-AUDIT.md) for what was cut, merged and why.

Vision flows **V, W** stay as slides — not drawn for the demo (context-separation rule).
