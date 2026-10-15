# Beacon — security and privacy

Written for a reviewer deciding whether this could run against a real team's
data. It states the controls that exist, in code, and the gaps that do not —
because a control that *looks* like an answer but is not one is worse than a
stated gap.

Diagrams: [Threat model](DIAGRAMS.md#threat-model--threat-to-control),
[Privacy boundary](DIAGRAMS.md#privacy-boundary--what-leaves-what-never-does),
[Identity model, phase 4](DIAGRAMS.md#identity-roles-and-erasure-phase-4).

> **The headline gap: there is no authentication.** `actor` is a well-formed
> string the client chooses. The role switcher is a lens over the same data, not
> a permission boundary. Run this on a trusted network or a single machine until
> phase 4 lands SSO and server-side role checks. Everything else in this
> document is written against that honest baseline.

---

## 1. Data classification

| Class | Examples | Where it rests | Leaves the deployment? |
|---|---|---|---|
| **Personal, identifying** | member name, email, job title | `members.json` / `members` table | **never** |
| **Personal, pseudonymous** | `actor` on an event, `owner` on an item | decision log, items | never (a first name only, to a model) |
| **Work content** | item titles, descriptions, update text, blockers | base snapshot | title + that item's updates, to a model, only if one is configured |
| **Derived** | attention score, signals, confidence, adoption rates | **nowhere — computed on read** | no |
| **Operational** | logs, run rows, health | stdout, `agent_runs` | only where you ship logs |
| **Viewer preferences** | theme, density, nav rail | that browser's `localStorage` | never — not part of the team record |
| **Secrets** | model key, `DATABASE_URL` | `.env.local` or a secret store | never; redacted from logs |

## 2. What can leave, exactly

The only outbound flow is the model call, and its payload is a type, not a
convention — `SummarizeInput` / `DetectInput` / `ComposeInput` in
`lib/llm/types.ts`:

```
code · title · status · priority · dueInDays
owner      FIRST NAME ONLY
updates[]  the last 5 updates of THIS item
prior      { flagged, blockedRaised }
```

Not sent: emails, full names, other people's items, other sprints, the decision
log, client or project identifiers, knowledge-base content.

- **Default configuration sends nothing at all.** With no key,
  `BEACON_LLM_PROVIDER` resolves to `none` and the rule detector runs. Every
  screen still works; this is a supported mode, not a degraded one.
- **`ollama`** keeps the call on the host.
- No prompt or completion is logged. Request logs carry route, status, duration
  and a request id — never the text.
- Retention of data at the provider is the provider's policy, and the reason
  self-hosting is listed as the data-residency answer in phase 5.

## 3. Controls that exist today

| Threat | Control | Code |
|---|---|---|
| **Tampering** with the record | the log is append-only. The only two operations that remove rows — the retention sweep and an instance reset — each append a record of themselves, so a gap is never unexplained. Correction is a new `event.undone`, never an edit | `lib/events.ts`, `lib/policy.ts` |
| Silent data loss | file writes are temp-file + rename; an unreadable store file is quarantined rather than treated as empty (which would let the next append overwrite the log) | `lib/server/fileStore.ts` |
| **Repudiation** | every event carries actor, timestamp and payload; every tracker write traces to the event that approved it | `lib/world.ts` `outbox()` |
| **Injection** | schema validation on every route; unknown keys dropped; ids pattern-matched; all SQL parameterised; no string-built queries anywhere | `lib/validate.ts`, `lib/server/store.ts` |
| **Information disclosure** | first names only to a model; internal errors not echoed in production (generic message + request id); secrets redacted by field name and by pattern, including inside a connection string | `lib/llm/types.ts`, `lib/server/http.ts`, `lib/server/log.ts` |
| **Denial of service / runaway cost** | per-route rate limits; single-flight runs; per-attempt and total deadlines on model calls; bounded retries that skip non-retryable 4xx; 64 KB body cap, 4 KB on text fields | `lib/server/http.ts`, `lib/llm/http.ts` |
| **Elevation of privilege** (what a manager can see) | the manager view is aggregate *by construction*: People is not in the manager nav, per-person drill-down renders a team-only note, and points are not shown. Not a toggle someone can flip in the UI | `lib/nav.ts`, `components/privacy.tsx` |
| Browser-side attacks | CSP, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, no `X-Powered-By`; HSTS opt-in | `next.config.mjs` |
| Secret leakage into git | `.gitignore` covers every `.env*` but the template; `check:secrets` fails on a tracked env file or a staged key-shaped string, and runs in CI | `scripts/check-secrets.mjs` |

### Known weaknesses in those controls

- **CSP keeps `'unsafe-inline'`** for scripts and styles. The theme boot script
  runs inline before first paint (to avoid a flash of the wrong theme) and the
  screens use inline style attributes. A nonce-based CSP means reworking both;
  it is listed as a gap, not omitted quietly.
- **Rate limits and the single-flight lock are per process.** Two replicas
  double the effective limit and can run two overlapping agent runs. Redis
  first — see diagram 23.
- **The file store is single-writer.** Last write wins; it is for a local
  prototype. Concurrency is what the Postgres path is for.

## 4. Gaps — stated, not hidden

| Gap | Consequence today | Planned |
|---|---|---|
| **No authentication or session** | any caller can post an event as any actor | phase 4: OIDC SSO, `actor` from a verified subject |
| **No server-side authorisation** | role separation is a UI lens; the API does not enforce it | phase 4: role checks in `route()` |
| **Erasure not implemented** | a person's record cannot be pseudonymised | phase 4: `User.pseudonymise()` (diagram 25) |
| **No tracker write** | approved changes go to a simulated outbox | phase 4 |
| **No audit export** | the log is readable via the API, not exportable as a signed artefact | phase 5 |
| **No tenancy** | one team per deployment | phase 5 |
| **No CSRF defence on writes** | there are no cookies and no sessions, so there is nothing to ride — but the moment sessions exist, writes need tokens | phase 4, with auth |
| **Dependency advisories are advisory** | CI reports `npm audit` without blocking | revisit with a pilot's change process |

## 5. Secrets

- Only two: the model API key and `DATABASE_URL`.
- In `.env.local` (gitignored) or the platform's secret store. Never in the
  repo, never in the image (`.dockerignore` excludes every `.env*`), never in a
  log, never in an API response — `/api/health` reports *whether* a provider is
  configured, never the key.
- Rotation: replace the value and restart the process. An env-only change does
  not need a rebuild.

## 6. Privacy stance, in product terms

The design decisions that matter more than the controls:

- **No individual performance scoring.** The manager view is aggregate; there is
  no leaderboard. An earlier kudos/points feature was cut for contradicting
  this.
- **Participation, not surveillance.** "Who has gone quiet" counts only people
  with work in flight, and only where a daily update is expected. People with
  nothing in flight never count against the team.
- **The author is asked first.** When an update reads as blocked, the person who
  wrote it is asked to confirm before anyone else is alerted. The agent does not
  report colleagues to a facilitator.
- **Preferences are not team data.** Theme, density and the nav rail stay in the
  viewer's browser.

## 7. Reporting a problem

See [../SECURITY.md](../SECURITY.md). This is a prototype under active
development: no CVE process, no bug bounty, and please do not point it at
production data before phase 4.
