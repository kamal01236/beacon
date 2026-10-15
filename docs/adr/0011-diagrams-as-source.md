# 0011 — Diagrams are sources, generated and checked in CI

**Status:** Accepted · 2026-10-14

## Context

An earlier design canvas — 23 hand-maintained artboards — drifted badly: six
different sidebars, screens unreachable from one another, 84 KB of duplicated
CSS. It was eventually deleted. Architecture pictures rot the same way, and a
rotten diagram is worse than no diagram, because it is believed.

## Decision

One Mermaid source per diagram under `docs/diagrams/src/*.mmd`, plus
`manifest.json` holding the order, the summary, how to read it, and what to check
when reviewing it. `scripts/build-diagrams.mjs` generates:

- `docs/diagrams/index.html` — a self-contained viewer (filter, zoom, SVG and PNG
  export, print-to-PDF of the whole set) that opens straight from the
  filesystem, with Mermaid vendored so it works offline;
- `docs/DIAGRAMS.md` — the same set, rendered natively by GitHub.

`npm run diagrams:check` runs in CI and fails if either output is stale, if the
manifest and the sources disagree, if a diagram does not parse, or if a `class`
line references a node or a `classDef` that does not exist.

## Consequences

- A diagram change is a reviewable text diff.
- A diagram that does not parse cannot reach `main`, so nobody opens the set and
  finds an error box.
- Generated files are committed, because the whole point is that a reviewer can
  open one file with no toolchain.
- Mermaid's 2.5 MB bundle is vendored into the repository. Deliberate: offline,
  double-click-to-open beats a smaller repository, and the viewer still falls
  back to a pinned CDN build if the file is missing.
- Mermaid's syntax limits are now known by experience rather than by surprise:
  sequence diagrams reject `<br/>` and treat `;` as a statement separator.

## Alternatives considered

- **Draw them in a diagramming tool.** Rejected: binary files, no diffs, and
  nothing stops them drifting from the code.
- **Markdown with fenced Mermaid only.** Rejected: GitHub renders it, but there
  is no offline viewer, no print-the-whole-set, and no validation.
