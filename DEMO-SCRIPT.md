# Beacon — Presenting the Prototype

> **Audience:** hackathon judges / stakeholders · **Length:** about 6 minutes
> **State:** Sprint 2, Day 8 of 10 (frozen). Start from a clean session:
> *Agent → Your data → Clear all*, persona **Sarah · Facilitator**, page **Overview**.
> **Nothing can fail over the network:** the prototype makes no AI or tracker calls —
> every finding is computed from the predefined data in the browser.

## Frame it in one breath (20 sec)

> *"This is a working prototype for one team on predefined data. It isn't connected to
> Jira or mail and has no login yet — that's the plan, and I'll show it at the end.
> Everything else you'll see is computed and works end to end, and a person stays in
> control of every action."*

## 1. The roll-up Jira hides (60 sec) — Overview, then Delivery

1. Read the red headline: **REQ-001 cannot be delivered** — blocked 2 days, due today.
2. Point at the second sentence: **REQ-027 still shows "in progress" but waits on it.**
   > *"The tracker shows that story as green. Beacon follows the dependency links."*
3. Click a donut slice → the board filters. Click **Delivery** → *Tracker says / Beacon says*, side by side.

## 2. A score you can audit (45 sec) — Board

1. REQ-001 tops the board at **98**; the chips beside it add up to exactly 98.
2. Open **How scoring works**: 14 named rules.
   > *"No number is typed in by hand. Change the data and the score changes, with the reason."*
3. Point out ACT-002: *past due 4 days, status still "in progress"* — its own update
   says the UAT session was booked on day 5. A real hygiene finding.

## 3. The blocker was in the words first (45 sec) — Item REQ-001

1. Timeline, day 3: *"Struggling… might need someone… not sure how to proceed."* The
   inline check reads it as blocked: phrase weights add up to 11 against a threshold of 4.
2. Day 6: the formal blocker. **3 days of lag** — the gap Beacon closes.
3. Right column: the matched runbook and James, who wrote it and is already pairing.

## 4. The live loop — ask the author first (100 sec) — switch to Marcus

1. **My work**: the agent asks about **REQ-004** (no update this sprint).
2. **Answer with an update** and type:
   *"Still waiting on the email provider sandbox access. Not sure how to proceed — might need someone to help."*
   The box turns amber **as you type**: Beacon will ask *you* first.
3. **Post update** → *"Are you blocked?"*, visible only to Marcus, with the exact change previewed.
4. Click **Open REQ-004**: the agent's finding is there, **Hidden blocker · confidence 88%**.
   Expand **How 88% was computed** (detector baseline 40 + match strength 8 × 6).
   > *"Confidence isn't a typed-in number. It has a basis, and the team's accept/dismiss record recalibrates it."*
5. At the top of the item, click **Yes, raise it**: status turns *Blocked* and the score re-ranks.
   > *"The person who wrote it decides. Nobody else was alerted until he answered."*

## 5. The facilitator decides; everything is logged (60 sec) — switch to Sarah

1. **Agent**: REQ-004 is now *Blocked*, and the **tracker outbox** holds the approved
   change, marked as simulated.
2. Filter to **Status out of date**, pick a reason on one signal and click **Dismiss**. On another
   signal, **Approve** a proposed comment.
3. **Activity log**: every decision, by whom, in order. Click **undo** on one, and the screen reverts.

## 6. Is the agent earning trust? (40 sec) — Insights

1. **Adoption**: accepted vs dismissed, the accept rate per signal type, dismiss
   reasons — per team and per type, never per person.
   > *"Dismissals retune the rules. Three or more decisions on a signal type feed its confidence."*
2. **Root cause**: external dependency and technical gaps, quoted from what people wrote.
3. **Impact**: every figure says where it comes from: *computed* or *recorded by the team*.

## 7. Privacy by design (20 sec) — switch to Dana · Manager

Read-only banner on the Agent page; **People** isn't in the manager's nav, and a member
link shows *Member views stay with the team*.

## Close — the roadmap (20 sec)

> *"Phases 1 and 2 are what you just saw: an honest engine, and a person in control
> end to end. Next comes the live agent on WSL with a shared store and real history, then a
> one-team pilot on Jira or Azure DevOps with single sign-on and a Teams bot, and then
> multi-team roll-up."* (README → Roadmap)

## If something goes wrong

| Situation | Do this |
|---|---|
| A previous run left decisions behind | *Agent → Your data → Clear all* |
| Wrong persona | Persona menu, top right |
| Browser storage blocked (private window) | Decisions still work for the page view; mention that the live store is server-side (phase 3) |
| No network | Use `npm run dev` locally — the whole app runs offline |

## Pitch one-liner (for Q&A)

> *"Beacon reads what your team already writes, finds the blocker before anyone raises
> it, explains every number, and never acts without a person's say-so."*
