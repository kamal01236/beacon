# Beacon — Proposal Review & Phased Improvement Plan

> **Reviewed:** PROPOSAL.md v1 + all 8 seed files + SEED-DATA-PLAN.md + DEMO-SCRIPT.md
> **Date:** 2026-10-09
> **Purpose:** Identify defects, lock the improvements, and set the phases — so we can start the UI design flows on a clean base. See [UI-FLOWS.md](./UI-FLOWS.md) for the flows themselves.

---

## 1. Summary verdict

The proposal is strong on *problem framing, AI-to-outcome mapping, and adoption path* — exactly what the judges score. The weaknesses are **internal consistency** ones: the numbers, dates and formula across the docs and the seed data don't fully agree. For a product whose headline is **"explainable, trustable"**, these must reconcile or a judge who does the arithmetic on screen catches us.

None of these are hard to fix. They are specification bugs, not design flaws.

---

## 2. Defects — ranked by severity

### 🔴 Critical — breaks the core "explainable" claim

**D1. The priority score formula does not produce the scores in the seed data.**
The product's differentiator is that every score shows a `reasons[]` the user can add up and trust. Right now the reasons don't sum to the displayed score on three items:

| Item | Displayed score | Reasons sum to | Gap |
|---|---|---|---|
| req-002 | 55 | 30+10+10+0 = **50** | −5 |
| req-003 | 48 | 20+8+10+0 = **38** | −10 |
| rsk-001 | 63 | 20+8+15+10 = **53** | −10 |

Also, the formula term weights don't match the reason labels:
- Formula says `priority_value×10` (high=3 → +30). But `act-001` labels "Priority: high **(+10)**" — the weight was hand-fudged so the total hit 84.
- Formula has no **overdue** term, yet `act-001` uses "Overdue by 4 days (+60)" and `act-002` "Overdue by 3 days (+12)". 60 = 4×15, but 12 ≠ 3×15 and ≠ 3×5. Overdue is scored two different ways.
- `req-001` uses "Active blocker multiplier (+5)" and "Due in 2 days (+8)" — neither maps to the stated formula (`days_to_due×5`).

**Fix:** `lib/priorityScore.ts` becomes the single source of truth. Define the complete formula (including explicit `overdue` and `due-proximity` terms), then **regenerate every `priorityScore` and `priorityReasons[]` in `items.json` from that function.** No hand-authored scores. Unit-test that each item's reasons sum to its score.

**D2. The priority formula exists in two different versions.**
`PROPOSAL.md §6` omits the `spillover_flag×15` term; `SEED-DATA-PLAN.md` includes it. One canonical formula only — in code, referenced by both docs.

---

### 🟠 High — visible inconsistencies a judge could spot

**D3. The demo "today" drifts by 1–2 days.**
The blocker arc ends **Day 7 = Oct 7**. But relative-date reasons are computed as if today were Oct 8–9: `req-002` (due Oct 9) says "Due in 1 day", `req-005` (due Oct 10) says "Due tomorrow". From Oct 7 those are 2 and 3 days out.
**Fix:** Pick ONE frozen demo clock (recommend **`DEMO_TODAY = 2026-10-08`, sprint day 8** — one day after the blocker resolves, so the board is at rest and all due-date math is positive) and compute every relative date from it. Put it in one constant.

**D4. The AI cache leaks a fabrication note.**
`ai-cache.json → meeting-extraction → dueDateReason` reads: *"...Adjusted to Oct 3 for sprint tension"* and contradicts itself ("Wednesday = Oct 8. Actually... Oct 7"). If this string is ever rendered, it exposes that the data was staged.
**Fix:** Remove the meta-reasoning. Keep a clean, defensible `evidenceText` only. Decide the real due-date rule ("end of Wednesday" from a Thu Oct 1 call → Oct 7) and apply it consistently, or change the transcript wording so Oct 3 is justified.

