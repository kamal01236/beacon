# Beacon — Seed Data Plan

> **Document type:** Prototype planning reference  
> **Project:** Beacon · Flo Hack · Agile Practices track  
> **Status:** v1.0 · October 2026  
> **See also:** [PROPOSAL.md](./PROPOSAL.md), [DEMO-SCRIPT.md](./DEMO-SCRIPT.md)

---

## Purpose

The prototype runs on JSON seed data in `/data`. There is no live Jira connection. Every AI feature — extraction, clarity scoring, priority ranking, blocker detection — must have a believable dataset to act on. This document specifies exactly what data exists, why each record exists, and what demo scenario it powers.

**Rule:** Every record in the seed data exists to support at least one of the five prototype screens or one of the three AI demo scenarios. No orphaned records.

---

## Data files

| File | Records | Purpose |
|---|---|---|
| `data/members.json` | 6 | Team members with points, badges and avatar colours |
| `data/sprints.json` | 2 | Sprint 1 (closed, baseline) + Sprint 2 (active) |
| `data/items.json` | 20 | 8 Sprint 1 items (closed) + 12 Sprint 2 items (active) |
| `data/updates.json` | 28 | Daily stand-up updates for Sprint 2 (days 1–7, key items only) |
| `data/stories.json` | 4 | User story records with clarity scores and AI rewrites |
| `data/meetings.json` | 1 | Apex Financial meeting transcript (paste-ready) |
| `data/kudos.json` | 4 | Peer recognition entries (Sprint 1 and 2) |
| `data/ai-cache.json` | 5 scenarios | Pre-computed AI responses for demo safety |

---

## Team

**Client:** Apex Financial Services · **Project:** Client Portal Modernization  
**Sprint 2 dates:** Oct 1–10, 2026 (demo state: day 7)

| ID | Name | Role | Points | Badges |
|---|---|---|---|---|
| m1 | Sarah Chen | Delivery Manager / Facilitator | 245 | on-time-10, story-crafter |
| m2 | James Patel | Tech Lead | 310 | blocker-buster, on-time-10, story-crafter |
| m3 | Priya Sharma | Frontend Developer | 280 | on-time-10, early-adopter |
| m4 | Marcus Williams | Backend Developer | 195 | early-adopter |
| m5 | Aisha Nkosi | QA Engineer | 260 | on-time-10, blocker-buster, early-adopter |
| m6 | Tom Bradley | Business Analyst | 220 | on-time-10, story-crafter |

---

## Agile coverage map

| Agile practice | Data that covers it | Screen |
|---|---|---|
| Sprint planning | 12 items with owners, priorities, due dates | Priority Board |
| Daily stand-up | 7 days of updates (on-time, late, missing) | Priority Board, Item Detail |
| Blocker — hidden, then detected | REQ-001: 3 days vague updates then silence | Priority Board (red badge) |
| Client meeting → action items | Apex meeting transcript + extraction result | Meeting Inbox |
| Backlog refinement | 4 stories at scores 2, 3, 5, 8 out of 10 | Item Detail (clarity checker) |
| Sprint review / velocity | Sprint 1 metrics as before-baseline | Metrics strip |
| Spillover tracking | REQ-004 and ACT-003 from Sprint 1 | Priority Board (amber badge) |
| Risk monitoring | RSK-001 (rate limits), RSK-002 (UAT resource) | Priority Board |
| Decision tracking | DEC-001 (Stripe), DEC-002 (deploy window) | Priority Board |
| Recognition | Points, 3 badge types, 4 kudos entries | Team & Recognition |

---

## Sprint 1 — closed (Sep 17–26, 2026)

**Purpose:** Historical baseline for the metrics strip. Provides the "before" numbers.

