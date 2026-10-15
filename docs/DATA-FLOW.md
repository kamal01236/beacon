# Beacon — data flow

Written for a reviewer asking three questions: *what data moves, where does it
rest, and what crosses a boundary I should care about?* The diagrams for this
document are 6–11 in [DIAGRAMS.md](DIAGRAMS.md) (or open
[docs/diagrams/index.html](diagrams/index.html) and pick group 2).

| Level | Diagram | Answers |
|---|---|---|
| 0 | [Context DFD](DIAGRAMS.md#data-flow-level-0-context-dfd) | who exchanges data with Beacon, and which flows cross the trust boundary |
| 1 | [Processes and stores](DIAGRAMS.md#data-flow-level-1-processes-and-stores) | the nine processes, the four stores, and every arrow between them |
| 2 | [The detector](DIAGRAMS.md#data-flow-level-2--the-detector) | how update text becomes an explainable verdict |
| — | [How state is kept](DIAGRAMS.md#how-state-is-kept-base--decision-log) | why state is a snapshot plus a log, not a mutable table |
| — | [Privacy boundary](DIAGRAMS.md#privacy-boundary--what-leaves-what-never-does) | exactly what can leave the deployment |
| — | [Failure modes](DIAGRAMS.md#failure-modes-and-graceful-degradation) | what the flow degrades to when something is down |

---

## 1. The flows that cross the trust boundary

Level 0 labels these F1–F9. Only two of them deserve a security conversation.

| Flow | Direction | Payload | Notes |
|---|---|---|---|
| F1 | member → Beacon | update text, proposed status | free text; the detector reads it |
| F2 | Beacon → member | the question to answer, a suggested draft | nothing is posted without confirmation |
| F3 | facilitator → Beacon | accept / dismiss / approve, with a reason | becomes one event |
| F4 | Beacon → facilitator | ranked signals with evidence and confidence | |
| F5 | Beacon → manager | team-level health only | no per-person record |
| F6 | tracker → Beacon | items, status, assignee, comments | prototype: `data/*.json` via the faked Jira adapter |
| **F7** | **Beacon → tracker** | **only a change a human approved** | the write path; simulated today (an outbox), real in phase 4 |
| **F8** | **Beacon → model provider** | **one item's thread, first names only** | the only flow that leaves infrastructure you control |
| F9 | model provider → Beacon | phrases, weights, a one-sentence rationale | normalised and re-scored before use |

### F8 in full — the only data that leaves

`lib/llm/types.ts` is the specification; this is the whole of it:

```
code          "REQ-001"            the item key
title         one line
status        e.g. "in_progress"
priority      low | medium | high
dueInDays     an integer
owner         FIRST NAME ONLY      "Marcus" — never a full name or an email
updates[]     { day, text }        the last 5 updates of THIS item only
prior         { flagged, blockedRaised }   so settled noise is not re-flagged
```

Never sent: email addresses, full names, other people's items, any other
sprint, the decision log, client or project identifiers, anything from the
knowledge base.

Three configurations, all first-class:

- `BEACON_LLM_PROVIDER` unset with no key — **the default**. Nothing leaves the
  process at all; the rule detector runs and every screen works.
- `ollama` — a model on your own machine; nothing leaves the host.
- `openai` — F8 as specified above, over HTTPS, with a deadline and bounded
  retries.

## 2. The nine processes (level 1)

| # | Process | Code | Writes anything? |
|---|---|---|---|
| 1 | Ingest tracker issues and adapt them | `lib/server/jira.ts` | no |
| 2 | Fold base + decisions into the world | `lib/world.ts` | no |
| 3 | Derive per-item facts | `lib/facts.ts` | no |
| 4 | Read the update language | `lib/detect.ts`, `lib/llm/` | no |
| 5 | Score attention | `lib/priorityScore.ts` | no |
| 6 | Raise signals, questions, proposals | `lib/agent.ts` | the run log only |
| **7** | **Record one human decision** | `POST /api/events` | **yes — the decision log** |
| **8** | **Write back an approved change** | `lib/world.ts` `outbox()`; real write in phase 4 | **yes — the tracker** |
| **9** | **Age out decisions past the window** | `POST /api/data/retention` | **yes — deletes from the log** |

Processes 1–6 are pure reads. Everything that changes stored state is 7, 8 or 9,
and each has a person or a schedule behind it — never the agent acting alone.
There is no path from 6 straight to 8: process 7 sits between them, which is the
human-in-the-loop guarantee expressed as a data-flow property.

## 3. The four data stores

| Store | Contents | Lifecycle |
|---|---|---|
| **D1 base snapshot** | items, updates as imported | replaced by the next ingest; never edited in place |
| **D2 decision log** | append-only events: `update.posted`, `signal.decided`, `proposal.decided`, `retro.adopted`, `feedback.given`, `event.undone`, `data.reset`, `data.retained` | append-only, except the retention sweep and an instance reset — **each of which appends a record of itself**, so a gap in the log is never unexplained |
| **D3 run log** | one row per agent run plus its snapshot | capped at 50 rows in the file store; unbounded in Postgres (retention covers it in phase 4) |
| **D4 knowledge base** | runbooks and their authors | read-only here; `data/kb.json`, or the `knowledge_base` table |

## 4. Why state is a snapshot plus a log

An item's state is `base snapshot + effective(events)`, folded by
`buildWorldFrom()` — the same function in the browser and on the server.

The two rules that make the log trustworthy:

- **Only `update.posted` and an approved `proposal.decided` change an item.** A
  signal decision, a feedback vote and a retro adoption are recorded because
  they are evidence about whether the agent is useful, and they change nothing
  on the board.
- **Correction is a new event, never an edit.** `event.undone` cancels an
  earlier event; `effective()` drops both from the world, and both stay in the
  log. An audit trail any one person can rewrite is not an audit trail.

## 5. Inside the detector (level 2)

The claim this flow has to support: *a model may supply evidence, but never the
conclusion.*

1. The item thread is built (F8 above) — never more than that item's own updates.
2. The provider is asked for a structured verdict: phrases with weights, plus a
   one-sentence rationale.
3. `lib/llm/normalize.ts` repairs the shape: junk entries dropped, weights
   coerced to the right sign and clamped to the rule detector's range, and the
   **score recomputed from the phrases** — the model's own arithmetic and its
   own `signal` flag are discarded. The threshold decision is Beacon's.
4. If the provider times out, errors, returns a non-JSON body, or is not
   configured, the rule detector's verdict is used instead. The shapes are
   identical, so nothing downstream knows which ran — but the response and the
   run row both say which did.

A consequence worth stating: a confident model answer with no phrases scores
zero. There is no way for a verdict to be more certain than its evidence.

## 6. Retention and erasure

Stated once in code, in `lib/policy.ts`, so the privacy card, the endpoint, the
CLI and this document cannot drift apart.

- **Retention** — decisions age out after `DECISION_RETENTION_DAYS` (180). The
  sweep is a schedule (`POST /api/data/retention`, driven by
  `scripts/retain.mjs`), never a button, and it appends a `data.retained` event
  recording how many went and under what window. A sweep that removes nothing
  adds nothing to the log.
- **Access** — a person exports their own events; exporting the whole team log
  is a separate, facilitator-only action.
- **Erasure** — pseudonymising the actor on a person's events rather than
  deleting them: the decision survives for audit, the identity does not. This
  needs sign-in to know who is asking, so it is **phase 4, stated and not
  claimed as built** (diagram 25).
- **Preferences** — theme, density and the nav rail never leave the viewer's
  browser and are never part of the team record.

## 7. What a reviewer should check

- Does any arrow into a store lack an identified actor? (It should not.)
- Is F8 the minimum data that could do the job? Compare with
  `lib/llm/types.ts` — the document and the type should agree exactly.
- Can F7 happen without a recorded approval? Follow `outbox()` in
  `lib/world.ts`: it reads only `proposal.decided` with `decision: "approved"`
  and `update.posted`.
- What is the state of the system when the provider is down, the database is
  down, and the API is unreachable, in that order? Diagram 11 answers all
  three, and `test/agent.test.ts` plus `test/api.test.ts` assert the first two.
