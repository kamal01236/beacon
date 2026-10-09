# Beacon — 3-Minute Demo Script

> **Audience:** Hackathon judges  
> **Duration:** 3 minutes (180 seconds)  
> **Demo state:** Sprint 2, Day 7. One active blocker. One overdue client action. One vague story.  
> **Fallback note:** All five AI calls are cached in `data/ai-cache.json`. If the live API is unreachable, the app uses cached responses silently — the demo flow is identical.

---

## Opening (15 sec)

> *"Today, delivery teams lose hours every week chasing stand-up updates, discovering blockers days late, and reworking vague requirements. We built Beacon to fix all three — in one screen, with one data model."*

Open the Priority Board. Do not narrate what is on screen — let the board speak.

---

## Beat 1 — The hidden blocker (45 sec)

**Screen:** Priority Board

1. Point to **REQ-001** at the top of the board — priority score 91, red BLOCKED badge.
   > *"This item has been blocked for two days. The developer never ticked 'blocked' — but look at what he wrote on Day 3."*
2. Click into REQ-001. Scroll to the update timeline. Show Day 3 update from Marcus:
   > *"Struggling with webhook verification. Might need someone to look at this. Not sure how to proceed."*
3. Point to the AI annotation next to it:
   > *"Beacon read that sentence — saw 'struggling', 'might need someone', 'not sure how to proceed' — and flagged it as a probable hidden blocker. Two days later, Marcus had still not updated. We sent a Request Update."*
4. Show Day 6 — Marcus's formal blocker response. Show James assigned as helper. Show Day 7 — pairing, 4-hour ETA.
   > *"Blocker surfaced in hours, not days. In Sprint 1, the same situation sat unnoticed for 3.2 days. That's the before/after we'll show at the end."*

---

## Beat 2 — Meeting notes → board items (40 sec)

**Screen:** Meeting Inbox

1. Paste the Apex Financial meeting notes into the text area (copy from `data/meetings.json → rawNotes`).
2. Click **Extract**.
3. Five items appear: two actions, two decisions, one risk — each with type, title, owner, due date, and a client-delay flag on ACT-001.
   > *"Nothing agreed in this call gets lost. Each item has an owner and a due date — extracted directly from the notes. The facilitator reviews and confirms."*
4. Click **Confirm All**. Items appear on the Priority Board.
   > *"ACT-001 is already overdue by 4 days — the board flags it immediately."*

---

## Beat 3 — Requirement clarity (35 sec)

**Screen:** Item Detail → REQ-001

1. Open REQ-001. Scroll to the Clarity Checker panel.
   > *"This story scored 3 out of 10. Here's why."*
2. Show the six missing items listed by AI: no acceptance criteria, no 3DS handling, no error states, no PCI scope.
3. Click **Show suggested rewrite**. The full rewrite appears — 6 acceptance criteria, edge cases, dependencies named.
4. Click **Apply to item**.
   > *"The developer edits it if they want, then applies. Story goes from 3 to 8 in one click. Fewer rework cycles."*

---

## Beat 4 — Before / after metrics (20 sec)

**Screen:** Metrics Strip

Show the side-by-side cards:

| Metric | Sprint 1 (Before) | Sprint 2 (After) |
|---|---|---|
| Stand-up prep | 28 min/day | 9 min/day |
| Participation | 68% | 87% |
| Blocker visibility | 3.2 days | 4 hours |
| Update quality | 52% | 81% |

> *"Same team, same project, two sprints. These numbers move because blockers are visible, updates are structured, and nothing falls through the cracks."*

---

## Close (5 sec)

> *"Nothing agreed with the client gets lost. Every blocker has an owner. Unclear requirements get fixed before they cause delay. That's Beacon."*

---

## Fallback options

| Situation | Fallback |
|---|---|
| AI extraction call fails | Cached response in `ai-cache.json` loads automatically. Demo is identical. |
| Clarity check call fails | Cached response for REQ-001 loads. Show score, missing list, rewrite. |
| Board data won't load | Open `data/items.json` directly to narrate the priority score logic. |
| Network is completely down | Demo all screens from pre-loaded state — the entire app runs offline on cached data. |

---

## Screens in order

1. Priority Board (start here — the live state tells the story)
2. Item Detail / Update Timeline (REQ-001)
3. Meeting Inbox (paste + extract)
4. Item Detail / Clarity Checker (REQ-001)
5. Metrics Strip

Do not navigate to Team & Recognition mid-demo unless a judge asks. Mention it as part of the roadmap slide.

---

## Pitch one-liner (for Q&A)

> *"We turn stand-ups from status reporting into blocker removal and make sure nothing agreed with the client gets lost — cutting prep time, surfacing blockers in hours instead of days, and fixing unclear requirements before they cause delay."*