| ID | Title | Type | Owner | Final Status | Notes |
|---|---|---|---|---|---|
| s1-001 | User authentication (SSO) | Requirement | James Patel | Done | On time |
| s1-002 | Dashboard landing page layout | Requirement | Priya Sharma | Done | On time |
| s1-003 | Define data retention policy (90-day) | Decision | Sarah Chen | Confirmed | Oct 19 |
| s1-004 | Set up CI/CD pipeline (GitHub Actions) | Action | James Patel | Done | On time |
| s1-005 | Update API documentation | Action | James Patel | **Spillover** | 50% done → ACT-003 |
| s1-006 | Notification service | Requirement | Marcus Williams | **Spillover** | SSO dependency delay → REQ-004 |
| s1-007 | UAT environment access blocked | Risk | *Unowned 3 days* | Resolved | **BEFORE reference:** sat unowned 3.2 days. Baseline comparison story. |
| s1-008 | Analytics SDK licence cost concern | Risk | Tom Bradley | Cancelled | Open-source alternative chosen |

**Sprint 1 metrics (baseline):**

| Metric | Value |
|---|---|
| Stand-up prep time | 28 min/day |
| Participation rate | 68% |
| Blocker visibility | 3.2 days average |
| Update quality | 52% |
| Items with owner | 75% |
| Stories ready (> 6/10) | 25% |

*These are illustrative estimates, labelled "estimated baseline" on the metrics screen. Replace with real measurements in a pilot.*

---

## Sprint 2 — active, day 7 of 10 (Oct 1–7, 2026)

### Items

| ID | Title | Type | Owner | Status | Priority Score | Demo role |
|---|---|---|---|---|---|---|
| **req-001** | Payment gateway integration (Stripe) | Requirement | Marcus Williams | **Blocked** | **91** | Main blocker arc. Clarity 3/10. |
| req-002 | User dashboard redesign | Requirement | Priya Sharma | In Progress | 55 | Good story (8/10). QA final check. |
| req-003 | Export to PDF | Requirement | James Patel | In Progress | 48 | Medium story (5/10). Near done. |
| **req-004** | Notification service | Requirement | Marcus Williams | **Spillover** | **78** | Spillover. Clarity 2/10. Marcus overloaded. |
| req-005 | Audit log feature | Requirement | Aisha Nkosi | Not Started | 22 | Backlog item, not yet in play. |
| **act-001** | Send API credentials to Apex | Action | Sarah Chen | **Overdue** | **84** | 4 days overdue. Client-delay risk. Extracted from meeting. |
| act-002 | Schedule UAT session | Action | Tom Bradley | In Progress | 42 | Extracted from meeting. UAT booked Oct 13. |
| act-003 | Update API documentation | Action | James Patel | Spillover | 50 | Spillover from Sprint 1. |
| dec-001 | Payment provider: Stripe confirmed | Decision | Sarah Chen | Confirmed | 10 | Extracted from meeting. |
| dec-002 | Deploy window: Fri 10 Oct 6pm | Decision | Sarah Chen | Confirmed | 10 | Extracted from meeting. |
| rsk-001 | Stripe API rate limits | Risk | James Patel | Monitoring | 63 | Feeds into req-001 priority score. |
| rsk-002 | UAT resource availability | Risk | Tom Bradley | Monitoring | 34 | Linked to act-002. |

### Priority score formula (client-side, no AI)

```
score = (blocker_age_days × 15)
      + (priority_value × 10)       // high=3, medium=2, low=1
      + (dependent_count × 8)
      + (days_to_due_close_penalty × 5)
      + (no_owner_penalty × 20)
      + (client_impact_flag × 10)
      + (spillover_flag × 15)
```

Every score displays a `reasons[]` array next to it so users can see exactly why an item is ranked where it is and override if needed.

---

## Sprint 2 metrics (so far, day 7)

| Metric | Sprint 1 baseline | Sprint 2 so far | Target |
|---|---|---|---|
| Stand-up prep time | 28 min/day | 9 min/day | < 10 min |
| Participation rate | 68% | 87% | 90% |
| Blocker visibility | 3.2 days | 4 hours | < 4 hrs |
| Update quality | 52% | 81% | 85% |
| Items with owner | 75% | 100% | 100% |
| Stories ready (> 6/10) | 25% | 50% | 80% |
| AI extraction acceptance | n/a | 92% | > 85% |

---

## Demo story arc 1 — The hidden blocker (REQ-001)

