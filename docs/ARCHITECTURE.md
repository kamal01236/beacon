# Beacon — architecture

Written for an engineer or reviewer who has not seen this codebase before. It
explains what the pieces are, why they are arranged this way, and where to look
in the code. The pictures live in **[DIAGRAMS.md](DIAGRAMS.md)** (28 diagrams,
also openable as a standalone viewer at
[docs/diagrams/index.html](diagrams/index.html)).

- Data flow specifically: **[DATA-FLOW.md](DATA-FLOW.md)**
- Endpoint reference: **[API.md](API.md)**
- Running and operating it: **[OPERATIONS.md](OPERATIONS.md)**
- What is and is not production-ready: **[PRODUCTION-READINESS.md](PRODUCTION-READINESS.md)**
- Decisions and their reasons: **[adr/](adr/)**

---

## 1. What Beacon is, in one paragraph

Beacon is a companion layer over Jira or Azure DevOps, not a replacement. The
tracker stays the system of record. Beacon reads the backlog and the team's
stand-up updates, computes an explainable **attention score** for each item,
reads the **language** of updates to catch blockers nobody has raised yet, and
asks a person when it cannot resolve something from data. It proposes changes to
the tracker and never applies one without a recorded human approval.

Two invariants hold everything else up:

1. **The score is the sum of the reasons shown next to it.** Nothing derived is
   stored, so the number cannot drift from its explanation.
   (`lib/priorityScore.ts`, enforced by `test/engine.test.ts`.)
2. **Only two kinds of event change an item**: someone's own update, and a
   proposal a human approved. (`lib/world.ts`, enforced by `test/world.test.ts`.)

## 2. The shape of the system

