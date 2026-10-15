# Beacon — production readiness

Written for whoever has to decide whether to put this in front of a real team.
It is a scorecard, not a sales page: every row says what exists in code, and the
"no" rows are the useful ones.

**Verdict.** The engineering is production-grade for a **single-team, trusted-network
pilot**: typed, tested, validated at the boundary, bounded in time and cost,
observable, containerised, and gated in CI. It is **not** ready for an untrusted
network or multi-tenant use, because it has **no authentication and no
server-side authorisation**, and because two in-process guards (rate limiting
and the run lock) do not survive a second replica. Those are phase 4, listed
below with what they need.

Version `0.2.0` deliberately: `1.0.0` would claim a stable, deployable product,
and the rows marked **No** are why that would be overclaiming.

---

## 1. Scorecard

### Correctness and change safety

| Item | State | Evidence |
|---|---|---|
| Type safety, strict mode, no `any` escapes at boundaries | **Yes** | `tsconfig.json` `strict`, `npm run typecheck` in CI |
| Automated tests | **Yes** | 122 tests, 10 files, `npm test` (≈1s) |
| The product's invariants are asserted, not assumed | **Yes** | score = sum of reasons; only 2 event kinds mutate; model never decides a threshold |
| API contract tests through the real handlers | **Yes** | `test/api.test.ts`, 20 tests, sandboxed working directory |
| Linting | **Yes** | `eslint-config-next`, `--max-warnings=0`, build no longer ignores it |
| CI gate on every push and PR | **Yes** | `.github/workflows/ci.yml`: typecheck, lint, secrets, diagram check, tests, **both** build targets |
| Deploy runs the same gate | **Yes** | `deploy.yml` runs `npm run verify` before publishing |
| Documentation generated from source, checked in CI | **Yes** | 28 diagrams from `.mmd`; `npm run diagrams:check` fails if stale |
| Browser/visual regression tests | **No** | an e2e harness existed in a scratch session and is not in the repo. Screens are covered by types and by the brain's tests, not by rendering assertions |
| Load or soak testing | **No** | not done. The expensive path is one model call per active item per run |

### Runtime behaviour

| Item | State | Evidence |
|---|---|---|
| Input validation on every route, field-level errors | **Yes** | `lib/validate.ts`, `test/validate.test.ts` |
| One error contract; internals not leaked in production | **Yes** | `lib/server/http.ts`, asserted in `test/http.test.ts` |
| Request correlation ids, in and out | **Yes** | `x-request-id`, echoed in every error body |
| Structured logs with secret redaction | **Yes** | `lib/server/log.ts`, `test/log.test.ts` |
| Health/readiness endpoint that actually probes | **Yes** | `GET /api/health`, `?deep=1` reads the store |
| Timeouts on every outbound call | **Yes** | per-attempt + overall budget, `lib/llm/http.ts` |
| Retries with backoff, and no retry on non-retryable 4xx | **Yes** | `test/llm-http.test.ts` |
| Graceful degradation when a dependency is down | **Yes** | model → rules; Postgres → file store (reported as `degraded`); no API → browser-only mode |
| Idempotency / no duplicate expensive work | **Partial** | single-flight runs per process; a cross-replica lock is phase 4 |
| Rate limiting | **Partial** | per route, per caller, **in process only** |
| Graceful shutdown | **Yes** (worker) / **Partial** (app) | worker drains an in-flight run on SIGTERM; the app relies on Next's own handling |
| Request-level authentication | **No** | phase 4 |
| Authorisation enforced server-side | **No** | roles are a UI lens today |
| CSRF protection | **N/A today** | no cookies or sessions exist to ride; required the moment auth lands |

### Data

