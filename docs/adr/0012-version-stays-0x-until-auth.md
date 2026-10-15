# 0012 — The version stays 0.x until authentication exists

**Status:** Accepted · 2026-10-14

## Context

The hardening pass added tests, CI, boundary validation, timeouts, structured
logs, a health endpoint and a container image. It would be easy — and wrong — to
call that 1.0.0. The service still has no authentication and no server-side
authorisation, and two of its guards (rate limiting and the single-flight run
lock) are per process.

## Decision

`package.json` stays on `0.2.0`. `1.0.0` is reserved for the point where a
deployment can face an untrusted network: SSO, server-side role enforcement, a
shared rate limiter and a cross-replica run lock. The gating list is
[PRODUCTION-READINESS.md §2](../PRODUCTION-READINESS.md#2-the-five-things-to-do-before-a-pilot).

## Consequences

- The version number carries information instead of optimism.
- `/api/health` reports the version and the commit, so a running deployment can
  be checked against this claim.
- Anyone evaluating the repository gets the same story from the version, the
  readiness document and the code comments.

## Alternatives considered

- **Ship 1.0.0 because the engineering is solid.** Rejected: the engineering is
  solid *for a trusted-network pilot*, and a version number is read as a claim
  about the product, not about the test suite.
