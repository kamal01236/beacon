# Beacon

An AI companion layer over Jira / Azure DevOps for agile delivery teams. Beacon
does not replace the tracker — it reads the same work and adds what the tracker
can't: it surfaces hidden blockers from update language, explains *why* each item
needs attention (an explainable score, never a black box), rolls delivery risk up
honestly, and keeps the human in the loop on every AI action.

The product flows now live **in code** (this Next.js app). The design canvas under
`design/` is the earlier source and is being retired.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
```

Node 18+. The demo clock is frozen at **Sprint 2, Day 8 of 10** (`lib/demo.ts`).

## How it's built

Everything renders inside **one shared shell** — `components/AppShell.tsx` — so the
header (brand, sprint, search, persona switcher) is identical on every screen and
cannot drift. The persona switcher is the single way to move between the three
role views; the sidebar nav is generated per role from `lib/nav.ts`. At ≤860px the
sidebar becomes a fixed bottom bar (one responsive rule in `app/globals.css`), so
there are no separate mobile pages.

```
app/
  layout.tsx            RoleProvider + AppShell wrap every page
  globals.css           the whole design system (ported from design/beacon.css)
  overview/             facilitator landing — "cannot deliver" roll-up + attention
  board/                priority board — ranked by explainable score (?status=, ?min=, ?type=)
  people/               team status ; people/[memberId] = facilitator member drill-down
  item/[id]/            item detail — the AI hidden-blocker timeline
  inbox/ delivery/ insights/ retro/      facilitator tools
  manager/              manager view (team-level only, no individual scoring)
  my-work/ get-help/ trends/             member views
components/   AppShell, Nav, PersonaSwitcher, RoleProvider, ui (Avatar, ScoreReasons, AiBlock…)
lib/          types, data (seed loaders), demo (frozen clock), priorityScore, nav
data/         seed JSON (members, sprints, items, updates, meetings, stories, kudos, ai-cache)
```

### The attention score
`lib/priorityScore.ts` defines the score as the **sum of its explainable reasons** —
the number can never disagree with the chips shown beside it. Seed scores were
reconciled to this invariant (Phase 0).

## Roles
- **Facilitator** (Sarah) — Overview · Board · Inbox · Delivery · People · Insights · Retro
- **Manager** (Dana, read-only) — Overview · Delivery · People · Insights
- **Member** (Marcus) — My work · Board · Get help · My trends

Switch between them from the persona menu in the header.
