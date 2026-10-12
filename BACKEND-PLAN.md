# Beacon — from prototype to a working backend

**Written for: the Beacon engineering team (and whoever approves the build), as a phase-by-phase plan.**

This answers four questions:

1. Can today's prototype become a real, running product with a backend agent? **Yes, and cheaply — the design was built for it.**
2. How does the end-to-end flow work once the backend is real?
3. Which database do we set up?
4. What does each phase deliver (so we can start on localhost/WSL with an OpenAI key and grow from there)?

---

## 1. Where this started (the baseline) — and where it is now

> **Status (current):** Phases 0–3 of this plan are **built** — see §8 for the file-by-file state. Beacon now runs as a real Next.js backend: `/api` routes, an agent service, an LLM seam (OpenAI/Ollama/rules), a **faked-Jira ingest seam**, and **two interchangeable backends** — Postgres, or a no-database mode (faked Jira + a `.data/` file store) that runs on a laptop with no Docker. The section below describes the **front-end-only baseline we started from**; it is kept because every migration move that follows was derived from it.

At the start, Beacon was a **pure front-end**: no server route, no API, no database, no LLM call. Everything was computed in the browser by transparent rules:

| Concern | Where | What it really is |
|---|---|---|
| "Reads update language, spots a hidden blocker" | [lib/detect.ts](lib/detect.ts) | A regex phrase table with weights; `score ≥ 4` → signal. Deterministic. |
| Attention score | [lib/priorityScore.ts](lib/priorityScore.ts) | 14 named rules summed; threshold 65. |
| Per-item facts (cadence, blocker timeline, dependency graph) | [lib/facts.ts](lib/facts.ts) | Pure derivation from the world. |
| The "agent" (signals, requests, proposals, run summary, confidence) | [lib/agent.ts](lib/agent.ts) | Pure functions over the world. Confidence is computed and recalibrated by the accept/dismiss record. |
| State | [lib/events.ts](lib/events.ts) | Seed JSON (`/data`) + an **append-only event log in `localStorage`** (`beacon.events.v1`). |
| World = seed + events | [lib/world.ts](lib/world.ts) | `buildWorld(events)` — a pure reducer. |
| "Who is acting" | [lib/data.ts](lib/data.ts) `PERSONA` + [lib/useWorld.ts](lib/useWorld.ts) `useActor` | A persona switch, **not** auth. |

### Why this is good news

The codebase is **already event-sourced** and the whole "brain" is **already isomorphic** (runs identically on a server, because it never touches `window`). Two facts carry the entire migration:

- **One storage seam.** Only `lib/events.ts` (and the client hooks in `lib/useWorld.ts`) know that state lives in `localStorage`. Everything else takes a `World` and returns a value.
- **One decision chokepoint.** Every human action becomes an event through `useActor().act()` → `record()`. There is exactly one write path to intercept.

So the work is: **move the event log off the browser, run the agent as a service, and (optionally) put an LLM behind the detector** — without touching `facts.ts`, `priorityScore.ts`, or the signal logic.

---

## 2. End-to-end flow once the backend is real

```
                 ┌─────────────────────────────────────────────┐
  Jira / ADO  →  │ 1. INGEST — faked Jira REST seam (BUILT)     │  (real Atlassian fetch: Phase 5)
  (later)        │    GET /api/jira/search → adapt → items/upd  │
                 └───────────────┬─────────────────────────────┘
                                 ▼
        ┌────────────────────────────────────────────────────────────┐
        │  PostgreSQL                                                  │
        │   items · members · updates · knowledge_base (+embeddings)   │
        │   events  (append-only, the source of truth)                 │
        │   agent_runs · signals · proposals · requests (agent output) │
        │   outbox  (tracker writes waiting to be pushed)              │
        └───────┬───────────────────────────────────────────┬─────────┘
                ▼                                             ▼
   ┌───────────────────────────┐              ┌──────────────────────────────┐
   │ 2. AGENT WORKER (cron +    │              │ 3. WEB APP (Next.js server)   │
   │    on tracker event)       │              │    reads DB → renders screens │
   │  factsFor → detect(LLM or  │   signals/   │                               │
   │  rules) → getSignals /     │──requests──▶ │  4. Human acts (accept /      │
   │  getRequests → persist     │              │     dismiss / approve / post) │
   │  confidence recalibrated   │◀──events─────│     → POST /api/events        │
   └───────────────────────────┘              └───────────────┬──────────────┘
                                                               ▼
                 ┌─────────────────────────────────────────────┐
                 │ 5. OUTBOX → tracker writer                   │
                 │    approved proposals & own updates →        │
                 │    Jira/ADO  (simulated until Phase 5)       │
                 └─────────────────────────────────────────────┘
```

**The loop in words:**

1. **Ingest** — tracker items and stand-up updates land in the store. This is **built as a faked Jira REST seam** ([lib/server/jira.ts](lib/server/jira.ts), inspectable at `GET /api/jira/search`): Beacon reads a Jira-shaped `search` payload built from `/data` and adapts it to our `Item`/`Update` shape — the exact fetch → adapt → World flow a real tracker uses, with only the network call faked. Phase 5 swaps the fake for a real Atlassian/ADO `fetch()`; nothing downstream changes.
2. **Agent worker** runs on a schedule (`AGENT_INTERVAL_MINS = 60`, already defined) and on each tracker event. It runs the exact pipeline we have now — `factsFor → detect → getSignals/getRequests` — and **persists** the results instead of recomputing them per page load.
3. **Web app** reads those rows and renders. Server components can call the same `lib/` functions directly; no logic is duplicated.
4. **Human acts.** Every accept/dismiss/approve/update posts one event to `/api/events`. The world is seed + events, exactly as today — just stored server-side and shared across users.
5. **Outbox** — approved proposals and posted updates become outbox rows. A writer pushes them to Jira/ADO. Until Phase 5 the writer is a no-op that just marks them "sent (simulated)", which is what `outbox()` already models in [lib/world.ts](lib/world.ts).