**D5. Update count wrong in the proposal.**
`PROPOSAL.md §6` says **"58 daily update records"**. `updates.json` has **28** (req-001 ×7, req-002 ×7, req-003 ×7, act-001 ×4, act-002 ×3). Fix the proposal to 28, or add the missing records (see D9).

**D6. Blocker-visibility metric tells two stories.**
Proposal §3 target = "under 15 min"; seed + demo = "4 hours" / "under 4 hrs". And the arc actually spans **Day 3 signal → Day 6 formal raise** — "surfaced in hours, not days" is contestable because the *formal* raise took 3 days.
**Fix:** State it precisely and honestly: *"AI flagged the hidden blocker on Day 3 — the same day — vs 3.2 days to surface in Sprint 1."* Detection is the hours-not-days win; don't conflate it with resolution. Align one number everywhere (recommend "same-day detection" + "~4 hrs to acknowledge").

---

### 🟡 Medium — polish and coherence

**D7. Status vs. priority-reason contradictions.**
`act-002` status is `in_progress` but its reasons say "Overdue by 3 days" (due Oct 4). Either set status to `overdue` or drop the overdue reason. Make status a function of dueDate + the frozen clock, not a separate hand-set field.

**D8. Two "Must" features are built but never demoed.**
Spillover tracking and Decision tracking are both "Must" in scope, but the 5-beat demo script shows neither. Either (a) add a 10-second board moment that points at the spillover badge (REQ-004) and a confirmed decision (DEC-001), or (b) down-rank them to "Should." Recommend (a) — it's nearly free and proves breadth.

**D9. Update coverage is thin for non-hero items.**
`act-001` has no Day 5–7 updates (it resolves off-screen); `act-002` skips days 2 and 4; `req-004`/`req-005` have zero updates. Fine for the hero arc, but the board's "update overdue" logic needs at least a defined *expected* cadence per item so empty ≠ broken. Define the rule: an item in an active status is "update-overdue" if no update on the current demo day.

**D10. Baseline numbers differ between proposal and seed.**
Proposal §3 examples: 25 min/day, 70%. Seed: 28 min, 68%. The proposal says its numbers are "examples to be replaced," so this is minor — but the demo shows the seed numbers, so make §3 match the seed (28 / 68) to avoid a visible discrepancy.

---

### 🟢 Low — worth a line

- **D11.** `req-002` dependsOn `s1-001, s1-002` (both Done) — fine, but the board should visually distinguish "depends on a *done*" vs "depends on an *open*" item, or the dependency badge misleads.
- **D12.** No `Member` persona identity in the prototype — the demo needs a way to "be Marcus" then "be Sarah" (see new requirement R4 below).
- **D13.** Accessibility: the clarity checker flags WCAG AA as a gap in `req-002` — the app itself must then meet AA, or we undercut our own point. Bake it into the design flows.

---

## 3. What's missing — additions to consider

| # | Addition | Why it strengthens the pitch |
|---|---|---|
| **A1** | **Priority score = pure, tested function** with a visible "how this is calculated" popover | Turns "explainable" from a claim into a demonstrable feature. Judges love a number they can audit. |
| **A2** | **Frozen demo clock + "Demo: Sprint 2, Day 8" banner** | Makes every relative date correct and tells judges the state is deliberate, not stale. |
| **A3** | **Persona switcher** (Marcus ↔ Sarah ↔ Manager) in the top bar | Lets the demo show the *member* mobile experience and the *facilitator* triage view from one build — and stands in for the Teams/Slack bot without building it. |
| **A4** | **AI confidence + "cached" badge shown in the UI** | Honest, on-brand for AI governance, and quietly covers us if a live call is swapped for cache on the day. |
| **A5** | **One-line audit trail on AI actions** ("extracted from meeting notes · confirmed by Sarah · Oct 1") | Directly evidences the "human in the loop" governance story. |
| **A6** | **Empty / loading / error / offline states designed up front** | The demo-safety story (cache-first) only lands if the "AI is thinking…" and "running offline on cached data" states are real, visible UI. |
| **A7** | **"Before/after" framed as one toggle on the live board**, not just a separate metrics page | Shows the improvement *in context* instead of as an abstract table. |

