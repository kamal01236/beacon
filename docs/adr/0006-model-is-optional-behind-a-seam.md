# 0006 — The model is optional, behind a seam that returns the rule shape

**Status:** Accepted · 2026-10-09

## Context

A product that stops working when a model is unreachable, unaffordable or
disallowed is not deployable in an enterprise. And a model that is allowed to
assert a conclusion cannot be audited by the team that has to act on it.

## Decision

One provider interface (`lib/llm/types.ts`), two implementations (OpenAI, local
Ollama), and a return type identical to the rule detector's `Detection`. The
model supplies **evidence** — phrases with weights, plus a one-sentence
rationale. `lib/llm/normalize.ts` then recomputes the score from those phrases
and applies **our** threshold, discarding the model's own arithmetic and its own
`signal` flag.

Every model-dependent feature has a deterministic fallback: rules for detection,
the rule template for a drafted comment, a rule cleanup for the update composer.
`BEACON_LLM_PROVIDER` unset — the default — means nothing leaves the process.

## Consequences

- A provider outage degrades the product instead of breaking it, and the
  response says which path produced the result (`llm`, `rules`, `rules-local`),
  so the UI never claims a model ran when it did not.
- A confident model answer with no phrases scores zero. Certainty cannot exceed
  evidence.
- Enterprises with no external-AI policy can run the whole product on rules, or
  on a local model.
- We carry two code paths for every model feature. The cost is real and the
  tests cover both.

## Alternatives considered

- **Let the model decide the verdict.** Rejected: unexplainable, untunable, and
  unfalsifiable against the team's accept/dismiss record.
- **Require a model.** Rejected: it makes the product undeployable wherever the
  policy says no.
