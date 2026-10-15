# 0007 — The agent worker is a clock; the run lives in the server

**Status:** Accepted · 2026-10-09

## Context

Beacon is a background agent, not only a dashboard: it must run on a schedule
and on events. The obvious shape is a standalone worker process that contains
the agent. The obvious shape is wrong here — the agent's logic is the same
TypeScript the UI uses, and duplicating it in a worker guarantees the two drift.

## Decision

`agent/run.mjs` decides only **when**, and calls `POST /api/agent/run`. The run
itself (`lib/server/agent.ts`) executes inside the Next server, so the worker, a
webhook, and the "Run now" button in the UI all execute the same code path.

## Consequences

- One implementation of a run. The worker is ~170 lines, almost all of it about
  not overlapping runs, not hammering a dead server, and exiting cleanly.
- The worker needs no database access, no model key, and no build step.
- Overlap has to be prevented in two places: the worker skips a tick while a run
  is in flight, and the route joins a concurrent trigger (single flight). The
  second guard is the one that matters, because the UI and a webhook can trigger
  a run too.
- An operator can trigger a run with `curl`, and the same deadline and rate
  limit apply to them as to the worker.
- The container runs the app and the worker from one image, so they cannot be
  different versions.

## Alternatives considered

- **A fat worker with its own copy of the brain.** Rejected: guaranteed drift.
- **In-process timers inside the web server.** Rejected: a timer tied to a web
  process is invisible from outside, hard to test, and dies silently.