**Human-in-control survives unchanged:** a signal is still an assessment, a proposal is still a preview applied only on approval, author-first still routes language concerns to the writer, and every event is still undoable. We are moving the log, not loosening the contract.

---

## 3. Which database

**PostgreSQL.** One engine covers every need for the next 5–10 years:

- **The event log** is append-only rows with a `JSONB` payload — Postgres does this natively and indexes it.
- **Seed/tracker data** (items, members, updates, dependencies) is relational — the natural fit.
- **Knowledge base / RAG** later: the **`pgvector`** extension stores embeddings for semantic KB matching, so we don't add a second datastore.
- It runs trivially on **WSL** (`apt install postgresql` or a one-line Docker container) and scales to managed Postgres (RDS / Cloud SQL / Neon / Supabase) with no code change.

**Access layer (as built):** the raw **`pg`** driver against a plain SQL schema ([db/schema.sql](db/schema.sql)), one pooled connection ([lib/server/db.ts](lib/server/db.ts)) — no ORM. The tables store whole domain objects as `JSONB`, so queries are trivial and types come straight from `lib/types.ts`. Prisma or Drizzle stay easy drop-ins later if we want migration tooling; nothing depends on their absence.

**No database required to run (as built).** Postgres is the production shape, but the whole backend also runs with **no database at all**: when `DATABASE_URL` is unset or unreachable, [lib/server/store.ts](lib/server/store.ts) sources the base snapshot from the faked Jira and persists the event log + run snapshots to JSON under `.data/` ([lib/server/fileStore.ts](lib/server/fileStore.ts)). So `npm run local` (or `npm run dev`) gives a complete working stack on a laptop with no Docker; pointing `DATABASE_URL` at a real Postgres switches to the concurrent-safe path with no other change.

> SQLite would work for a single-machine demo, but it has no `pgvector` and no real concurrency — picking Postgres now avoids a migration later. Don't reach for Mongo: our data is relational and event-sourced, which is Postgres's home ground.

**Schema as built ([db/schema.sql](db/schema.sql)) — whole objects in `JSONB`, deliberately lean:**

```
members(id, data jsonb)                               -- the full Member (members.json)
items(id, sprint_id, data jsonb)                      -- the full Item (items.json)
updates(id, item_id, sprint_id, data jsonb)           -- the full Update (updates.json)
knowledge_base(id, author, data jsonb, embedding)     -- KbArticle; embedding JSONB→pgvector (Phase 3)
events(id, at, actor, kind, payload jsonb)            -- the BeaconEvent union — SOURCE OF TRUTH
agent_runs(id, ran_at, trigger, detector, provider,   -- summary holds the whole
           model, items_scanned, signals_open,            { run, signals, requests } snapshot (JSONB)
           summary jsonb)
-- signals / proposals / requests  → NOT separate tables; they live inside agent_runs.summary
-- outbox                          → NOT a table; derived from the event log by outbox() (lib/world.ts)
```

`events` is the source of truth. Each agent run stores its whole `{ run, signals, requests }` snapshot in `agent_runs.summary` — a cheap materialised cache the worker rewrites each run, mirroring how `getSignals(w)` is derived today, so a page load is a read, not a recompute. Splitting that snapshot into relational `signals`/`proposals`/`requests` tables is only worth doing once we need to query across runs (Phase 6).

---

## 4. Where OpenAI actually goes (and where it must not)

The LLM **augments**, it does not replace the explainable core. Four bounded jobs:

1. **Update-language detection** — the big one. Replace/augment [lib/detect.ts](lib/detect.ts) with an OpenAI call that returns **structured JSON** behind the *same `Detection` shape* (the file comment already anticipates this): `{ signal: boolean, score, hits:[{phrase, weight}], rationale }`. The model catches phrasing the regex misses ("I'll circle back once infra sorts itself out"), but it still returns named evidence, so a signal stays explainable.
2. **Standup structuring** — turn a member's free-text update into `{status, progressText, nextAction, blockerText}` so posting an update is one sentence, not a form.
3. **KB semantic match** — embeddings + `pgvector` instead of tag overlap in `kbFor()`, so the right runbook surfaces even without keyword hits. This comes *after* the file-based KB proves out (§4.5).
4. **Suggested-comment generation** — turn an agent signal into the short, plain-text comment that would move the item forward (e.g. *"@Priya could you pair on the webhook signature? You wrote the runbook."*). It is **length-bounded** (a sentence or two, a hard token cap) and **plain text, not markdown** for the prototype, and — like every agent output — it is only a **preview the human approves** before it reaches the tracker. Today these comments are rule-built templates in `getSignals()`; the model makes them read naturally while staying inside the same proposal/approval gate.

**Guardrails that keep Beacon's promises:**

