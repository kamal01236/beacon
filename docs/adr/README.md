# Architecture decision records

One file per decision that would be expensive to reverse, or that a reader would
otherwise have to reconstruct from the code. Each is short on purpose: the
context, the decision, and what it costs us.

| # | Decision | Status |
|---|---|---|
| [0001](0001-companion-not-replacement.md) | Beacon is a companion layer over Jira/ADO, not a replacement | Accepted |
| [0002](0002-two-layer-priority.md) | Two layers: human work priority, and a computed attention score | Accepted |
| [0003](0003-store-no-derived-values.md) | Nothing derived is ever stored | Accepted |
| [0004](0004-state-is-snapshot-plus-log.md) | State is a base snapshot plus an append-only decision log | Accepted |
| [0005](0005-brain-is-a-library.md) | The brain is a shared library, not a service | Accepted |
| [0006](0006-model-is-optional-behind-a-seam.md) | The model is optional, behind a seam that returns the rule shape | Accepted |
| [0007](0007-worker-is-only-a-clock.md) | The agent worker is a clock; the run lives in the server | Accepted |
| [0008](0008-two-store-backends.md) | Two store backends behind one adapter, chosen by probing | Accepted |
| [0009](0009-one-http-contract.md) | One HTTP contract for every route | Accepted |
| [0010](0010-data-policy-split.md) | Retention, access and erasure are answered separately | Accepted |
| [0011](0011-diagrams-as-source.md) | Diagrams are sources, generated and checked in CI | Accepted |
| [0012](0012-version-stays-0x-until-auth.md) | The version stays 0.x until authentication exists | Accepted |

Template: Context · Decision · Consequences · Alternatives considered.
