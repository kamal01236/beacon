# Beacon — UI Design Flows (screens)

> **Companion to:** [../UI-FLOWS.md](../UI-FLOWS.md) (flow specs) · [../SOLUTION-AUDIT.md](../SOLUTION-AUDIT.md) (what's kept, cut, merged) · [../PROPOSAL.md](../PROPOSAL.md)
> **Status:** Phase 2 — all flows drawn, consolidated onto one shared design system.
> These are the actual designed screens for the flows defined in UI-FLOWS.md.

---

## The design system (read this before editing any screen)

Every screen is built from **one** stylesheet: [beacon.css](./beacon.css) — tokens plus a fixed set of controls.

| | |
|---|---|
| **Source of truth** | [beacon.css](./beacon.css) — 185 selectors: tokens, shell, nav, card, btn, chip, pill, kpi, row, table, score + reasons, bar, avatar, field, **ai block**, **state**, banner, chart frame, lens, phone, and the one `@media (max-width:860px)` block |
| **Screen registry** | [screens.json](./screens.json) — each screen's role, active nav item and lens group |
| **Applied by** | `node design/apply-theme.mjs` — injects beacon.css into every artboard, strips local rules it now owns, and rewrites the sidebar to the one canonical role-based navigation |

**Rule:** a screen's own `<style>` may only contain rules unique to that screen. Anything that appears on two screens becomes a control in beacon.css. Edit the system, run the script — never restyle a screen locally.

What this replaced (measured before the refactor): 84 KB of the 214 KB of screen source was CSS; `.side`/`.nav` were redefined in 22 of 23 files, the mobile bottom-bar media query re-authored in all 23, with 40+ hard-coded hex literals and four different border greys. **149 duplicate rules removed**, and six different sidebars collapsed into one.

---

## How to view

- **Rendered + clickable (recommended):** the hosted canvas — **22 responsive web pages + 1 phone-capture screen**. Every role (facilitator, manager, member) now uses the *same* responsive app shell, so there are no role-specific mobile pages: press **Play** on any web page, then **resize the window** to see it reflow desktop ↔ mobile (the role nav becomes a fixed bottom bar):
  **https://claude.ai/artifact/6GveVaqEyQo6sA4ArRRqJ9** *(private — share from the page's Share menu to let the team open it).*
- **Source in the repo:** [screens/](./screens/) holds one `.dc.html` per screen plus `canvas.json` (layout). These are the design source of truth; they render inside the canvas runtime, so edit them there or ask me to regenerate a browser-standalone preview if you want to open them offline.

---

## A. Responsive web pages (one layout: desktop → mobile)

Each is a **fluid PAGE layout** — persistent left sidebar + content on desktop, collapsing to a scrollable top nav and single column at ≤860px. Grids use `auto-fit`, tables/rows wrap, charts scale. Same page, both views — no separate mobile build.

| Screen | File | Flow | What it shows |
|---|---|---|---|
| **Overview** (default) | [Overview.dc.html](./screens/Overview.dc.html) | J, (M) | All-status KPI tiles, reporting graphs, "Needs attention" list with **action buttons** |
| **Priority Board** | [Main.dc.html](./screens/Main.dc.html) | C, H | Full-width ranked list (score + reasons, owner, status, actions), state + type filters |
| **Team status** | [TeamStatus.dc.html](./screens/TeamStatus.dc.html) | — | Stand-up readiness + one card per member (today's update, workload bar, flags, points); each card's **Open detail** → Member detail |
| **Member detail** (facilitator drill-down) | [MemberDetail.dc.html](./screens/MemberDetail.dc.html) | — | One member seen by the facilitator: assigned items with **status/progress/done-count/blockers**, **AI daily summary**, the member's own **yesterday/today/tomorrow** stand-up, **collaboration cross-links** (who they help / are helped by), update **cadence + request-update**, and a **contribution log** recorded for retro. Items link to the item's full resolution trail. |
| **Item detail (full)** | [ItemDetailFull.dc.html](./screens/ItemDetailFull.dc.html) | D, E, G, L | Required · blocker · action items · **discussion thread** · AI summary · **daily summary** · work-priority +/− |
| **Meeting Inbox** | [MeetingInbox.dc.html](./screens/MeetingInbox.dc.html) | F | Notes (left) → 5 extracted items with evidence + confirm (right); stacks on mobile |
| **Clarity Checker** | [Clarity.dc.html](./screens/Clarity.dc.html) | G | Story + score ring + breakdown (left) / missing + rewrite + apply (right) |
| **Metrics** → *Insights · Impact* | [Metrics.dc.html](./screens/Metrics.dc.html) | J | Before/after KPI grid + participation, quality, blocker-visibility charts |
| **AI activity & trust** | [AiTrust.dc.html](./screens/AiTrust.dc.html) | — | **How AI behaves when it is unsure, has no data, or is down** · dismissal feedback · audit trail · guardrails · pilot instrumentation |
| ~~**Recognition**~~ | [Team.dc.html](./screens/Team.dc.html) | I | **Demoted** — off the nav and the demo path ([audit §5](../SOLUTION-AUDIT.md)): no pain owner, and a leaderboard contradicts our own "no individual performance scoring" stance. File kept. |

### Reporting graphs (all hand-drawn SVG, scale-accurate)
On **Overview**: sprint **burndown** (ideal vs actual, blocker stall marked) · status **donut** · **velocity** (S1 vs S2) · blocker-visibility **trend** · KPI tiles with deltas.
On **Metrics**: before/after bars · participation trend · update-quality bars · blocker-visibility trend.
*Candidates for later:* cumulative flow, per-member velocity, clarity-score distribution, client-action aging.

### Daily stand-up summary (standard structure, on Item detail)
AI-generated per item in the format you specified:
- **Done yesterday** (Day 7) · **Planned today** split **Morning / Evening** · **Done so far (till today)** · **Planned tomorrow** (Day 9) · **Progress** (% + projected completion bar).

### Role dashboards + new-flow screens (added this pass, all responsive)

| Screen | File | Flow | Shows |
|---|---|---|---|
| **Member dashboard** | [MemberDashboard.dc.html](./screens/MemberDashboard.dc.html) | N, U | My items, my blockers, update streak, "update requested", items I'm helping on |
| **Blocker assist** | [BlockerAssist.dc.html](./screens/BlockerAssist.dc.html) | O, P | KB passages with citations + suggested cause/next-step, and the teammate-assist thread + composer |
| **Root-cause analytics** | [RootCause.dc.html](./screens/RootCause.dc.html) | T | Blocker themes, detection source, findings with evidence + improvement (team-level only) |
| **Create + replicate** | [CreateReplicate.dc.html](./screens/CreateReplicate.dc.html) | S | Create an item natively, then replicate to Jira/ADO with field mapping |
| **Write-back preview** | [WriteBackPreview.dc.html](./screens/WriteBackPreview.dc.html) | Q | Description before→after diff, "also post as comments", conflict check, confirm & push |
| **Priority control** | [PriorityControl.dc.html](./screens/PriorityControl.dc.html) | K | Work-priority chips + reason, pin/snooze, live attention-score recompute with new reason |

### Planning, forecast & analytics screens (added this pass, all responsive)

| Screen | File | Flow | Shows |
|---|---|---|---|
| **Hierarchy & forecast** | [Hierarchy.dc.html](./screens/Hierarchy.dc.html) | X, Y | Stories → child tasks/bugs; roll-up "cannot deliver — child bug"; per-item forecast chips + sprint banner |
| **Capacity & planning** | [Planning.dc.html](./screens/Planning.dc.html) | Z, AB | Team availability strip with leave; on-leave flag; capacity-aware next-sprint planner |
| **Cross-sprint analytics** | [CrossSprint.dc.html](./screens/CrossSprint.dc.html) | AC | Velocity/forecast/blocker-theme trends; retro actions tracked across sprints; ask-anything insight |
| **Sprint retro** | [Retro.dc.html](./screens/Retro.dc.html) | M | Went-well / didn't / improve, each → action item; link to cross-sprint tracking |
| **Manager dashboard** | [ManagerDashboard.dc.html](./screens/ManagerDashboard.dc.html) | N | Aggregate delivery health, read-only, team-level only (no individual scoring) |
| **Bug RCA** | [BugRCA.dc.html](./screens/BugRCA.dc.html) | AA | AI-drafted summary/cause/fix/prevention (cited) → push to the bug's Jira field |

## B. Phone-capture screen (390 × 844, phone on purpose)

A developer gives their daily update on their phone — this one task stays phone-shaped. The member's **actual home is the responsive `MemberDashboard`** ("My work"), which becomes a bottom-bar mobile layout on its own — so the member navigates exactly like the facilitator and manager, not through separate mobile pages.

| Persona | Screen | File | Flow |
|---|---|---|---|
| **Member** (Marcus) | Update Composer — voice/keyboard → AI finalize, reached from MemberDashboard's *Update* buttons | [UpdateComposer.dc.html](./screens/UpdateComposer.dc.html) | B |

**Demoted (off nav + demo path, 2026-10-09)** — redundant 390 px twins of screens that already exist as responsive views; kept on the canvas labelled "DEMOTED" for reference only:

| Was | Replaced by | Why |
|---|---|---|
| MyUpdates.dc.html | [MemberDashboard.dc.html](./screens/MemberDashboard.dc.html) | Strict content subset of the dashboard; the dashboard is responsive and covers it. |
| ItemDetail.dc.html | [ItemDetailFull.dc.html](./screens/ItemDetailFull.dc.html) | Full item detail already carries the Day-3 AI-detection timeline in the responsive app shell. |

---

## Click-through map (how the screens link)

```
FACILITATOR
  Priority Board ──tap REQ-001──► Item Detail ──"Check clarity"──► Clarity ──"Apply"──► Item Detail
       │  ├─ "＋ Inbox" / Inbox tab ─► Meeting Inbox ──"Confirm all 5"──► Priority Board
       │  ├─ People ─► Team status ──"Open detail"──► Member detail ──tap item──► Item detail
       │  ├─ Insights ─► Root cause / Trends / Impact
       │  └─ persona chip ─► switch to Member

MEMBER  (same responsive shell + role bottom-bar nav as every other role)
  My work (MemberDashboard) ──"Update"──► Update Composer ──"Approve & post"──► My work
       ├─ Board ─► Priority Board      ├─ Get help ─► Blocker Assist      └─ My trends ─► Metrics
       └─ persona chip ─► switch to Facilitator
```

Every screen's bottom tab bar and top persona chip are live links, so the whole prototype is navigable end to end.

---

## What each screen demonstrates (demo beats)

- **Priority Board** — attention scores with the `reasons[]` breakdown under each item; filters incl. Spillover & Decisions; REQ-001 pinned at top with a "hidden blocker" badge.
- **Item Detail** — the centerpiece arc: Day-3 distress language flagged by AI (keywords shown), Days 4–5 missed, Day 6 formal raise + James assigned, Day 7 ETA. Plus the per-item **context panel** (type, progress %, projected completion).
- **Meeting Inbox** — Apex notes → 5 typed items (action/decision/risk) with owner, due date, evidence, a `cached · 97%` AI chip, and per-item Confirm/Edit.
- **Clarity Checker** — 3/10 ring, score breakdown, 6 missing items, editable AI rewrite, Apply.
- **My work** (MemberDashboard) — member sees only their items, a red "update requested" alert on REQ-001, update streak, and *Update* / *Get help* actions; responsive, collapses to a mobile bottom-bar layout.
- **Update Composer** — voice (mic, live transcript) **or** keyboard → "Finalize with AI" → structured fields + the gentle "sounds like you're blocked — flag it?" prompt → Approve & post.
- **Before / After** — 4 metrics with strike-through before / bold after and comparison bars; "estimated baseline" honesty note.
- **Team & Recognition** — leaderboard, badge types, kudos feed, Give kudos.

---

## Design tokens

Defined once in [beacon.css](./beacon.css) §1 — **use the token, never the hex.**

| Token | Value | Use |
|---|---|---|
| `--navy` / `--navy-2` / `--navy-3` | `#0F2A4A` / `#16375A` / `#1B3A5C` | chrome · raised chrome · active nav |
| `--navy-grad` | `#153A5E → #0F2A4A` | item / bug hero header |
| `--ai` `--ai-fill` `--ai-tint` `--ai-line` | `#0E6A6A` `#1FA6A6` `#E9F6F6` `#BEE3E3` | AI outputs, primary buttons, member chrome |
| `--blocked` + `-fill` `-tint` `-line` | `#A3172B` `#C21F38` `#FCE4E8` `#F3C2CC` | blocked, distress, overdue-critical |
| `--overdue` + `-fill` `-tint` `-line` | `#8A5300` `#B9700A` `#FBEFD9` `#E6C98B` | overdue, missing update, at risk |
| `--spill` + `-tint` `-line` | `#5A39B8` `#EEE8FB` `#D3C7F2` | spillover, decisions |
| `--ok` + `-fill` `-tint` `-line` | `#0F6E3C` `#2E7D52` `#E2F3EA` `#BFE3CC` | healthy, clarity-ready, done |
| `--ink` → `--ink-4` | `#0F2A4A` `#3C5068` `#5B6B7E` `#8794A3` | the only four text colours |
| `--line` / `--line-strong` | `#E7EDF3` / `#D4DEE8` | **the** border colour / control borders (was four greys) |
| `--surface` / `--bg` | `#FFFFFF` / `#EEF2F6` | cards / app canvas |
| `--font` | Plus Jakarta Sans | all UI; `tabular-nums` on scores and metrics |

**Accessibility:** real `<button>` / `<a>` elements, `aria-label` on icon-only controls, tinted badges carry dark text for 4.5:1 contrast, status read by lightness + label (not colour alone). Mobile frame 390 × 844; the same components reflow to the desktop two-pane board per UI-FLOWS.md §3.

---

## Navigation — one canonical set, generated

Previously the sidebar was hand-written per screen and had drifted into **six different navigations**; from Overview you could not reach Forecast, Planning, Analytics or Retro at all. It is now generated from [screens.json](./screens.json) by `apply-theme.mjs`, so it cannot drift again.

| Role | Navigation |
|---|---|
| **Facilitator** (Sarah) | Overview · Board · Inbox `5` · Delivery · People · Insights · Retro |
| **Manager** (Dana) | Overview · Delivery · People · Insights — read-only |
| **Member** (Marcus) | My work · Board · Get help · My trends |

- **Desktop:** persistent left sidebar, active item highlighted, role named at the foot of the nav.
- **Mobile (≤860px):** the same nav becomes a **fixed bottom tab bar**, icons over labels, authored once in beacon.css.
- **Lenses:** several artboards present as one screen under one nav slot — **People** = Today · Capacity & next sprint; **Insights** = Root cause · Trends · Impact. The lens bar is generated too.
- Secondary screens (item detail, clarity, blocker assist, bug RCA, create+replicate) keep the nav of the section they belong to. The two modal mockups and the phone composer have no nav by design.

## Remaining

Full status of every flow is in [../UI-FLOWS.md](../UI-FLOWS.md) §9. All decided flows **A–AC are drawn**, and the two polish items are now done:

- ✅ **Actionable charts (R)** — on Overview every KPI tile and donut segment is a real link into the filtered board, with a `.drill` caption under each chart saying where it goes. The `.drill` control and `svg.chart a` styling are in the system, ready to apply to the remaining chart screens.
- ✅ **Empty / unsure / error states** — drawn as a working product screen, [AI activity & trust](./screens/AiTrust.dc.html), rather than as loose frames.

Still open (small): apply drill-downs to the Insights and Manager charts. (The former phone-only member screens are now handled — the member uses the responsive MemberDashboard/ItemDetailFull like every other role; only UpdateComposer stays phone-shaped on purpose.)

Vision flows **V** (AI Scrum Master) and **W** (onboarding / KT assistant) stay as slides, not drawn.
