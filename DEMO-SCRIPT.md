# Beacon — Presenting the Prototype

> **Audience:** hackathon judges / stakeholders · **Length:** about 6 minutes
> **State:** Sprint 2, Day 8 of 10 (frozen). Start from a clean session: as
> **Sarah · Facilitator**, *Agent → Reset this instance* (*Clear this browser* on the
> static build), then page **Overview**. The reset leaves one row in the activity log
> saying it happened — that is deliberate, and §7 uses it.
>
> **Pick your build before you present:**
> - **Static (safest — recommended for the room).** The GitHub Pages deploy or
>   `BUILD_TARGET=pages npm run build`. There is no backend, so **nothing can fail over
>   the network**: no AI or tracker calls, every finding computed in the browser. Skip §4b.
> - **Server (`npm run local`).** Adds the real agent worker and, if a key is set, live
>   model calls. Everything below still works; §4b becomes available. If the model is
>   unreachable it silently falls back to the rule detector, so nothing breaks — it just
>   says which detector ran.

## Frame it in one breath (20 sec)

> *"This is a working prototype for one team on predefined data. It isn't connected to
> Jira or mail and has no login yet — that's the plan, and I'll show it at the end.
> Everything else you'll see is computed and works end to end, and a person stays in
> control of every action."*

## 0. Get anywhere in one keystroke (15 sec) — any screen

Press **Ctrl-K** (or **/**), type **blocked**: the blocked item and the board
view behind it, both live. Escape.
> *"Everything I'll show is one keystroke away, and it searches the real board,
> not a cached index."*

*(Optional, if the room is on a projector or someone asks: the sun/moon button
switches light and dark, and the one beside it tightens the density.)*

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

## 4b. The agent is a real process (40 sec) — Agent · *server build only*

1. **Agent → Agent runs → Run now.** It reports what actually ran: the detector, the
   model, how many items it scanned, how many model calls it made, and **how often the
   model disagreed with the rules**.
   > *"That disagreement count is how we'd judge a model before trusting it — the rules
   > stay the baseline, and if the model is down every item falls back to them."*
2. On any proposed comment, click **Draft with agent**: the model re-words the intent
   Beacon already decided, into the same box you then edit and approve.
   > *"The model phrases it. It never decides anything, and nothing is sent until approved."*

## 5. The facilitator decides; everything is logged (60 sec) — switch to Sarah

1. **Agent**: REQ-004 is now *Blocked*, and the **tracker outbox** holds the approved
   change, marked as simulated.
2. Filter to **Status out of date**, pick a reason on one signal and click **Dismiss**. On another
   signal, **Approve** a proposed comment. Each one raises a confirmation naming exactly what was
   recorded, with **Undo** on it.
   > *"The way back is never more than one click from where you acted."*
3. **Activity log**: every decision, by whom, in order. Click **undo** on one, and the screen reverts.

## 6. Is the agent earning trust? (40 sec) — Insights

1. **Adoption**: accepted vs dismissed, the accept rate per signal type, dismiss
   reasons — per team and per type, never per person.
   > *"Dismissals retune the rules. Three or more decisions on a signal type feed its confidence."*
2. **Root cause**: external dependency and technical gaps, quoted from what people wrote.
3. **Impact**: every figure says where it comes from: *computed* or *recorded by the team*.

## 7. Privacy, and the data policy (45 sec) — switch to Dana · Manager

1. Read-only banner on the Agent page; **People** isn't in the manager's nav, and a member
   link shows *Member views stay with the team*. Press **Ctrl-K**, type **marcus** — no person
   drill-down is offered either, so the shortcut can't route around the rule.
2. Scroll to **Your data**. It names where the record actually is, how many events it holds,
   and how many are past the 180-day window. Note what is *not* there: no "delete everything"
   button, and for Dana no reset at all.
   > *"The decision log is the audit trail, so it's append-only. A button that lets one person
   > truncate everybody else's record isn't a privacy feature. Retention is a schedule the
   > system applies — and it writes down what it removed, so a gap in the log is never
   > unexplained. An erasure request un-names the person instead of deleting the decision:
   > the trail survives, the identity doesn't."*
3. If asked whether anything can be deleted: the only destructive action is **Reset this
   instance**, it is the facilitator's demo reset rather than a privacy control, and the row
   at the top of the activity log is the last reset recording itself.

*(The retention sweep is real, not a claim: `npm run data:retain` reports what the policy
would drop, `data:retain:apply` drops it — worth running once before the room if someone asks.)*

## Close — the roadmap (20 sec)

> *"Phases 1 and 2 are what you just saw: an honest engine, and a person in control
> end to end. Next comes the live agent on WSL with a shared store and real history, then a
> one-team pilot on Jira or Azure DevOps with single sign-on and a Teams bot, and then
> multi-team roll-up."* (README → Roadmap)

## If something goes wrong

| Situation | Do this |
|---|---|
| A previous run left decisions behind | As Sarah: *Agent → Reset this instance* (facilitator-only, by design) |
| Wrong persona | Persona menu, top right |
| Browser storage blocked (private window) | Decisions still work for the page view; mention that the live store is server-side (phase 3) |
| The room's projector washes the screen out | Click the theme button in the header (light / dark), and the one beside it for density |
| No network | Use the static build locally (`npm run dev`) — it runs fully offline |
| A model call is slow or failing | Nothing to do: each item falls back to the rule detector and the panel says which ran. Or present the static build, which makes no calls at all |

## Pitch one-liner (for Q&A)

> *"Beacon reads what your team already writes, finds the blocker before anyone raises
> it, explains every number, and never acts without a person's say-so."*
