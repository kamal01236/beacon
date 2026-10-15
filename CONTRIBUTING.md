# Contributing to Beacon

## Setup

```bash
npm ci                 # Node 20.11+ (see .nvmrc)
npm test               # 122 tests, ~1s
npm run verify         # the whole gate: typecheck · lint · secrets · diagrams · tests
```

To run the backend, use the **production** build rather than `next dev` — on
Windows `next dev` corrupts its shared webpack runtime chunk when API routes are
recompiled, and `/api/*` starts returning `MODULE_NOT_FOUND`:

```bash
npm run build && npx next start -p 3001
npm run agent          # the clock, in a second shell
```

Install the secret-scan pre-commit hook once: `make hooks`.

## Before you push

`npm run verify` must pass. It is exactly what CI runs, plus CI also builds both
targets (`server` and `pages`) because a change can break one and not the other.

## The invariants

These are the product, not implementation details. If a change breaks one, the
change is wrong — not the test.

1. **The attention score equals the sum of the reasons shown next to it.** Never
   add points without a named reason, and never store a score.
2. **Every reason cites a rule listed in `RULES`** (`lib/priorityScore.ts`), so
   it appears in "How scoring works".
3. **Only two event kinds change an item**: someone's own `update.posted`, and a
   `proposal.decided` that was approved. Everything else is recorded and changes
   nothing.
4. **Corrections are new events** (`event.undone`). The log is never edited.
5. **The model supplies evidence, never a conclusion.** Scores are recomputed
   from the phrases it returns, and the threshold is ours.
6. **Every model-dependent feature has a deterministic fallback**, and the
   response says which path produced the result.
7. **Nothing server-only reaches the browser bundle.** Nothing under
   `lib/server/`, `lib/llm/` or `lib/config.ts` may be imported by a screen.
8. **Adoption metrics stay team- and type-level.** No per-person performance
   anything.

## Conventions

**Comments explain why, at the top of the file.** Each module opens with what it
is for and which decision it encodes. Match that density — it is how this
codebase stays readable — and do not restate what the code already says.

**Add a rule, not a special case.** New scoring behaviour is a `RULES` entry and
an `add(...)` call; new detector behaviour is a phrase with a weight. Both show
up in the UI automatically.

**Validate at the boundary, nowhere else.** Routes parse their body through
`lib/validate.ts`; the brain assumes typed input.

**Server logging goes through `lib/server/log.ts`.** `console` is lint-allowed
only in `scripts/` and `agent/`.

**Touching a diagram?** Edit `docs/diagrams/src/*.mmd` (and `manifest.json` if
you add one), then `npm run diagrams`, and commit the regenerated
`docs/diagrams/index.html` and `docs/DIAGRAMS.md`. CI fails if they are stale.
Sequence diagrams reject `<br/>` and treat `;` as a statement separator. If you
changed a diagram's shape, run `npm run diagrams:render` — it renders all 28
headlessly and catches the things parsing cannot (it is opt-in because it leans
on jsdom standing in for SVG geometry, which should never fail a CI build).

**Changing a decision?** Add or supersede an ADR in `docs/adr/`. If a change
makes something in [docs/PRODUCTION-READINESS.md](docs/PRODUCTION-READINESS.md)
true or false, update that row in the same commit.

## Tests

`node:test` with `tsx`; see [docs/TESTING.md](docs/TESTING.md). Name a test as
the claim it defends, test the promise rather than the implementation, and for
every dependency add a test for it being absent — no provider, a throwing
provider, a corrupt store file. Anything that writes must run in a sandbox
directory, never in the repository.

## Commits and pull requests

- Present-tense summary line; body says *why*.
- One concern per PR where possible. A hardening change and a product change in
  one diff are hard to review.
- Say in the PR which invariant or readiness row the change affects.
- Never commit a `.env` file or a key. `npm run check:secrets` is the backstop,
  not the plan.

## Where to start reading

`docs/ARCHITECTURE.md` §8 lists the files in the order that makes them make
sense, and `docs/DIAGRAMS.md` is the same system in pictures.
