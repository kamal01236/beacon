# 0009 — One HTTP contract for every route

**Status:** Accepted · 2026-10-14

## Context

Each route had grown its own `try/catch` returning `String(err)`. That meant a
Postgres connection string — password included — could be returned to a caller,
no two routes failed the same way, nothing validated its input beyond a
truthiness check, and nothing tied a user-visible failure to a log line.

## Decision

Every route is wrapped by `route()` in `lib/server/http.ts`, which owns: schema
validation (`lib/validate.ts`) with field-level 400s, one error envelope
`{ error, code, requestId }`, generic 500s in production with the real cause
logged against the request id, `x-request-id` in and out, one structured access
log line, `cache-control: no-store`, and per-route rate limits on the routes
that cost money or change state.

**Success bodies were left byte-for-byte unchanged**, and `error` stayed a plain
human-readable string, so every existing browser caller kept working.

## Consequences

- Route files are a few lines each; the interesting part of a route is its
  schema.
- A caller can branch on `code` instead of parsing prose.
- A bug report reduces to `grep <requestId>`.
- Changing cross-cutting behaviour is one edit, covered by `test/http.test.ts`
  rather than by fourteen near-identical tests.
- The rate limiter lives in process memory. Honest for one replica and wrong for
  two, which is why Redis is step 2 of the pre-pilot list.

## Alternatives considered

- **A validation library such as zod.** Rejected for now: the API surface is
  small, and the brain is shared with the browser bundle, so a dependency-free
  validator kept the client's dependency tree untouched. Worth revisiting if the
  surface grows.
- **Next middleware.** Rejected: it cannot own per-route response shaping, and it
  runs in a different runtime from the handlers.
