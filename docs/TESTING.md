# Beacon — testing

```bash
npm test            # 122 tests, ~1s
npm run test:watch  # same, on change
npm run verify      # typecheck → lint → secret scan → diagram check → tests
npm run diagrams:render   # opt-in: render all 28 diagrams headlessly
```

Written for whoever is about to change this code. The short version: the tests
are a statement of the product's invariants, so if one fails, read it as "this
change broke a promise" before assuming the test is wrong.

---

## 1. How it runs

`node:test` with `tsx` as the loader — no framework, no config file, two dev
dependencies. Each file is its own process, which is what lets
`test/api.test.ts` `chdir` into a sandbox without affecting anything else.

| File | Tests | What it pins down |
|---|---|---|
| `engine.test.ts` | 17 | detection, the attention score, facts. **The two invariants**: the score equals the sum of the reasons shown, for every seeded item; every reason names a documented rule |
| `world.test.ts` | 11 | the reducer: only an own update or an approved proposal changes an item; undo leaves no trace; the base snapshot is never mutated; the outbox is exactly what would be written |
| `agent.test.ts` | 16 | every signal carries evidence, a source and a confidence with a basis; nothing proposed starts applied; the author is asked first; a model outage degrades to the rules |
| `api.test.ts` | 20 | all ten endpoints through the real handlers: a decision round trip, field-level 400s, oversized bodies, single-flight runs, the retention sweep, store-file quarantine |
| `policy.test.ts` | 17 | retention arithmetic, the Jira adapter round trip, chart honesty (the donut accounts for every item; the burndown never projects), config fallbacks |
| `validate.test.ts` | 11 | the boundary: every bad field reported at once, unknown keys dropped, size measured on decoded bytes |
| `http.test.ts` | 10 | the error contract, request ids, rate limiting, and that a 500 never leaks its message in production |
| `llm-http.test.ts` | 9 | deadlines, retries, `Retry-After`, no retry on 401, overall budget, non-JSON body |
| `normalize.test.ts` | 7 | whatever a model returns, the score is recomputed from its phrases and the threshold stays ours |
| `log.test.ts` | 4 | secrets redacted by field name and by pattern, including inside a connection string |

## 2. What is deliberately not tested

- **Rendering.** There are no component or visual tests. The brain is pure and
  heavily covered; the screens read it. A browser e2e harness existed in a
  working session and is not in the repo — listed as a gap in
  [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md) rather than implied.
- **The real model providers.** `test/llm-http.test.ts` injects `fetch`, so no
  test ever spends money or needs a network. The provider adapters are thin
  wrappers over that transport by design.
- **Postgres.** The database path is exercised by running it
  (`docker compose up`), not by a test container. The file-store path — which
  is what a fresh clone uses — is covered end to end.

## 3. Conventions worth keeping

**Test the promise, not the implementation.** `score == sum(reasons)` holds
whatever rules exist; a test that asserted "REQ-001 scores 98" would break on
every legitimate tuning change. Where a specific value *is* the point — the
demo's headline item must stay above the attention line — the test says why.

**Name the test as the claim.** The names read as sentences:
*"a provider that throws falls back to the rules, and the failure is reported
once"*. A failing test name should tell you what broke without opening the file.

**Isolate anything that writes.** `test/api.test.ts` copies `data/` into a
temp directory and `chdir`s **before** importing the route modules, because the
file store resolves `.data/` from the working directory at import time. Nothing
in the suite writes into the repository.

**Assert the degraded path too.** For every dependency, there is a test for it
being absent: no provider, a throwing provider, an empty response, a corrupt
store file. Those paths are the ones a user hits on a bad day.

## 4. Adding a test

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { attentionScore } from "@/lib/priorityScore";
import { SEED } from "@/lib/data";

test("a new rule contributes a reason, not a silent bump", () => {
  const item = SEED.items.find((i) => i.id === "req-001")!;
  const s = attentionScore(item, SEED);
  assert.equal(s.value, s.reasons.reduce((a, r) => a + r.points, 0));
});
```

Path aliases (`@/…`) and JSON imports work as they do in the app. If you add a
test file, `npm test` picks it up — the script globs `test/*.test.ts`.

## 5. When a test fails

| Failure | Usually means |
|---|---|
| `score must be the sum of the reasons` | a scoring change added points without a reason, or mutated `value` directly |
| `reason cites unknown rule "x"` | a new rule is missing from `RULES`, so it would not appear in "How scoring works" |
| `the seeded sprint raises no hidden blocker` | the seed or the frozen clock moved, and the demo's own premise changed |
| `an undone event leaves no trace` | the reducer stopped honouring `effective()` |
| diagram check fails | a `.mmd` source changed without `npm run diagrams` — regenerate and commit |
| lint fails on a `console` call | use `lib/server/log.ts` on the server; `console` is allowed in scripts and the worker |
