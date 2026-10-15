# Beacon — operations runbook

Written for whoever is on the hook when this is running: how to start it, how to
tell whether it is healthy, and what to do when it is not.

Diagrams: [Deployment today](DIAGRAMS.md#deployment-today--three-ways-to-run-it),
[Observability](DIAGRAMS.md#observability--how-you-find-out-something-is-wrong),
[Failure modes](DIAGRAMS.md#failure-modes-and-graceful-degradation).

---

## 1. Start it

### Container (the closest thing to a deployment)

```bash
cp .env.example .env.local        # optional: a model key; absent is valid
docker compose up --build         # app + postgres + agent worker
docker compose run --rm seed      # once: load data/*.json into Postgres
open http://localhost:3000/overview
```

The app and the agent are the **same image** with different commands, so they
can never run different versions of the brain. `.data/` is a named volume: with
no database that volume *is* the decision log, and losing it loses the record.

### Local, no container

```bash
npm ci
npm run build && npx next start -p 3001      # UI + /api
npm run agent                                 # the clock, in a second shell
```

On Windows, use the production build rather than `next dev` for anything that
touches `/api`: `next dev` corrupts its shared webpack runtime chunk on
route recompiles and `/api/*` starts returning `MODULE_NOT_FOUND`. An
environment-only change needs a restart; a code change needs a rebuild.

`npm run local` (or `make local`) picks a free port, brings up the database if
Docker is available, and starts the worker too.

### Static UI only

`BUILD_TARGET=pages npm run build` → `out/`. Every screen works; there is no
`/api`, so no shared log, no live agent and no model calls. The privacy card in
the UI says which store is live, so nobody is misled about it.

## 2. Configuration

`.env.example` is the full list, with defaults. The ones that matter in
production:

| Variable | Default | Why you would change it |
|---|---|---|
| `DATABASE_URL` | unset | unset is a supported mode (file store). Set it for a shared, concurrent-safe log |
| `OPENAI_API_KEY` | unset | unset means rules-only, which works. Setting it turns on model detection |
| `BEACON_LLM_PROVIDER` | inferred | `openai`, `ollama` (nothing leaves the host), or `none` |
| `BEACON_DETECTOR` | `both` with a provider | `rules`, `llm`, or `both` (runs both and counts disagreements) |
| `BEACON_AGENT_INTERVAL_MINS` | 60 | run cadence |
| `BEACON_QUIET_HOURS` | unset | e.g. `20:00-07:00` — no scheduled runs in the window |
| `BEACON_LOG_FORMAT` | pretty, `json` in production | one JSON object per line for a log shipper |
| `BEACON_VERBOSE_ERRORS` | on outside production | **keep it off in a shared deployment** — it returns internal messages |
| `BEACON_ENABLE_HSTS` | off | turn on only once the deployment is HTTPS-only |

Secrets live in `.env.local` (gitignored) or your platform's secret store, never
in the repository. `npm run check:secrets` fails if an `.env` file is tracked or
a staged change looks like a key; `make hooks` installs it as a pre-commit hook.

## 3. Is it healthy?

```bash
curl -s localhost:3001/api/health | jq
curl -s 'localhost:3001/api/health?deep=1' | jq .world    # also reads the store
```

| Signal | Healthy | Act when |
|---|---|---|
| `status` | `ok` | `degraded` for more than ~15 min, or `error` at all |
| `store.backend` | `postgres` when `databaseUrlSet` | `file` **and** `databaseUrlSet: true` — decisions are going to a local file instead of the shared log |
| `detector.providerConfigured` | either value is fine | it flips to `false` unexpectedly after a key rotation |
| `version.commit` | the commit you deployed | it is not — a replica is stale |
| run log (`GET /api/agent/run`) | a row per cadence | no new row for two intervals |
| worker log | `scanned=… errors=0` | `run failed (N in a row)` |

Four alerts worth waking someone for (diagram 28):

1. `/api/health` `degraded` for 15 minutes.
2. Three consecutive failed agent runs — the worker logs a consecutive count.
3. Model error rate over ~20% of `llmCalls` — spend without value.
4. Dismissal rate over 30% for one signal kind — the detector is wrong, not the
   team. This one is about the product being unhelpful rather than down, and it
   is visible in the product itself under Insights → Adoption.

## 4. Reading the logs

One line per request, JSON in production:

```json
{"ts":"2026-10-14T17:13:59.081Z","level":"info","svc":"beacon","msg":"request",
 "route":"POST /api/events","status":201,"ms":7,"requestId":"3d1d…"}
```

A failed request logs at `warn` (expected: validation, rate limit, upstream) or
`error` (unexpected), with the real message and the first stack frames against
the same `requestId` the caller received. So the first move on any report is:

```bash
grep '<requestId>' <log>
```

Credentials are redacted by field name **and** by pattern, including
credentials embedded in a connection string — `test/log.test.ts` holds that line.

## 5. Incidents

**"Nothing on the board is updating."**
Check `GET /api/agent/run` for a recent row, then the worker log. The worker
backs off after repeated failures (30s, doubling, capped at the interval), so a
server that has been down for an hour is polled rarely — it recovers on its own
once the server is back, no restart needed.

**"`/api/health` says degraded."**
`store.error` is the Postgres error verbatim. Decisions made while degraded are
in `.data/events.json`, not in the database. Fix the database, then decide
whether to merge those events in — they are plain JSON, appended in order.
The probe retries every 60s, but note that **this process will keep using the
file store until it restarts** if it had already fallen back; restart the app
once the database is reachable to go back to Postgres.

**"A person reports an error with a reference."**
That reference is the `requestId`. Grep it (above). If the message is the
generic production one, the log line has the real cause.

**"The model bill looks wrong."**
`GET /api/agent/run` reports `llmCalls` per run; one call per active,
unfinished item per run. Reduce `BEACON_AGENT_INTERVAL_MINS`, set
`BEACON_QUIET_HOURS`, or switch `BEACON_DETECTOR=rules` — the product keeps
working, with the rule detector.

**"The store file is corrupt."**
It is quarantined automatically to `.data/events.json.corrupt-<timestamp>` and
logged at `error`; the service continues with an empty log rather than
overwriting the damaged file. Recover by hand: the file is a JSON array, so the
usual fix is to repair the trailing entry and move it back.

**"I need to stop the worker."**
`SIGTERM`/`SIGINT` stops the timer, lets an in-flight run finish, and exits 0 —
so a container restart never kills a run halfway through writing its snapshot.

## 6. Scheduled work

| Job | Command | Cadence |
|---|---|---|
| Agent runs | `npm run agent` (long-running), or `npm run agent:once` from cron/CI | `BEACON_AGENT_INTERVAL_MINS`, default 60 |
| Retention dry run | `npm run data:retain` | whenever — it changes nothing |
| Retention apply | `npm run data:retain:apply` | nightly |

`agent:once` and `retain` exit non-zero on failure, so cron and CI notice.

## 7. Deploying

- **Static UI** — every push to `main` runs `npm run verify` and publishes
  `out/` to GitHub Pages (`.github/workflows/deploy.yml`). The deploy does not
  skip the gate.
- **CI** — `.github/workflows/ci.yml`: typecheck, lint, secret scan, diagram
  check, 122 tests, then **both** build targets. A dependency audit runs
  advisory-only, on purpose: a new transitive advisory is information for the
  next change, not a reason to block a reviewed deploy.
- **Container** — built from the `Dockerfile`; pass `BEACON_COMMIT` so
  `/api/health` can name the build. Image publishing is not automated yet
  ([PRODUCTION-READINESS.md](PRODUCTION-READINESS.md)).
- **Rollback** — the image or the Pages deploy is the unit of rollback. Nothing
  in the decision log depends on the app version: it is a snapshot plus an
  append-only log, so an older build reads a newer log correctly.

## 8. Backups

| Data | How |
|---|---|
| Postgres | your managed snapshot/PITR. `events` is the only table that cannot be regenerated |
| `.data/` | back up the volume. With no database this is the decision log |
| `data/*.json` | in git — the base snapshot, regenerable with `node scripts/generate-seed.mjs` |

Restore test worth doing before a pilot: drop `events`, restore from backup, and
confirm the board shows the same state. Because the world is a pure function of
the snapshot and the log, that round trip is a complete check.