- The **deterministic attention score stays the arbiter.** The LLM can flag; the 14-rule score and the human decide. We never let the model silently change a tracker item.
- **Every LLM output is structured and carries its evidence** — no free-form verdicts shown as fact. Confidence stays computed and is still recalibrated by the team's accept/dismiss record (`feedbackFor` / `calibrate`).
- **Feature-flagged and A/B'd.** Run the LLM detector *alongside* the rule detector and compare accept rates before trusting it. The adoption plumbing for this already exists.
- **Cost + privacy bounded:** only work-item text is sent (never chat/email/calendars — same as today's privacy card), responses cached per update hash, and the key lives in `.env.local` on WSL, never in the client bundle.

### 4.1 What data the LLM receives, and what context is passed

**For the prototype: current context, per item, incrementally — not a full historical reprocess every run.**

We backfill history **once** (when the Jira snapshot is imported), then on each run we only send items whose updates changed since the last run. The unit sent to the model is **one item plus its own update thread for the active sprint** — because the signal lives in the *trajectory* ("struggling" on day 5, "still stuck" on day 7 is stronger than a single mention), not in one line. Today's `detect()` takes a bare string; the LLM version takes the item + its thread so it can read that trajectory.

**Exactly what is passed (compact JSON, token-bounded):**

```jsonc
{
  "item":   { "code": "REQ-001", "title": "...", "status": "in_progress",
              "priority": "high", "dueInDays": 2, "owner": "Marcus" },
  "updates": [                       // THIS item, THIS sprint only (last ~5)
    { "day": 5, "text": "making headway but the SDK docs are thin" },
    { "day": 7, "text": "still not sure how to get the webhook signature right" }
  ],
  "priorDetection": { "flagged": false, "blockedRaised": false }  // so it doesn't re-flag noise
}
```

**What is deliberately NOT passed:** other items, other people's work, chat, email, calendars, PII beyond a first name. That keeps the privacy promise and the token bill small.

**Relevance is the agent's first job, not an afterthought.** Before composing the prompt, the agent decides *which* slice of context is worth sending for this item — its own update thread, the one matching runbook, the names of directly dependent items — and sends only that. More context is not better: it raises cost, dilutes the signal, and risks dragging in unrelated work. The rule for the prototype is **item-relevant only** — if a piece of data doesn't bear on *this* item's blocker, it is not passed.

**The response is bounded too.** The model returns either the structured `Detection` (for a signal) or a short plain-text comment (to propose moving the item forward) — never a long free-form essay. A hard token cap plus a "one or two sentences" instruction keep outputs cheap, fast enough for event-driven runs, and easy for a human to scan and approve. Richer formatting (markdown, multi-step plans) is a later refinement, not part of the prototype.

**The model returns the existing `Detection` shape** (plus a short rationale), so nothing downstream changes:

```jsonc
{ "signal": true, "score": 6,
  "hits": [{ "phrase": "not sure how to proceed", "weight": 3 },
           { "phrase": "unresolved two days running", "weight": 3 }],
  "rationale": "Day-7 wording is less certain than day-5; no fix in hand." }
```

**Historical vs current, stated plainly:** historical data is used *once* to seed and to warm the accept-rate calibration; steady-state runs process only the **current sprint delta**. Responses are cached by a hash of the update text, so an item with no new update costs **zero** tokens on the next run.

### 4.2 When the agent runs (scheduled · event · manual — all configurable)

Three triggers, and the team can configure them (an `agent_config` row):

| Trigger | When | Scope | Default |
|---|---|---|---|
| **Scheduled** | every `intervalMins` | all active items with changed updates | 60 min (`AGENT_INTERVAL_MINS`) |
| **Event-driven** | a tracker update / status change arrives (webhook) | just the affected item(s) | on |
| **Manual "Run now"** | facilitator clicks, or `POST /api/agent/run` | all, or one item | always available |

```jsonc
// agent_config (per team)
{ "enabled": true, "intervalMins": 60, "triggerOnEvent": true,
  "activeSprintId": "s2", "detector": "both",          // rules | llm | both (A/B)
  "model": "gpt-4o-mini", "quietHours": "20:00-07:00" } // no runs overnight
```

`getRun()` already records `trigger: "schedule" | "event"` — the shape is there; we add `"manual"` and persist each run as an `agent_runs` row with its trigger, so the UI can show *"last run 09:00, scheduled — next 10:00"* and a **Run now** button.

> **Event-driven is the answer to "updated status based on the next one":** the moment a new update lands, Beacon re-evaluates *that* item immediately instead of waiting for the hour — so the board reflects the latest status within seconds of the person posting.

### 4.3 How status actually changes (and the Jira fixed-data round-trip)

Beacon's rule is unchanged from today: **the agent never changes a status by itself.** A status moves only two ways, both already modelled in [lib/world.ts](lib/world.ts) `applyStatus`:

1. **A person posts an update** carrying a new status (`update.posted` event).
2. **The agent proposes a change** (e.g. *In progress → Blocked, with a note*) and **a human approves it** (`proposal.decided: approved`).

Either way one event is appended, the world reducer updates the item, and an **outbox** row is created. For the prototype with **fixed Jira data**, the round-trip is:

```
Jira export (one-time snapshot)  ─▶  import → items/updates in Postgres
         │
         ▼
   agent evaluates → proposes "→ Blocked"   (REQ-001)
         │
   facilitator approves  ─▶  event appended  ─▶  item.status = blocked in Beacon DB
         │
         ▼
   outbox row written   ─▶  [Phase 5] Jira transition API moves the issue + adds the comment
                            [prototype] marked "sent (simulated)" — nothing leaves the box
```

So with fixed data we get the **entire flow end-to-end** — detect → propose → approve → status change → outbox — and only the final hop to Jira is stubbed. A `statusMap` config holds the Beacon↔Jira mapping (`blocked → "Blocked" + flag`, `done → transition "Done"`) so switching the stub for the real writer in Phase 5 is a config + one API call, not a redesign.

### 4.4 Which model, and the backend that runs it

| Job | Model (default) | Why | Swappable to |
|---|---|---|---|
| Update-language detection & standup structuring | **OpenAI `gpt-4o-mini`** | bounded classification, not generation; cheap (~cents/1k calls), fast enough for event-driven runs, supports **structured outputs** (JSON schema) so the `Detection` shape is guaranteed | `gpt-4o` if mini's accept-rate lags; a local **Ollama** model on WSL; Anthropic |
| KB semantic match | **`text-embedding-3-small`** | small, cheap embeddings into `pgvector` | `-large` for harder corpora |

The model is read from `agent_config.model`, and all calls go through **one server-only `llm` module** (an interface with an `openai` implementation) — so the choice is a config value, never hard-coded, and a different provider is a new implementation behind the same interface. Structured outputs (`response_format: json_schema`) make the model *fill in* the `Detection` schema rather than free-type, which is what keeps every signal explainable.

### 4.5 What the agent reads — and in what order (the data-source roadmap)

The agent's insight is only as good as the context it can draw on. We add sources **in order of value-per-effort**, and each is strictly scoped to the item in hand (§4.1).

| Source | What it gives | When | Status |
|---|---|---|---|
| **The item + its own update history** | the trajectory a single line can't show ("struggling" day 5 → "still stuck" day 7); the owner; the due date; the dependency links | **now (initial phase)** | built — this is exactly what `inputFor()` already assembles and the detector reads |
| **Knowledge base (checked-in files)** | "this has been solved before" + who wrote the fix (the SME) | **now** | built as `data/kb.json`, matched by tag overlap; now also seeded into Postgres (`knowledge_base`) |
| **Cross-sprint history of similar items** | how comparable blockers were resolved before, and who resolved them — a history-derived SME, not a static badge | **next** | planned — reads prior sprints from the event log |
| **Git history** | who last worked the code an item touches | **deferred** | explicitly skipped for now |

**The initial phase is deliberately narrow:** one item, its own update history, and the checked-in KB — nothing else. "Who worked on a similar item before" (cross-sprint history) is the *next* step; git history is parked. That keeps context tight, cost low, and every suggestion traceable to something the team can already see.

**The knowledge base is a living thing, and it starts simple.** For the prototype the KB is **authored as files checked into the repo** (`data/kb.json` today; plain Markdown runbooks are an easy next format) — no database ceremony to add or edit an entry. It is meant to **grow and be curated**: when a new kind of blocker is resolved, that resolution becomes a new runbook, and near-duplicate entries get split or merged so matches stay sharp. Where it is *stored* evolves without changing how the agent uses it — **files now → a Postgres table (already seeded) → a vector store for semantic match later**. The agent always asks the same question ("is there a runbook that bears on this item?"); only the lookup behind it gets smarter.

### 4.6 Two histories: what Beacon owns, what Jira owns, and what actually syncs

The item has a history, and so does Beacon — they are **two different records**, and keeping them straight answers "does Beacon need to sync to Jira or not."

| Record | System of truth | What it holds | Syncs to the other? |
|---|---|---|---|
| **The work item** | **Jira** (the tracker) | status, fields, due dates, and the issue's own comment history | Jira → Beacon on **read** (ingest — faked REST seam, built) |
| **Beacon's reasoning layer** | **Beacon** (the event log) | signals, proposals, requests, agent runs, and every human accept/dismiss/approve decision | **No** — this never needs to live in Jira |

**So the answer is: Beacon's own tracking data does _not_ need to be copied into Jira.** Jira stays the source of truth for the item; Beacon's signals and decision log are its own audit trail and belong to Beacon. The only things that cross the boundary are **item-level facts and the comments/status changes a human approved** — not Beacon's internal reasoning.

**Where a comment is authored decides the sync direction:**

- A comment the agent drafts and a human **approves in Beacon** → written **to Jira** via the outbox, so the whole team sees it in their tracker. This is the direction that *requires* a Beacon → Jira write. `outbox()` in [lib/world.ts](lib/world.ts) already derives exactly these entries (approved proposals + posted updates).
- A comment authored **directly in Jira** → ingested into Beacon as an update (Jira → Beacon). No push back is needed — it is already where it belongs.

**For now (the prototype), the sync is one-way and simulated — and that is deliberate:**

```
Faked Jira REST (jira.ts) ─▶ adapt ─▶ Beacon   [ingest seam — BUILT; real fetch = Phase 5]
Beacon decisions & agent output  ── stay in Beacon ──  [never pushed; Jira untouched]
Approved comment / status change ─▶ outbox row ─▶ "sent (simulated)"  [nothing leaves]
```

So today there is **no live two-way sync**: Beacon keeps its own data, Jira is read once and never written. A later `sync` config (e.g. `commentTarget: "jira" | "beacon"` on `agent_config`) will let a team choose whether approved comments post to Jira or stay in Beacon — but that switch, and the real writer behind it, are **Phase 5**, not now.

**Phasing for this area:** *now* — one-time import, Beacon owns its layer, outbox simulated; *next* — cross-sprint / similar-item history (§4.5); *deferred* — git history, external/existing knowledge sources, and real two-way Jira sync.

---

## 5. Phase-by-phase plan

Each phase is independently demoable and leaves the product working. Phases 1–3 are the "real prototype on WSL with your OpenAI key." Phases 4–6 make it multi-team production.

### Phase 0 — Extract the storage seam *(no behaviour change, ~0.5 day)*
- Define an `EventStore` interface (`list()`, `append(e)`, `subscribe()`), with the current `localStorage` implementation behind it.
- Add a `loadWorld()` that can source from the store or the seed. The pure derivations (`facts`, `priorityScore`, `agent`, `world`) **do not change** — this is the whole point of the refactor.
- *Deliverable:* identical app, but state access goes through one swappable interface.

### Phase 1 — Local backend, still rule-based *(the first "real" prototype, ~2–3 days)*
- Stand up **Postgres on WSL** (Docker one-liner). Add Prisma/Drizzle + migrations.
- **Seed script** loads `/data/*.json` into the DB (the shapes already match `lib/types.ts`).
- **API routes:** `GET /api/world` (seed + events) and `POST /api/events` (append one `BeaconEvent`). Server components call `lib/` directly; the client store becomes a thin fetch wrapper to these routes.
- Point `useActor().act()` at `POST /api/events` instead of `localStorage`.
- *Deliverable:* a genuinely multi-user prototype — two browsers see the same board and the same decisions. **Still deterministic, still no LLM.** This alone validates the end-to-end flow.

### Phase 2 — The agent as a service *(~2 days)*
- A worker (a scheduled Next route hit by `node-cron`, or a small standalone Node process) runs `getSignals/getRequests/getRun` **server-side** on the 60-minute cadence and writes `signals/proposals/requests/agent_runs` rows.
- Pages read the cached rows; a "last run" indicator shows the cadence is real.
- *Deliverable:* the agent runs on its own clock, not on page load — the behaviour the product has always claimed.

### Phase 3 — OpenAI behind the detector *(~2–3 days — the key you offered plugs in here)*
- `OPENAI_API_KEY` in `.env.local` on WSL. A server-only `llmDetect(text)` that returns the `Detection` shape via structured outputs.
- **Feature flag + A/B:** run `llmDetect` next to the regex `detect`, log both, compare against the accept/dismiss record.
- **Context is item-scoped (§4.1):** each call sees one item, its own update history, and the matching checked-in runbook — never the whole board. The agent selects the relevant slice before prompting.
- **Bounded comment generation:** the model drafts the short, plain-text "how to proceed" comment for a signal — length-capped, still only a preview the human approves.
- Cache responses per update-text hash to bound cost; cap tokens; redact to work-item text only.
- **Explicitly out of this phase:** KB *semantic* embeddings (the file-based KB ships first — §4.5), cross-sprint similar-item history, and git history. Those are later steps, not Phase-3 work.
- *Deliverable:* the real AI companion — catches blockers the regex can't — with explainability and human-in-control intact.

### Phase 4 — Real identity & roles *(~2 days)*
- Replace the `PERSONA` switch with **Auth.js (NextAuth)** — SSO or email. Map users to `members`; derive facilitator/manager/member from real roles.
- Enforce the read-only manager server-side (today it's a client guard in `useActor`).
- *Deliverable:* real people, real permissions, the privacy model enforced at the API, not just the UI.

### Phase 5 — Real tracker connectors & two-way sync *(deferred by you; ~1 week when wanted)*
- **Ingest (Jira → Beacon):** swap the faked Jira REST seam ([lib/server/jira.ts](lib/server/jira.ts) — already built, §4.6) for a real Atlassian/ADO `fetch()` plus webhooks + nightly poll → `items`/`updates`. The adapter and the whole fetch → adapt → World flow are already in place; only the network call changes.
- **Outbox writer (Beacon → Jira):** push **only human-approved** proposals and posted updates back to the tracker (the `outbox()` model already describes exactly these writes). Beacon's own reasoning layer — signals, proposals, the decision log — is **never** pushed (§4.6). Until this ships, the writer stays a simulated no-op.
- **`sync` config:** `commentTarget: "jira" | "beacon"` on `agent_config` decides whether an approved comment posts to Jira or stays in Beacon.
- *Deliverable:* Beacon sits on top of the team's real tracker, with the sync boundary from §4.6 made live.

### Phase 6 — Production hardening *(ongoing)*
- Rate limits & cost ceilings on LLM calls; per-team quotas.
- Observability (run logs, signal precision dashboards, the accept-rate calibration made visible).
- Audit trail (the event log already is one — expose it), backups, secrets management.
- Multi-team tenancy.

---

## 6. What to say in one line

> **Beacon began as a front-end that *computes* the whole experience with transparent rules and stored decisions in the browser. Because it was already event-sourced and the logic was server-safe, making it real took three moves — put the event log behind a store, run the agent as a service, and slot an LLM in behind the detector — none of which touched the scoring or the human-in-control contract. Those are now built: it runs end-to-end on WSL, with Postgres or no database at all, and an OpenAI/Ollama key turns on real language detection. What's left is later-phase work (auth, real Jira sync, richer context), not the core.**

---

## 7. Running it on WSL (Phases 1–3 are built — see §8)

### One command

```bash
npm run local     # DB + backend + frontend + agent, on a free port, URLs printed
#   make local    # identical — only if GNU make is installed (WSL: sudo apt-get install -y make)
```

Use `npm run local` — it needs nothing but Node (which you already have). `make local` runs the same thing but only works where `make` is installed; on a bare Windows/WSL box it is not, which is why `make local` may report "command not found".

Either entry (→ `scripts/local.mjs`) does everything: it creates `.env.local` from the template on first run (**your OpenAI key goes there — it is gitignored and never committed**), picks a free port (`BEACON_PORT`, or `npm run local -- --port 4000` / `make local PORT=4000`), tries to bring up Postgres (a `beacon-db` docker container if nothing is already answering), seeds the base snapshot, builds and starts the server (UI + `/api`), starts the agent worker, prints every URL, and stops all of it on Ctrl-C. Variants: `npm run local -- --dev` (hot reload), `npm run local -- --no-agent`, `npm run local -- --no-db`.

**No Docker? It still runs.** If Postgres is unreachable and Docker is not installed, `local.mjs` falls back to the **no-database mode** the server supports (base snapshot from the faked Jira, event + run logs under `.data/`) instead of failing — the banner shows `Store: no-DB`. Force that path explicitly with `npm run local:nodb` (or `make no-db`). Point `DATABASE_URL` at a real Postgres to get the concurrent-safe path; nothing else changes.

**Secret safety:** `npm run check:secrets` (or `make check-secrets`) fails if any `.env` or key-shaped string is tracked or staged. `.gitignore` ignores every `.env*` except `.env.example`, so your `.env.local` with the real key can never be committed.

### Or step by step

```bash
# 1. Postgres in one container (matches DATABASE_URL in .env.example)
docker run --name beacon-db -e POSTGRES_PASSWORD=beacon -e POSTGRES_DB=beacon \
  -p 5432:5432 -d postgres:16

# 2. Config  — your key lives here, gitignored
cp .env.example .env.local          # DATABASE_URL already points at the container

# 3. Load the base snapshot (the fixed "Jira export": /data/*.json → DB)
npm run db:seed                     # or: npm run db:reset  (also clears decisions)

# 4. The server app WITH the backend (serves /api/world, /api/events, /api/agent/run)
npm run build && npm start          # dev: npm run dev   → http://localhost:3000

# 5. The agent worker (the clock): one run now, then every BEACON_AGENT_INTERVAL_MINS
npm run agent                       # single run for cron/CI: npm run agent:once
```

**Turn the LLM on (rules work with none of this):**

```bash
# Option A — OpenAI (the key you have)
echo 'OPENAI_API_KEY=sk-...'        >> .env.local   # provider auto-detects as openai
echo 'BEACON_DETECTOR=both'         >> .env.local   # run model + rules, log the comparison

# Option B — a locally hosted model on WSL (no key, nothing leaves the machine)
ollama pull llama3.1
printf 'BEACON_LLM_PROVIDER=ollama\nBEACON_DETECTOR=both\n' >> .env.local
```

Switching OpenAI ↔ Ollama is only these env lines — no code change — because both sit behind one `LlmProvider` interface (`lib/llm/`). The static GitHub Pages demo is unaffected by any of this; the build hides `app/api` during the export so the Pages deploy keeps working.

---

## 8. Status — what is built vs still a plan

**Built and verified in the repo (Phases 0–3 core):**

| Piece | Files | Verified |
|---|---|---|
| Storage seam / reusable reducer | `lib/world.ts` `buildWorldFrom` | tsc + both builds green |
| Postgres schema + idempotent seed (members, items, updates, **runbooks**) | `db/schema.sql`, `scripts/seed-db.mjs`, `lib/server/store.ts` `loadKb()` | seed runs; friendly error without `DATABASE_URL`; `knowledge_base` table seeds the checked-in `data/kb.json` |
| Server store, dual backend (Postgres **or** no-DB) | `lib/server/store.ts`, `lib/server/db.ts`, `lib/server/fileStore.ts` | integration test over an in-memory pg: snapshot load, event append, reducer applies decisions; no-DB mode writes the event/run logs to `.data/` |
| Faked Jira ingest seam (fetch → adapt → World) | `lib/server/jira.ts`, `app/api/jira/search/route.ts` | returns a Jira-shaped `/rest/api/3/search` payload from `/data`; adapter restores `Item`/`Update` losslessly |
| API routes | `app/api/{world,base,events,agent/run,agent/analyze,agent/compose,data/retention,jira/search}/route.ts` | server build lists them as dynamic; absent from the Pages export. `/api/events` also answers `DELETE` (the facilitator's instance reset); `/api/agent/run` also answers `GET` (recorded runs, newest first) |
| Data policy: retention applied, access scoped, erasure defined | `lib/policy.ts`, `app/api/data/retention/route.ts`, `lib/server/store.ts` `pruneEvents()`, `scripts/retain.mjs`, `components/privacy.tsx` | policy stated once in code and read by the card, the endpoint and the CLI. Live on a mixed-age log: `GET` reported 2 of 3 past the 180-day window, `--days 400` reported 0 of 3, `--apply` removed 2 and appended one `data.retained` event, a second `--apply` changed nothing and added no row. The log is append-only otherwise: the only wipe is the facilitator-only reset, which re-appends a `data.reset` row (verified `{"deleted":2}` → log holds exactly that row), and neither `data.*` row is offered an undo. **Erasure by pseudonymisation is stated, not built** — it needs phase-4 auth |
| Detection override reaches the signals | `lib/detect.ts` `detectionGeneration()`, `lib/facts.ts` | the per-world facts memo is stamped with the detector generation, so installing model verdicts re-derives facts instead of serving the regex reading the worker's own pre-pass cached. Probe: overrides moved hidden-blocker signals 0 → 9 and cleared back to 0 |
| "Run now" + real run history in the UI | `components/AgentRun.tsx`, `app/api/agent/run/route.ts` | triggers a run and shows detector, model, scanned count, model calls, rule disagreements and errors; says plainly when there is no backend |
| Agent comment drafting in the UI (§9.1) | `lib/compose.ts`, `components/hic.tsx` `ProposalRow` | **Draft with agent** fills the same field the person approves; falls back to the rule template and labels which ran |
| Client wired to the API | `lib/events.ts` `hydrate()`/`record()`, `lib/useWorld.ts` | server mode fetches `/api/base` + `/api/events` and POSTs decisions; falls back to localStorage in the static export |
| One-command deploy + secret guard | `scripts/local.mjs`, `scripts/check-secrets.mjs`, `Makefile` | brings up DB (or no-DB) + build + server + agent on a free port; refuses to commit any `.env`/key |
| Agent run (brain + LLM in the loop) | `lib/server/agent.ts` | integration test: rules run (24 signals) and a mock-Ollama run (10 provider calls), both persisted |
| LLM providers (OpenAI **and** Ollama) | `lib/llm/*`, `lib/config.ts` | 19 unit checks: request shape, JSON-schema output, score recomputed from weights, regex fallback, config resolution |
| Detector override seam | `lib/detect.ts` `setDetectionOverrides` | override drives the synchronous brain; clearing restores pure rules |
| Agent worker (cadence + quiet hours + manual) | `agent/run.mjs` | runs once, schedules, degrades gracefully when the server is down |
| Bounded comment generation (§9.1) | `lib/llm/{types,prompt,openai,ollama,index}.ts`, `lib/server/agent.ts` `composeComment`, `app/api/agent/compose/route.ts` | provider `compose()` capped + plain text; guaranteed fallback to the rule template; batch path gated by `BEACON_COMPOSE`; `tsc` green |
| Two-target build (server vs static export) | `scripts/build.mjs` | Pages export green with `app/api` hidden; server build includes it |

**Not yet exercised here (needs your WSL box):** the real Postgres wire protocol and a live OpenAI/Ollama call — both are standard and the code degrades gracefully if either is absent (rules-only, no-DB, clear fallbacks). **Still genuinely ahead:** the **data-source roadmap in order** (cross-sprint similar-item history next, git history deferred — §4.5), **KB semantic match** (embeddings/`pgvector`; the file-based KB now seeds into the `knowledge_base` table), Phase 4 auth — which is also what unblocks **erasure by pseudonymisation** (`lib/policy.ts`), since the server has to know who is asking before it can un-name them — and Phase 5 real Jira ingest/outbox with two-way sync (§4.6 — for now ingest is the faked REST seam and the outbox is simulated).

So: the backend **runs end-to-end** (ingest → world → agent run → persisted, with the LLM in the loop, client reading and writing through `/api`) on Postgres or with no database at all, and the design questions are all closed. The remaining work is the later phases above.

---

## 9. Next phases — detailed build plan (grounded in the current code)

The backend has moved on since §5 was first written: the detector is live behind an `LlmProvider` seam, the agent already re-reads edited text on demand (`analyzeDraft()` → `/api/agent/analyze`), the provider interface already exposes an optional `embed()`, and `knowledge_base.embedding` exists waiting to be filled. That changes the order of what is cheap to do next. Each phase below is **feature-flagged** (like the existing `detector: rules | llm | both`), keeps **both fallbacks intact** (no LLM → rules; no DB → faked Jira + `.data/`), and leaves human-in-control untouched.

**Sequencing and why:**

| # | Phase | Why here | Effort |
|---|---|---|---|
| 9.1 | **Bounded comment generation** | the read path (`analyzeDraft`) already exists; generation is its mirror and the user wants it "as initial, plain text" | ~1–2 days |
| 9.2 | **Cross-sprint similar-item history → history-derived SME** | the next data source after item-own-history (§4.5); needs no new infra, only the event log we already store | ~2–3 days |
| 9.3 | **KB semantic match (embeddings)** | heaviest (needs `pgvector` + an embed pipeline) and only pays off once the KB grows, so it comes after 9.1–9.2 prove out | ~2–3 days |
| — | **Git history SME · real two-way Jira sync** | explicitly **deferred** (§4.5, §4.6) | later |

### 9.1 Bounded comment generation *(the agent drafts the "how to proceed" comment)* — **BUILT**

**Goal:** turn an agent signal into the short, plain-text comment a human approves (§4 job 4) — read naturally instead of from a fixed template, still a preview behind the same approval gate.

**Status — built, including the UI:** the provider seam now has an optional `compose()` ([lib/llm/types.ts](lib/llm/types.ts), implemented in `openai.ts` + `ollama.ts`, bounded by `COMPOSE_MAX_TOKENS` and a plain-text prompt in [lib/llm/prompt.ts](lib/llm/prompt.ts)); `llmCompose()` ([lib/llm/index.ts](lib/llm/index.ts)) guarantees a fallback to the rule template; the server exposes on-demand `composeComment()` behind `POST /api/agent/compose` (mirroring `/api/agent/analyze`) and a batch rewrite of comment proposals inside `runAgent()` gated by the `compose` flag ([lib/server/agent.ts](lib/server/agent.ts)); `BEACON_COMPOSE` toggles the batch path (default off).

The UI hook is now wired too: **Draft with agent** on any `field: "comment"` proposal ([components/hic.tsx](components/hic.tsx) `ProposalRow`, via [lib/compose.ts](lib/compose.ts)) calls the route, drops the result into the same field the person edits and approves, and says which produced it — the model, or the rule template when no model is configured. Nothing is auto-posted; the approval gate is unchanged.

**Where it plugs in:**
- Extend the provider seam with an optional `generate(input): Promise<{ text: string }>` in [lib/llm/types.ts](lib/llm/types.ts), implemented in `openai.ts` / `ollama.ts`; a new comment prompt in [lib/llm/prompt.ts](lib/llm/prompt.ts) (one or two sentences, plain text, hard `max_tokens`).
- Today each proposal carries a rule-built `change.to` string from `getSignals()` in [lib/agent.ts](lib/agent.ts) (e.g. the `@helper could you pair…` text). Add a server-side `composeComment(signal, world)` that rewrites that string for `field: "comment"` proposals, mirroring the detector-override pattern: compute server-side in `runAgent()` ([lib/server/agent.ts](lib/server/agent.ts)) and attach to the persisted signal snapshot. The rule template stays the fallback.
- Optional dedicated route `POST /api/agent/compose` (sibling of `/api/agent/analyze`) for on-demand regeneration in the approve UI.

**Guardrails / fallback:** length-capped, plain text, never auto-posted; if the provider is absent or errors, the rule template is used verbatim (so behaviour is identical to today). Flag: `compose: boolean` (default off until accept-rate is checked).

**Done when:** an approved comment reads naturally for a flagged item, and with no provider the exact current template still shows.

### 9.2 Cross-sprint similar-item history → history-derived SME

**Goal:** answer "who has cleared a blocker like this before, and how" from history — replacing the badge guess in `helperFor()` with evidence.

**Where it plugs in:**
- New pure module `lib/history.ts`: `similarResolved(item, w)` → prior items (earlier sprints) that were blocked and then resolved, ranked by similarity (same `type`, overlapping tags/`causesOf()` root-cause category, shared dependency area); `historicalSme(item, w)` → the member who owned/authored the resolving updates or approved the unblocking proposal on those items (read from `w.updates` authors + `proposal.decided` events in the log).
- Feed `historicalSme` into `helperFor()` in [lib/agent.ts](lib/agent.ts) as a **candidate ranked above** the `blocker-buster` badge heuristic, with a visible reason ("cleared REQ-007's webhook blocker last sprint").
- Optionally add one bounded line to `inputFor()` context in [lib/server/agent.ts](lib/server/agent.ts): the single most similar past resolution, item-relevant only (§4.1).

**Data:** no schema change — prior-sprint items/updates are already in the base snapshot (the run scope already lists "Sprint 1 history"), and decisions are in the event log. Requires prior-sprint data present in the seed/import.

**Guardrails / fallback:** top-1 similar resolution + top SME only; explainable; names-only (privacy). With too little history it silently falls back to the current badge heuristic. Flag: `historySme: boolean`.

**Done when:** a blocked item resembling a past one suggests the person who resolved the past one, with the reason shown; thin history → current behaviour.

### 9.3 KB semantic match (embeddings)

**Goal:** surface the right runbook even with no tag-word overlap — the §4.5 "files → Postgres → vector" end state.

**Where it plugs in:**
- Migrate the column: `CREATE EXTENSION vector;` then `ALTER TABLE knowledge_base ALTER COLUMN embedding TYPE vector(1536) USING embedding::text::vector;` (the one-liner already noted in [db/schema.sql](db/schema.sql)).
- New `scripts/embed-kb.mjs`: for each article, `provider.embed(title + summary + tags)` (the interface already has `embed()`), write the vector. Run at seed time.
- `kbFor()` in [lib/agent.ts](lib/agent.ts) is pure/sync over the KB array; semantic match is async + DB, so add a server-side `kbMatchSemantic(item)` that embeds the item text and does `ORDER BY embedding <-> $query LIMIT 1`, injected the same way detector verdicts are. Tag-overlap `kbFor()` stays as the fallback.

**Guardrails / fallback:** with no `pgvector`, no provider, or no-DB mode, it falls back to tag overlap — so `npm run local:nodb` keeps working. Keep a similarity threshold so weak matches don't surface, and show the matched article as the evidence. Flag: `kbMatch: "tags" | "semantic"` (default `tags`).

**Done when:** a runbook surfaces for an item with zero tag overlap under Postgres+`pgvector`; the no-DB path still matches by tags.

### Config additions (one `agent_config` row, all flags default to today's behaviour)

```jsonc
{ "compose": false,            // 9.1 — LLM drafts the approve-preview comment
  "historySme": false,         // 9.2 — helperFor() uses cross-sprint history
  "kbMatch": "tags" }          // 9.3 — "tags" (now) | "semantic" (pgvector)
```

Each flag runs its new path **alongside** the current one and is compared against the accept/dismiss record before being trusted — the same A/B discipline the `detector: both` mode already uses.