See diagrams [2 · Containers](DIAGRAMS.md#containers-c4-level-2) and
[3 · Inside the brain](DIAGRAMS.md#inside-the-brain-c4-level-3).

```
browser (React screens)
   │  GET /api/world · POST /api/events
   ▼
Next.js server process
   ├── app/api/**            route handlers: validate → act → one envelope
   ├── lib/                  THE BRAIN: pure, synchronous, no I/O
   ├── lib/server/store.ts   Postgres, or the .data/ file store
   ├── lib/server/jira.ts    the ingestion seam (faked for the prototype)
   └── lib/llm/              the model seam: deadline, retries, fallback
   ▲
   │  POST /api/agent/run
agent/run.mjs — the clock, and nothing else
```

Three deliberate choices:

**The brain is a library, not a service.** `lib/facts.ts`,
`lib/priorityScore.ts`, `lib/detect.ts`, `lib/agent.ts` and `lib/insights.ts` are
pure functions over a `World`. The browser imports them and so does the server,
which is why the static export can show a complete, honest board with no backend
at all — and why a screen and the server can never disagree about a score.

**The worker holds no logic.** `agent/run.mjs` decides *when* a run happens and
calls `POST /api/agent/run`. It is ~170 lines, most of it about not overlapping
runs, not hammering a dead server, and shutting down cleanly. The run itself is
`lib/server/agent.ts`, so the worker and the "Run now" button in the UI execute
exactly the same code.

**The model is optional, behind a seam.** `lib/llm/types.ts` defines one
provider interface; OpenAI and a local Ollama implement it. The result type is
the same `Detection` the regex detector returns, so the deterministic pipeline
runs unchanged whether a model was involved or not — and when the provider is
down, each item silently falls back to the rules
(diagram [11 · Failure modes](DIAGRAMS.md#failure-modes-and-graceful-degradation)).

## 3. How a run computes

Diagram [12 · One scheduled agent run](DIAGRAMS.md#sequence--one-scheduled-agent-run).

```
base snapshot + events
   → world            lib/world.ts        one reducer, both sides
   → facts            lib/facts.ts        dates, cadence, blocker timeline, deps
   → detection        lib/detect.ts       named phrases with weights (+ model)
   → attention score  lib/priorityScore.ts 14 rules, reasons that sum
   → signals          lib/agent.ts        evidence + source + confidence
   → questions        lib/agent.ts        what must be asked of a person
   → proposals        lib/agent.ts        a tracker change, pending approval
   → insights         lib/insights.ts     brief, roll-up, causes, adoption
```

The one subtlety worth knowing: the whole pipeline is synchronous, but a model
call is not. So the run pre-computes model verdicts for the texts it cares
about and installs them as a **detection override** — a `text → Detection` map
that `detect()` consults — then runs the synchronous brain, then clears it.
`lib/facts.ts` memoises per world **and per detector generation**, because a
cache that ignored the generation would pin every item to its regex reading and
the model's verdicts would never reach a signal.

## 4. Where state lives

Diagram [9 · How state is kept](DIAGRAMS.md#how-state-is-kept-base--decision-log)
and [18 · Data model](DIAGRAMS.md#data-model-today).

| Kind | What it is | Where |
|---|---|---|
| **Base snapshot** | what the tracker gave us: items, updates | Postgres `items`/`updates`, or `data/*.json` through the faked Jira adapter |
| **Decision log** | append-only human decisions | Postgres `events`, or `.data/events.json`, or this browser's `localStorage` with no backend |
| **Run log** | one row per agent run, with its snapshot | Postgres `agent_runs`, or `.data/runs.json` (capped at 50) |
| **Preferences** | theme, density, nav rail | the viewer's own browser, never the team record |

Nothing derived is stored. No attention score, no signal, no confidence is a
column anywhere — they are recomputed on read, which is what makes invariant 1
enforceable instead of aspirational.

The store backend is resolved by probing (`lib/server/store.ts`):

- `DATABASE_URL` unset → the file store, which is a supported mode, not an error.
- set and reachable → Postgres.
- set and unreachable → the file store, `/api/health` reports **degraded**, and
  the probe retries every 60s so a server that started before its database
  recovers on its own.
- once Postgres has answered, this process stays on Postgres. A later failure is
  a 5xx rather than a silent downgrade, because splitting the audit log across
  two backends is worse than failing.

## 5. The API boundary

Diagram [5 · API surface](DIAGRAMS.md#api-surface-and-its-guards), reference in
[API.md](API.md).

Every route is `route(name, handler, { limit })` from `lib/server/http.ts`, which
is why each route file is a few lines long. In one place, for all of them:

- **Validation** — `lib/validate.ts`; a 400 names every offending field at once.
- **One error envelope** — `{ error, code, requestId }`, with `details` on a
  validation failure. `error` stays a plain human string, so the existing
  browser helpers that read it were unaffected by the change.
- **No internal detail in production** — a 500 returns a generic message and
  logs the real one against the `requestId`. `BEACON_VERBOSE_ERRORS` (on by
  default outside production) returns it instead, which is what local work wants.
- **A request id** in `x-request-id`, inbound or generated, echoed in the body.
- **One access log line** per request: route, status, duration, request id.
- **`cache-control: no-store`** — these responses are per-request state.
- **Rate limits** on the three model-calling routes (30/min/caller) and the
  write routes (120/min/caller). In-process only: honest about that in
  [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md), and the reason a second
  replica needs Redis first.

## 6. Reliability choices worth knowing

| Risk | What was done | Where |
|---|---|---|
| A hung provider holds a stand-up update open | per-attempt deadline, retries with jittered backoff, an overall budget; 401/400/404 are not retried | `lib/llm/http.ts` |
| A model outage breaks the product | every call has a deterministic fallback — rules for detection, the rule template for a comment, rule cleanup for the composer | `lib/llm/index.ts`, `lib/server/agent.ts` |
| Two runs overlap and double the model bill | single-flight in the route (the second trigger joins the first) **and** a skip in the worker | `app/api/agent/run/route.ts`, `agent/run.mjs` |
| A corrupt `.data/events.json` silently becomes `[]`, and the next append overwrites the log | unreadable files are quarantined to `events.json.corrupt-<ts>` and the loss is logged; writes go through a temp file and a rename | `lib/server/fileStore.ts` |
| An idle Postgres client dies and takes the process with it | a pool `error` listener, plus connect/idle/statement timeouts | `lib/server/db.ts` |
| A screen throws and the whole app disappears | error boundaries inside the shell, a global one for a broken deploy, and a real 404 | `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx` |
| A secret ends up in a log line | field-name and pattern redaction, including credentials inside a connection string | `lib/server/log.ts` |

## 7. Build targets

One codebase, two outputs (`scripts/build.mjs`, `next.config.mjs`):

- **default** — the full server app with `/api`. Security headers are applied
  here (`next.config.mjs`); `BEACON_OUTPUT=standalone` produces the bundle the
  `Dockerfile` uses.
- **`BUILD_TARGET=pages`** — a static export for GitHub Pages. Route handlers
  cannot exist in an export, so the build moves `app/api` aside and always
  restores it. The result is every screen, the full brain, decisions in
  `localStorage`, and no shared log or live agent — stated plainly in the UI's
  privacy card rather than implied away.

## 8. Reading the code in the right order

1. `lib/types.ts` — the domain.
2. `lib/facts.ts` then `lib/priorityScore.ts` — the score and its reasons.
3. `lib/detect.ts` — the detector, and the override seam at the bottom.
4. `lib/agent.ts` — signals, confidence, requests, proposals.
5. `lib/events.ts` + `lib/world.ts` — what a decision is, and how state is built.
6. `lib/server/store.ts` — the two backends behind one interface.
7. `lib/server/agent.ts` — where the model meets the deterministic brain.
8. `test/` — the invariants, stated as assertions. Start with
   `test/engine.test.ts` and `test/world.test.ts`.
