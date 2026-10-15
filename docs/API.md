# Beacon — HTTP API

Ten paths, fourteen method–path pairs. Present in the **server** build only; the
static GitHub Pages export has no `/api` and the browser falls back to the
bundled seed and `localStorage`.

Diagram: [API surface and its guards](DIAGRAMS.md#api-surface-and-its-guards).

There is **no authentication yet**. `actor` is validated as a well-formed member
id, not as a verified identity — see
[SECURITY-AND-PRIVACY.md](SECURITY-AND-PRIVACY.md) and
[PRODUCTION-READINESS.md](PRODUCTION-READINESS.md). Do not expose this service
to an untrusted network before phase 4.

---

## The shared contract

Everything below is applied by `route()` in `lib/server/http.ts`, for every
endpoint:

- Responses carry **`cache-control: no-store`** and **`x-request-id`** (your
  inbound `x-request-id` is kept if you send one).
- **Success bodies have no envelope** — the body is the data.
- **Every failure has the same shape:**

```json
{
  "error": "mode: must be one of: cleanup, summarize",
  "code": "VALIDATION_FAILED",
  "requestId": "0f1c…",
  "details": [{ "field": "mode", "message": "must be one of: cleanup, summarize" }]
}
```

| Status | `code` | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | a field is missing, wrong, or out of range — `details` lists **every** offending field |
| 404 | `NOT_FOUND` | the named thing does not exist |
| 413 | `PAYLOAD_TOO_LARGE` | the body is over the route's cap (64 KB default) |
| 429 | `RATE_LIMITED` | over the route's limit; `retry-after` says how long |
| 502 | `UPSTREAM_UNAVAILABLE` | a dependency we call failed |
| 500 | `INTERNAL` | unexpected. In production the message is generic — quote `requestId`, which appears in the server log line with the real cause |

Rate limits, per caller per minute: **30** on the three model-calling routes,
**120** on the write routes. In-process counters, so they do not hold across
replicas or restarts.

---

## Reads

### `GET /api/health`

Liveness and readiness. `?deep=1` additionally loads the world, exercising the
store and the reducer.

```json
{
  "status": "degraded",
  "version": { "version": "0.2.0", "commit": "a1b2c3d", "builtAt": "…", "target": "server" },
  "uptimeSeconds": 41,
  "store": { "backend": "file", "databaseUrlSet": true, "lastProbeAt": "…", "error": "password authentication failed" },
  "detector": { "mode": "both", "provider": "openai", "model": "gpt-4o-mini", "providerConfigured": true, "compose": false },
  "agent": { "intervalMins": 60, "quietHours": "20:00-07:00", "activeSprintId": "s2" },
  "world": { "items": 100, "updates": 55, "events": 0 },
  "worldError": null
}
```

| `status` | Meaning | HTTP |
|---|---|---|
| `ok` | everything the request path needs is working | 200 |
| `degraded` | serving, but on a fallback: a database is configured and unreachable | 200 |
| `error` | the store could not be read — do not send traffic | 503 |

`providerConfigured: false` is **not** a fault: rules-only is a supported mode.
The API key itself is never reported.

### `GET /api/base`

The base snapshot the browser hydrates from: `{ items, updates }`. From Postgres
when configured, otherwise from the faked Jira adapter over `data/*.json`.

### `GET /api/world`

`{ items, updates, events }` — the base snapshot with the effective decisions
applied. This is what every screen renders.

### `GET /api/events`

The whole decision log, oldest first.

### `GET /api/jira/search`

The raw ingested payload, shaped like Jira Cloud's
`GET /rest/api/3/search`. Useful for showing that the board is an adaptation of
a tracker response rather than a bespoke format.

### `GET /api/agent/run?limit=5`

The last runs, newest first, without their (large) snapshots:

```json
[{ "at": "…", "trigger": "schedule", "detector": "both", "provider": "openai",
   "model": "gpt-4o-mini", "itemsScanned": 42, "signalsOpen": 7 }]
```

`limit` is 1–50, default 5.

### `GET /api/data/retention?days=180`

The retention dry run. Removes nothing.

```json
{ "olderThanDays": 180, "cutoff": "2026-04-17T…", "total": 128, "expired": 3 }
```

`days` is 1–3650; out of range is a 400 rather than a silent reinterpretation.

---

## Model-calling routes

All three write nothing, all three cost money, all three are rate limited, and
all three have a deterministic fallback so they never dead-end.

### `POST /api/agent/analyze`

Re-read one edited draft with the same detector a run uses.

```jsonc
// request
{ "itemId": "req-001", "text": "still stuck on the signature", "status": "in_progress" }
```

```jsonc
// response
{ "verdict": "blocked", "signal": true, "score": 6, "threshold": 4,
  "hits": [{ "phrase": "stuck", "weight": 3 }], "relief": [],
  "rationale": "…", "answer": "This still reads as a real blocker. …",
  "causes": ["Technical / documentation gap"],
  "provider": "openai", "model": "gpt-4o-mini" }
```

`text` ≤ 4 KB. `provider: null` means the rule detector answered.

### `POST /api/agent/compose`

Phrase one proposal comment. `fallback` (the rule template) is required and is
returned verbatim if no model is configured or it errors.

```jsonc
{ "itemId": "req-001", "intent": "chase the client for credentials",
  "fallback": "@Sarah could you chase the sandbox credentials today?",
  "audience": "Sarah" }
→ { "text": "…", "source": "llm" | "template", "provider": "openai", "model": "gpt-4o-mini" }
```

### `POST /api/agent/summarize`

Clean up or summarise one free-text update.

```jsonc
{ "itemId": "req-001", "mode": "cleanup" | "summarize",
  "raw": "still   waiting on the client", "seed": null }
→ { "text": "Still waiting on the client.", "proposedStatus": null,
    "questions": [], "source": "rules", "provider": null, "model": null }
```

`raw` and `seed` ≤ 4 KB each. `source` is `llm`, `rules` (server-side
deterministic cleanup) or, from the browser helper with no backend,
`rules-local`. In `cleanup` mode no status is ever proposed.

### `POST /api/agent/run`

Trigger a run. Body is optional; `trigger` is `manual` (default), `event` or
`schedule`.

```jsonc
{ "trigger": "manual" }
→ { "trigger": "manual", "detector": "both", "provider": "openai", "model": "gpt-4o-mini",
    "itemsScanned": 42, "llmCalls": 18, "disagreements": 2, "signalsOpen": 7,
    "composed": 0, "errors": 0, "joined": false }
```

**Single flight**: a trigger that arrives while a run is in progress joins it and
comes back with `joined: true` rather than starting a second run. `errors`
counts provider failures that fell back to the rules — a run with errors still
succeeds.

---

## Writes

### `POST /api/events`

Append one human decision. The server stamps `id` and `at`; never send them.

```jsonc
{ "actor": "m-002",
  "draft": { "kind": "update.posted", "itemId": "req-001", "status": "blocked",
             "text": "Waiting on the client for sandbox credentials",
             "blocker": "No sandbox credentials" } }
→ 201 { "id": "ev-…", "at": "…", "actor": "m-002", "kind": "update.posted", … }
```

`draft.kind` must be one of the eight kinds in `lib/events.ts`
(`EVENT_KINDS`); anything else is a 400 naming `draft.kind`. `actor` must match
`^[A-Za-z0-9._:-]{1,64}$`.

### `DELETE /api/events`

Empty the log — **the demo-instance reset, not a privacy control**. Returns
`{ "deleted": n }`. The caller (the facilitator-only control in
`components/privacy.tsx`) immediately POSTs a `data.reset` event, so the emptied
log still records who emptied it and when.

### `POST /api/data/retention`

Apply the retention policy. Body optional; `days` 1–3650, default 180.

```jsonc
{ "days": 180 }
→ { "olderThanDays": 180, "cutoff": "…", "removed": 3 }
```

When `removed > 0` a `data.retained` event is appended, so the gap in the log is
explained. When nothing was expired, nothing is appended — a nightly no-op must
not grow the audit trail.

---

## Trying it

```bash
npm run build && npx next start -p 3001

curl -s localhost:3001/api/health?deep=1 | jq .status
curl -s localhost:3001/api/world | jq '.items | length'

# a 400 that names the field
curl -s -X POST localhost:3001/api/events \
  -H 'content-type: application/json' -d '{"draft":{"kind":"nope"}}' | jq

# a real decision
curl -s -X POST localhost:3001/api/events -H 'content-type: application/json' \
  -d '{"actor":"m-002","draft":{"kind":"feedback.given","target":"sig-1","helpful":true}}' | jq
```

Every endpoint is also exercised in-process by `test/api.test.ts`, against a
sandboxed working directory — that file is the executable version of this page.