| Item | State | Evidence |
|---|---|---|
| Nothing derived is stored (no drift between a number and its explanation) | **Yes** | `test/world.test.ts` asserts the seed holds raw facts only |
| Append-only audit log, with every removal recorded | **Yes** | `lib/policy.ts`, `lib/events.ts` |
| Atomic writes; corruption quarantined rather than overwritten | **Yes** | `lib/server/fileStore.ts`, asserted in `test/api.test.ts` |
| Stated retention policy with a working sweep | **Yes** | 180 days, `POST /api/data/retention`, `scripts/retain.mjs` |
| Parameterised SQL everywhere | **Yes** | `lib/server/store.ts` |
| Schema migrations | **No** | `db/schema.sql` is `CREATE TABLE IF NOT EXISTS`. A pilot needs versioned migrations |
| Backup/restore procedure | **Documented, untested** | [OPERATIONS.md §8](OPERATIONS.md#8-backups) — the restore test is listed as pre-pilot work |
| Erasure of a person's record | **No** | pseudonymisation needs sign-in: phase 4, stated in `lib/policy.ts` rather than implied |
| Multi-tenant isolation | **No** | one team per deployment; phase 5 |

### Delivery and operations

| Item | State | Evidence |
|---|---|---|
| Reproducible install | **Yes** | `package-lock.json`, `npm ci`, Node pinned in `.nvmrc` + `engines` |
| Container image, non-root, health check | **Yes** | `Dockerfile` (standalone output, `USER node`, `HEALTHCHECK`) |
| One-command local stack | **Yes** | `docker compose up --build`, or `npm run local` |
| Build identity in the running app | **Yes** | version + commit + target in `/api/health` |
| Secret hygiene enforced | **Yes** | `.gitignore`, `scripts/check-secrets.mjs`, pre-commit hook, `.dockerignore` |
| Security headers | **Yes, with a known weakness** | CSP keeps `'unsafe-inline'` (see below) |
| Dependency audit | **Advisory** | `npm audit --omit=dev` runs non-blocking in CI |
| Automated image publishing | **No** | the image is built on demand |
| Metrics, dashboards, alerting | **No** | the signals exist (logs, run rows, health, adoption); collection is phase 4 — diagram 28 names the four alerts worth having |
| Accessibility | **Baseline, unaudited** | keyboard and screen-reader baseline from phase 2; a WCAG 2.2 AA audit is phase 5 |
| A licence | **No — owner's decision** | the repository is public with no `LICENSE` file, so by default nobody may reuse it. Pick one (MIT if you want it reusable) before inviting contributions |

## 2. The five things to do before a pilot

In order, because each unblocks the next.

1. **SSO and server-side role checks.** Replace the trusted `actor` string with
   a verified subject and enforce the permission set in diagram 25 inside
   `route()`. This is also what makes erasure answerable and CSRF relevant.
2. **Move the rate limiter and the run lock to Redis.** Until then, two
   replicas means double the limit and overlapping runs — so run one replica
   and say so.
3. **Versioned migrations.** `CREATE TABLE IF NOT EXISTS` is fine for a fresh
   database and wrong for the second deploy that changes a column.
4. **Test the restore.** Drop `events`, restore, confirm the board matches.
   Because the world is a pure function of the snapshot plus the log, that round
   trip is a complete correctness check.
5. **Collect the logs and wire the four alerts.** The product already emits
   everything they need.

Then, for the pilot's own value: a measured first-week baseline, so the impact
numbers are measurements rather than estimates.

## 3. Known weaknesses, in one place

- **No authentication.** The single biggest gap; everything about authorisation
  follows from it.
- **CSP allows `'unsafe-inline'`** for script and style. The inline theme boot
  script (which prevents a flash of the wrong theme) and inline style
  attributes both need rework for a nonce-based policy.
- **In-process rate limiting and run lock** — correct for one replica, wrong for
  two.
- **The file store is single-writer**, last-write-wins. It is the no-database
  fallback, not a production store; `/api/health` reports when it is live while
  a database was configured.
- **No schema migrations.**
- **No visual/e2e tests in the repo.**
- **Burndown and cycle time are honest but thin**: the charts draw only the days
  they really have, because no daily snapshot is stored yet
  (`SNAPSHOT_DAY` in diagram 26 is the fix).
- **Adoption metrics need usage.** With no decisions recorded, rates are `null`
  rather than a flattering zero — correct, and also a reminder that the numbers
  mean nothing until a team uses it.

## 4. What this prototype does better than most

Worth stating, because the list above is deliberately unflattering:

- **The explanation cannot drift from the number.** Nothing derived is stored,
  and a test asserts `score == sum(reasons)` for every seeded item.
- **The model cannot assert a conclusion.** It supplies phrases; the score is
  recomputed and the threshold is the product's. A confident answer with no
  evidence scores zero.
- **A model outage is not an outage.** Every model call has a deterministic
  fallback, and the response says which one produced the result, so the UI never
  claims a model ran when it did not.
- **Every change to the tracker traces to a human decision** that can be undone
  without editing the record.
- **The gaps are in the code's own comments**, not only in this document —
  `lib/policy.ts` explains why there is no "delete everything" button, and
  `lib/server/http.ts` says in its header that its rate limiter is per process.
