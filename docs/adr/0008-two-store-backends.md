# 0008 — Two store backends behind one adapter, chosen by probing

**Status:** Accepted · 2026-10-10

## Context

A reviewer should be able to clone the repository and exercise the whole API and
agent path with no Docker and no Postgres. A team sharing one record needs a real
database. Both have to be first-class, and the choice must not fork the code.

## Decision

`lib/server/store.ts` exposes one interface and resolves the backend by probing:
`DATABASE_URL` unset → the `.data/` file store; set and reachable → Postgres;
set and unreachable → the file store, with `/api/health` reporting **degraded**
and the probe retrying every 60 seconds.

Once Postgres has answered, the process stays on Postgres. A later failure is a
5xx, not a silent downgrade.

## Consequences

- `npm ci && npm run build && npx next start` gives a fully working backend.
- The downgrade is visible: in the health endpoint, in the logs, and in the
  product's own privacy card.
- Refusing to fall back *after* Postgres has worked avoids the worst outcome —
  half the team's decisions in a database and half in a local file.
- The file store needed real care to be trustworthy: atomic temp-file writes,
  and quarantining an unreadable file instead of treating it as empty, which
  previously let the next append overwrite the entire log.
- It is single-writer, last-write-wins. Stated, not hidden.

## Alternatives considered

- **Postgres only.** Rejected: a reviewer without Docker cannot see the backend
  at all.
- **An in-memory store for development.** Rejected: decisions vanish on restart,
  which is the opposite of what the product claims.
