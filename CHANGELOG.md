# Changelog

Notable changes to Beacon. Dates are the day the work landed.

## 0.2.0 — 2026-10-14 · production hardening, documentation and diagrams

No change to what the product does. Everything here is about whether it could be
run, operated and reviewed by someone other than its author. The gating list for
`1.0.0` is [docs/PRODUCTION-READINESS.md §2](docs/PRODUCTION-READINESS.md#2-the-five-things-to-do-before-a-pilot)
(see [ADR 0012](docs/adr/0012-version-stays-0x-until-auth.md) for why the version
is not 1.0.0).

### Added — tests and gates

- **122 tests** across 10 files (`npm test`, ~1s), including the product's
  invariants (score equals the sum of its reasons; only two event kinds change an
  item; the model never decides a threshold) and all ten API endpoints exercised
  through the real route handlers in a sandboxed working directory.
- `npm run verify` — typecheck, lint, secret scan, diagram check, tests.
- **CI** (`.github/workflows/ci.yml`): the gate on every push and PR, then both
  build targets; an advisory dependency audit. The Pages deploy now runs the same
  gate before publishing.
- ESLint configured (`eslint-config-next`, `--max-warnings=0`); the build no
  longer ignores lint errors.

### Added — runtime hardening

- `lib/server/http.ts` — one contract for every route: schema validation with
  field-level 400s, one error envelope `{ error, code, requestId }`, generic 500s
  in production with the real cause logged against the request id, `x-request-id`
  in and out, one structured access log line, `no-store`, and per-route rate
  limits. Success bodies are unchanged ([ADR 0009](docs/adr/0009-one-http-contract.md)).
- `lib/validate.ts` — dependency-free request validation; reports every bad field
  at once and measures body size on decoded bytes.
- `lib/server/log.ts` — structured JSON logs with secret redaction, including
  credentials embedded in a connection string.
- `lib/llm/http.ts` — every model call now has a per-attempt deadline, an overall
  budget, retries with jittered backoff that honour `Retry-After`, and no retry on
  a non-retryable 4xx.
- `GET /api/health` — liveness and readiness: store backend and why a probe
  failed, detector and model in use, build version and commit, `?deep=1` to read
  the world. Reports `degraded` when a configured database is unreachable.
- `POST /api/agent/run` is **single flight** — a concurrent trigger joins the run
  in progress instead of starting another.
- Security headers on the server target (CSP, `X-Frame-Options`, `nosniff`,
  `Referrer-Policy`, `Permissions-Policy`, COOP, opt-in HSTS); `X-Powered-By`
  removed.
- Error boundaries: `app/error.tsx` (one screen fails inside the shell),
  `app/global-error.tsx` (a broken deploy), `app/not-found.tsx` (a stale item
  link is a normal event).
- The agent worker drains an in-flight run on `SIGTERM`/`SIGINT`, backs off after
  repeated failures, bounds each trigger with a deadline, skips a tick while a run
  is in flight, and exits non-zero from `--once` so cron and CI notice.
- Postgres pool: an `error` listener (an idle client dying no longer takes the
  process down), plus connect, idle and statement timeouts.

### Fixed

- **A corrupt `.data/events.json` was parsed as `[]`, and the next append
  overwrote the whole decision log.** Unreadable store files are now quarantined
  to `events.json.corrupt-<timestamp>` and the loss is logged; every write goes
  through a temp file and a rename, so a crash mid-write cannot truncate the log.
- The store no longer pins itself to the file fallback for the life of the
  process when Postgres was down at startup — the probe retries every 60s. Once
  Postgres has answered it stays on Postgres, so the log cannot be split across
  two backends.
- `data/kb.json` failing to load was silent; it now logs a warning.
- Run snapshots in the file store are capped at 50 rows, so an hourly worker no
  longer grows that file without bound.

### Added — documentation

- **28 diagrams**, generated from Mermaid sources and validated in CI
  ([ADR 0011](docs/adr/0011-diagrams-as-source.md)): C4 levels 1–4, DFD levels
  0–2, sequences, state machines, ER models, deployment, a threat model, an
  observability map, a user journey, a roadmap, and the phase 4–5 target
  architecture. Readable three ways: a self-contained offline viewer
  (`docs/diagrams/index.html`), `docs/DIAGRAMS.md` on GitHub, or the `.mmd`
  sources as diffs.
- `docs/ARCHITECTURE.md`, `docs/DATA-FLOW.md`, `docs/API.md`,
  `docs/OPERATIONS.md`, `docs/SECURITY-AND-PRIVACY.md`,
  `docs/PRODUCTION-READINESS.md`, `docs/TESTING.md`, and 12 ADRs.
- `CONTRIBUTING.md`, `SECURITY.md`, this changelog.
- `Dockerfile` (standalone output, non-root, real health check) and
  `docker-compose.yml` bringing up the app, Postgres and the worker — the app and
  the worker from one image, so they cannot be different versions.
- `.nvmrc`, `engines`, `.editorconfig`, `.dockerignore`.

## 0.1.0 — 2026-10-09 to 2026-10-13 · the prototype

Phases 1–3 of the roadmap in [README.md](README.md):

- **Honest engine** — a computed attention score from 14 named rules, a
  phrase-weight language detector, calibrated confidence, and a seed reduced to
  raw facts only ([ADR 0003](docs/adr/0003-store-no-derived-values.md)).
- **Human in control** — an append-only decision log with undo, preview-and-
  approve for every tracker change, author-first blocker prompts, adoption
  metrics, a read-only manager lens, and a privacy panel
  ([ADR 0004](docs/adr/0004-state-is-snapshot-plus-log.md),
  [ADR 0010](docs/adr/0010-data-policy-split.md)).
- **Live agent** — a server-side store (Postgres, or `.data/` with no database),
  `/api` for the world, the log and runs, the worker as a real clock with cadence
  and quiet hours, LLM detection behind the rule detector's own shape with a
  guaranteed fallback, and a working retention sweep
  ([ADR 0006](docs/adr/0006-model-is-optional-behind-a-seam.md),
  [ADR 0007](docs/adr/0007-worker-is-only-a-clock.md),
  [ADR 0008](docs/adr/0008-two-store-backends.md)).
