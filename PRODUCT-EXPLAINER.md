# Beacon — The Plain-Language Explainer

> **Written for:** anyone who is not technical — sponsors, managers, judges, new team members.
> **What this is:** short ways to explain Beacon, then a page-by-page tour sized for a
> **30-minute walkthrough**. It describes the **current prototype** only. Nothing here is
> promised that the prototype doesn't already do; what comes later is kept in its own section.

---

## 1. The pitch lines

**One line (use this first):**
> Beacon reads what your team already writes, spots a blocker before anyone raises it,
> explains every number it shows, and never acts without a person's say-so.

**Shorter, for a slide title:**
> The assistant that notices trouble early — and always asks first.

**For a sponsor (outcome-first):**
> Teams lose days because "stuck" is said in passing and only noticed later. Beacon closes
> that gap, so problems reach the right person days sooner, with no extra reporting.

**For a team member (what's in it for me):**
> Write your daily update the way you normally would. Beacon quietly checks whether you
> sound stuck, asks *you* first, and finds you the right person and the right runbook.

---

## 2. Explain it in 3–4 lines — four formats

Pick the one that fits the person in front of you.

### Format A — The everyday analogy
Think of a good team lead who reads every update and notices when someone sounds worried.
Beacon does that for the whole team, every day, and never gets tired. It doesn't replace
your task tracker — it sits on top of it and says, *"this one needs a conversation today,
and here's why."* It only ever suggests; people decide.

### Format B — Problem, then answer
**The problem:** a task shows "in progress" for days while the person is quietly stuck.
Nobody knows until it's late.
**The answer:** Beacon reads the words in daily updates, notices the stuck signs early,
asks the person first, then shows the team exactly what needs attention and why.
**The result:** blockers are found in days, not weeks — and nobody is surprised at the deadline.

### Format C — Three promises
1. **Early** — it spots trouble from how people write, before anyone formally reports it.
2. **Honest** — every score has a visible reason; nothing is a black box.
3. **Respectful** — it asks the author first, never scores individuals, and changes nothing without approval.

### Format D — The 20-second elevator version
"Your task tracker tells you what people *say* the status is. Beacon tells you what's
*actually* going on — it reads between the lines of daily updates, flags what's at risk
and why, and leaves every decision to your team."

---

## 3. The pains it addresses (the whole product in one table)

| The pain people feel today | What Beacon does about it |
|---|---|
| "It said *in progress* — we found out it was stuck a week later." | Reads update wording; flags a hidden blocker on the day it appears. |
| "Everything is green, yet the release is at risk." | Follows dependency links: a task waiting on a blocked one is shown as at risk. |
| "Which of our 30 tasks should we talk about first?" | One ranked list; each score is the sum of named reasons you can read. |
| "I don't trust a number I can't explain." | No hand-typed scores. Every figure shows where it came from. |
| "Another tool that watches me." | No individual scores or rankings. Asks the author first. Managers see team-level only. |
| "AI that changes things behind our back." | Nothing reaches the tracker unless a person approves; every decision can be undone. |
| "Stand-ups and status chasing eat our time." | The brief and the "who's quiet" view replace the chasing. |
| "Is the AI even any good?" | Tracks accept vs. dismiss per type of finding, and tunes itself to the team. |

---

## 4. The 30-minute walkthrough — page by page

The prototype has **one team, ~100 predefined work items, frozen at Sprint 2, Day 8 of 10**.
It is not connected to Jira or email and has no login — that is deliberate and stated up front.
Everything else is computed and works end to end.

**Suggested timing (30 min):**

| # | Page | Minutes |
|---|---|---|
| 1 | Overview | 4 |
| 2 | Board (priority score) | 4 |
| 3 | Item detail | 4 |
| 4 | My work + Get help (team member) | 5 |
| 5 | Agent (facilitator decides) | 5 |
| 6 | Delivery roll-up | 2 |
| 7 | Team status | 1 |
| 8 | Insights | 2 |
| 9 | Retro | 1 |
| 10 | Manager view (privacy) | 1 |
| 11 | Inbox, My trends | 1 |

Prefer a 10-minute version? Do **1 → 3 → 4 → 5 → 10** only.

> **Screen tip:** press **Ctrl-K** (or **/**) on any page to jump anywhere. The sun/moon
> button switches light and dark.

---

### Page 1 — Overview (the morning view)
**Who:** facilitator (Sarah). **Minutes:** 4.

**What it shows**
- A headline in plain English, e.g. *"REQ-001 cannot be delivered as things stand… REQ-027 still shows 'in progress' but waits on it."*
- Six tiles: active, needs attention, blocked, overdue, spillover, done — each one opens the items behind it.
- Status mix (donut), burndown, velocity, a **daily brief**, today's stand-up summary, and a team pulse.

**The pain it helps**
Today someone has to open the tracker, filter, and *guess* what matters. The tracker's own
summary says the dependent story is green.

**What you achieve**
In 30 seconds the facilitator knows the one thing to act on today and why. The headline is
computed, not typed in.

**Say this:** *"The tracker shows that story as green. Beacon follows the dependency links."*

**Point out:** the burndown draws only real days — Beacon doesn't invent future numbers.

---

### Page 2 — Board (the priority list)
**Who:** facilitator and members. **Minutes:** 4.

**What it shows**
- Every item ranked by an **attention score**. Next to each score are small chips (e.g. *Priority: high +20, Blocked +30, Due today +10*) that add up to exactly that number.
- A **How scoring works** panel listing the 14 named rules.
- Filters (reached from the Overview tiles).

**The pain it helps**
Priority lists are usually gut-feel, or a number nobody can explain. People argue about the list instead of the work.

**What you achieve**
A ranked list the team can audit. Change the data and the score changes, with the reason.
It also catches quiet hygiene problems — e.g. a task five days overdue whose own update says the meeting was already booked.

**Say this:** *"No number is typed in by hand."*

---

### Page 3 — Item detail (one task, fully explained)
**Who:** everyone. **Minutes:** 4.

**What it shows**
- Title, owner, due date, status, and the score with its reasons.
- A **timeline of updates** with the agent's reading of each: on day 3 *"Struggling… not sure how to proceed"* was read as blocked; the formal blocker was raised on day 6 — **a three-day lag**.
- What the agent found, with a **confidence figure and how it was computed**, plus *Accept / Dismiss / Snooze*.
- The matching **runbook** and a **suggested helper** (the person who wrote it, already pairing).

**The pain it helps**
The story of "how did we end up here" is scattered across chat and memory. Help is found by luck.

**What you achieve**
One page that tells the whole story, shows the gap Beacon closes (three days here), and
points to the fix.

**Say this:** *"Confidence isn't a typed-in number. It has a basis."*

---

### Page 4 — My work and Get help (the team member's day)
**Who:** member (Marcus). **Minutes:** 5. *Switch persona from the top-right menu.*

**What it shows**
- **My work:** "Good morning, Marcus" — my items, how many are blocked, and any **question the agent has for me** (e.g. *REQ-004 has had no update in 7 days — are you blocked?*).
- Posting an update: as you type, a **live language check** shows if the wording reads as blocked, in plain terms.
- **Get help:** the right runbook and the right person for a blocked item.

**The pain it helps**
Updates feel like admin. People under-report being stuck, and the first person asked is
often the wrong person.

**What you achieve**
Posting an update takes a minute and *gets you something back*. If you sound stuck, **only
you** are asked ("Are you blocked?") — nobody else is alerted until you answer. *Yes* raises
the blocker with an exact preview; *No* drops it.

**Say this:** *"The person who wrote it decides."*

**Live demo:** type *"Still waiting on the sandbox access. Not sure how to proceed — might need someone to help."* The box turns amber as you type.

---

### Page 5 — Agent (where the facilitator decides)
**Who:** facilitator. **Minutes:** 5.

**What it shows**
- **Last run:** items scanned, open signals, awaiting answers, proposals to review, and what data it used.
- **Questions the agent is asking** (re-asked each daily run until answered).
- **Findings** by type — hidden blocker, blocked, cannot deliver, overdue, status out of date, missing update, at risk — each with evidence, source and confidence.
- **Proposed tracker changes** with an exact preview. *Approve* puts them in a **tracker outbox** (simulated in the prototype).
- **Activity log** with **Undo** on every entry, and a **Your data** panel (export / delete).

**The pain it helps**
"AI" that acts silently is a non-starter for most teams. Findings without a way to say
"that's wrong" go stale.

**What you achieve**
The agent proposes; people decide. Every decision is recorded, visible, and reversible —
and after each one a small confirmation appears with **Undo** on it.

**Say this:** *"The way back is never more than one click from where you acted."*

**Live demo:** Approve one proposal, Dismiss another with a reason, Undo one.

---

### Page 6 — Delivery roll-up (the truth behind the green)
**Who:** facilitator and manager. **Minutes:** 2.

**What it shows**
Each deliverable twice: **Tracker says** vs. **Beacon says** — computed from blockers, dependency links and update wording.

**The pain it helps**
Roll-ups built from status labels look healthy right up until they don't.

**What you achieve**
A manager sees real delivery risk — including risk *created by a dependency* — without reading 30 tickets.

---

### Page 7 — Team status
**Who:** facilitator. **Minutes:** 1.

**What it shows**
Who has work in flight, who has posted, who is quiet, and where help is needed — **no scores, no ranking**.

**The pain it helps**
Chasing people for updates. Also the fear that "visibility" means surveillance.

**What you achieve**
Quiet people are noticed kindly and early, without a leaderboard.

---

### Page 8 — Insights (are we getting better, and do we trust the agent?)
**Who:** facilitator and manager. **Minutes:** 2. Four views:

| View | What it answers |
|---|---|
| **Root cause** | Where blockers come from (external dependency, technical gap, unclear requirement, capacity) — quoted from what people wrote. |
| **Trends** | How things are moving over time. |
| **Impact** | Before/after figures, each labelled **computed** or **recorded by the team**, so nothing looks more certain than it is. |
| **Adoption** | Findings accepted vs. dismissed, accept rate **per type**, dismiss reasons — per team, **never per person**. |

**The pain it helps**
"Is this tool actually helping?" is usually answered with opinion.

**What you achieve**
A measured answer. If one kind of finding is dismissed too often, the page says that rule
needs retuning — and those decisions feed back into the agent's confidence.

---

### Page 9 — Retro
**Who:** facilitator. **Minutes:** 1.

**What it shows**
Themes built from the sprint's blockers, wording, dependencies and spillover — each **with its evidence**. The team chooses which actions to adopt.

**The pain it helps**
Retros run on whoever remembers loudest.

**What you achieve**
A retro that starts from evidence, and an adopted-actions count that feeds adoption metrics.

---

### Page 10 — Manager view (privacy by design)
**Who:** manager (Dana). **Minutes:** 1.

**What it shows**
Overview, Agent, Delivery and Insights — **read-only**. There is **no People page** in the
manager's menu, and even the keyboard search won't open a person's page for them.

**The pain it helps**
The core fear: "this will be used to rank me."

**What you achieve**
Managers get team-level truth; people keep their privacy. Both can trust it.

**Say this:** *"Member views stay with the team."*

---

### Page 11 — Inbox and My trends (short mentions)
- **Inbox:** shows a *recorded* example of turning raw meeting notes into typed, owned items, confirmed by a person. Extracting from *new* notes needs the live agent (later phase).
- **My trends:** a member's own update streak — visible only to them, never ranked, and silence during a hard stretch isn't held against them.

---

## 5. How it is built to be trusted (for the "but is it safe?" question)

- **Reads work-item updates only** — never chat, email or calendars.
- **Asks the author first** when wording reads as blocked.
- **No individual scoring, no leaderboard.** Adoption is counted per team and per type.
- **Nothing is written to the tracker without approval**, and every decision can be undone.
- **Every score and confidence shows its working** — no black box.
- **Your data** panel: export or delete everything the prototype stores (it lives in your browser only).

---

## 6. What is real today, and what comes next

**Real in the prototype:** the computed score, the language detection, the computed and
self-tuning confidence, ask-the-author-first, approve-and-undo, adoption measurement, the
read-only manager view, light/dark, and the keyboard search.

**Deliberately not in the prototype:** connection to Jira / Azure DevOps, email or chat,
and login. Data is one team's predefined set; decisions are stored in your own browser.

| Phase | In plain words | Status |
|---|---|---|
| 1. Honest engine | Scores and findings are computed and explainable | Done |
| 2. Human in control | Approve, dismiss, undo, privacy, adoption measured | Done |
| 3. Live agent | Shared record for the whole team; runs on a schedule | Next |
| 4. One-team pilot | Connect to Jira / Azure DevOps, sign-in, a Teams bot | Planned |
| 5. Enterprise | Many teams, programme roll-up, audit, data residency | Planned |

---

## 7. Likely questions, short answers

| Question | Answer |
|---|---|
| Does it replace Jira? | No. It sits on top and adds what the tracker can't: reading the words, following dependencies, explaining priority. |
| Is it just a chatbot? | No. Findings are computed from rules you can read; the AI model arrives in phase 3, judged against the team's accept/dismiss record. |
| Will it be used to judge people? | Not by design: no individual scores, managers can't open member pages, adoption is per team. |
| What if it's wrong? | Dismiss it with a reason. That is counted, and it lowers that finding type's confidence. |
| What does it need from the team? | A daily update in their own words. Nothing extra to fill in. |
| What do we measure to know it works? | Days between "first sounded stuck" and "blocker raised" (3 days in the demo), accept rate per finding type, and how many people with work in flight post daily. |
