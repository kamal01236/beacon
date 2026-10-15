# 0005 — The brain is a shared library, not a service

**Status:** Accepted · 2026-10-09

## Context

The scoring, detection and signal logic has to run in three places: the server
(for an agent run), the browser (so the UI can explain a number without a round
trip), and the static export (which has no server at all).

## Decision

`lib/facts.ts`, `lib/detect.ts`, `lib/priorityScore.ts`, `lib/agent.ts` and
`lib/insights.ts` are pure, synchronous functions over a `World`, with no I/O.
Both runtimes import them. Server-only code lives under `lib/server/` and
`lib/llm/` and is never imported by a screen — the import rule is drawn in
diagram 4 and matters because a leak would put `DATABASE_URL` or a model key in
the browser bundle.

## Consequences

- A score shown in the browser is computed by the same code the agent ran.
- The static export is a genuinely complete product demo rather than a mock.
- The model, which is async, cannot be called from inside the synchronous
  pipeline. Hence the **detection override**: a run pre-computes verdicts for
  the texts it cares about, installs them as a `text → Detection` map, runs the
  synchronous brain, and clears it. The memo in `lib/facts.ts` is keyed by a
  detector generation for exactly this reason.
- The browser bundle carries the brain. It is small (pure functions over JSON)
  and the trade is worth it.

## Alternatives considered

- **A scoring service.** Rejected: a network hop to explain a number, and two
  implementations the day someone wants it client-side.