---

## 4. Strategic decision this surfaces (resolved, not blocking)

The proposal says *"team members should rarely open the dashboard; the agent [Teams/Slack bot] comes to them."* You've now chosen a **mobile-first responsive web app**. These reconcile cleanly:

> **The mobile-first web app IS the member surface for the prototype** — the stand-in for the bot. On a phone it behaves like the "come to me" experience (a member opens it, sees only their items, gives an update in two taps). On desktop the same app widens into the facilitator's triage dashboard. The Teams/Slack bot stays on the roadmap as the *channel*, not a different product.

This is the premise the UI flows are built on. No rebuild later — the responsive web app and the future bot both call the same `ticketSource` + AI adapter.

---

## 5. Phased plan

Each phase has a clear exit gate. **We are finishing Phase 0 and starting Phase 1 (design flows) now.**

### Phase 0 — Data & formula integrity *(must close before building screens)*
- [ ] Write `lib/priorityScore.ts` as the single source of truth (D1, D2, A1)
- [ ] Regenerate all `priorityScore` + `priorityReasons[]` in `items.json` from it; unit-test reasons sum to score
- [ ] Set `DEMO_TODAY = 2026-10-08` constant; derive all statuses & relative dates from it (D3, D7, A2)
- [ ] Clean `ai-cache.json` of fabrication notes; fix due-date rule (D4)
- [ ] Reconcile proposal numbers: update count 28, baseline 28/68, one blocker-visibility story (D5, D6, D10)
- [ ] Define "update-overdue" cadence rule (D9)

### Phase 1 — Design flows *(this is what we do next → UI-FLOWS.md)*
- [ ] Lock personas, information architecture, navigation (mobile + desktop)
- [ ] Define every flow: entry → steps → states → exit
- [ ] Define the responsive strategy (mobile-first, breakpoints, reflow rules)
- [ ] Define cross-cutting states (loading / cached / error / empty / offline) and the AI-action pattern (A4, A5, A6)
- [ ] Define the design tokens (navy/teal palette, type scale) and the component inventory
- **Exit gate:** you approve the flows and the screen inventory. Then we build wireframes/prototype.

### Phase 2 — Foundation layer (non-UI)
- [ ] `lib/repository.ts` — `ticketSource` interface + `JsonSource`
- [ ] `lib/ai-adapter.ts` — cache-first, live fallback, typed responses
- [ ] Next.js scaffold, layout shell, design tokens in Tailwind config

### Phase 3 — Core screens
- [ ] Priority board (triage) + item detail + update timeline (desktop + mobile)
- [ ] Member update flow (the mobile-first heart)
- [ ] Spillover + decision badges on the board (D8)

### Phase 4 — AI features
- [ ] Meeting inbox → extraction → confirm
- [ ] Hidden-blocker detection + facilitator alert (the centerpiece arc)
- [ ] Requirement clarity checker + apply rewrite

### Phase 5 — Recognition, metrics, polish
- [ ] Team & recognition (points, badges, kudos)
- [ ] Metrics before/after (and the in-context toggle, A7)
- [ ] Empty/error/offline states, accessibility pass (D13), rehearsed demo path, slides

---

## 6. New / revised requirements captured

- **R1.** Priority score is computed, never stored by hand; UI exposes a "how this is calculated" popover.
- **R2.** One frozen demo clock drives all dates and statuses; a visible "Demo day" banner.
- **R3.** Every AI output shows source + confidence + a "cached/live" indicator and a human-confirm step.
- **R4.** A persona switcher (Member / Facilitator / Manager) is a first-class part of the shell.
- **R5.** The app is one responsive codebase: member-mobile and facilitator-desktop are views of it, not separate apps.
- **R6.** Loading / cached / error / empty / offline are designed states, not afterthoughts.
- **R7.** The app itself meets WCAG AA (the standard its own clarity checker enforces).