This is the centrepiece. Marcus's updates contain escalating distress signals the tool catches. The facilitator would have missed it until the next stand-up — two days away.

| Day | Date | What happened | System response |
|---|---|---|---|
| 1 | Oct 1 | "Started Stripe SDK research." | Normal. No signal. |
| 2 | Oct 2 | "Running into some OAuth config issues but making progress." | Soft signal. No alert. |
| **3** | **Oct 3** | **"Struggling with webhook signature verification. Might need someone. Not sure how to proceed."** | **AI detects: blockerSignal=true. Confidence: high. Keywords: "struggling", "might need someone", "not sure how to proceed".** |
| 4 | Oct 4 | No update | Overdue flag. Priority rises to 71. |
| 5 | Oct 5 | No update | 2nd missing day. AI alert fires to Sarah. Priority 84. |
| 6 | Oct 6 | Sarah sends Request Update. Marcus responds: "Blocked — HMAC verification, Stripe docs contradict SDK." | Blocker formally raised. James assigned. |
| 7 | Oct 7 | "James and I pairing. Identified the issue: bodyParser consuming raw body. Estimated fix: 4 hours." | Blocker owned, ETA set. Priority stays at 91 (still blocked) but healthy state — owned + ETA. |

---

## Demo story arc 2 — Meeting notes → extracted items

Paste the Apex Financial meeting notes (180 words, stored in `meetings.json`) into the Meeting Inbox screen. The AI extracts 5 items:

- **ACT-001** — Action: Send API credentials (Sarah, due Oct 3, client-delay risk)
- **ACT-002** — Action: Schedule UAT session (Tom, due Oct 4)
- **DEC-001** — Decision: Stripe confirmed
- **DEC-002** — Decision: Deploy window Friday 6pm
- **RSK-001** — Risk: Stripe rate limits (James to monitor)

User reviews each extracted item, edits if needed, confirms. All 5 save to the board.

---

## Demo story arc 3 — Requirement clarity

| Story | Clarity score | Verdict | Demo purpose |
|---|---|---|---|
| REQ-001 (Payment gateway) | **3/10** | Not ready | PRIMARY — AI rewrites with 6 ACs, 3DS edge case, PCI note, dependencies |
| REQ-004 (Notification service) | **2/10** | Not ready | SECONDARY — title-only story; AI produces full story from scratch |
| REQ-003 (Export to PDF) | **5/10** | Needs work | Medium — AI adds 3 missing edge cases |
| REQ-002 (User dashboard) | **8/10** | Ready | REFERENCE — AI flags only one gap (accessibility), no rewrite |

---

## AI cache scenarios

All five AI interactions have pre-computed responses in `data/ai-cache.json`. The `ai-adapter` checks the cache before making a live API call. This protects the demo against network or API issues.

| Cache key | Scenario |
|---|---|
| `meeting-extraction-mtg001` | Apex meeting notes → 5 extracted items |
| `clarity-check-req001-vague` | REQ-001 story → score 3/10, 6 gaps, full rewrite |
| `clarity-check-req002-good` | REQ-002 story → score 8/10, 1 minor gap, no rewrite |
| `update-structure-req001-day3` | Marcus Day 3 free-text → structured update with blockerSignal=true |
| `blocker-explanation-req001` | REQ-001 blocker state → facilitator alert with suggested actions |

---

## Initial files to create before building

- [ ] `data/members.json` ✓
- [ ] `data/sprints.json` ✓
- [ ] `data/items.json` ✓
- [ ] `data/updates.json` ✓
- [ ] `data/stories.json` ✓
- [ ] `data/meetings.json` ✓
- [ ] `data/kudos.json` ✓
- [ ] `data/ai-cache.json` ✓
- [ ] `lib/repository.ts` — `ticketSource` interface + `JsonSource` implementation
- [ ] `lib/priorityScore.ts` — pure priority score function with `reasons[]`
- [ ] `lib/ai-adapter.ts` — LLM adapter: cache-first, live fallback, typed responses
- [ ] `DEMO-SCRIPT.md` ✓ (see [DEMO-SCRIPT.md](./DEMO-SCRIPT.md))
