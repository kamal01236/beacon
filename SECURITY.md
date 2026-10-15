# Security policy

## Status of this project

Beacon is a **prototype under active development**, version `0.2.0`. It is
engineered for a single-team, trusted-network pilot and it has two gaps you
should know before deploying it anywhere:

- **There is no authentication.** The `actor` on a recorded decision is a
  well-formed string the client chooses, not a verified identity.
- **There is no server-side authorisation.** The role switcher is a lens over
  the same data, not a permission boundary.

Both are phase 4. Until then, do not expose the service to an untrusted network
and do not point it at production data. The full picture, including the controls
that *do* exist, is in
[docs/SECURITY-AND-PRIVACY.md](docs/SECURITY-AND-PRIVACY.md).

## Reporting a vulnerability

Open a GitHub issue for anything already public (a dependency advisory, a
hardening suggestion). For something exploitable that is not yet public, use
GitHub's **private vulnerability reporting** on the repository, or contact the
maintainer directly rather than filing a public issue.

Please include: what an attacker could do, the request or steps that show it,
and the commit or deployment you tested. If a server response is involved, the
`requestId` from its body or `x-request-id` header makes it findable in the logs.

There is no bug bounty and no SLA on a response. This is a hackathon prototype
maintained by one person.

## Scope

**In scope:** anything in this repository — the API routes and their validation,
the event log and its integrity, what is sent to a model provider, secret
handling and redaction, the container image, the CI workflows.

**Out of scope:** the two gaps named above (known, documented, planned); the
absence of tenancy or audit export; a model provider's own data-retention
policy; and findings that depend on an attacker already having the deployment's
secrets or shell access.

## Handling secrets

Only two exist: the model API key and `DATABASE_URL`. They live in `.env.local`
(gitignored) or your platform's secret store — never in the repository, never in
the container image (`.dockerignore` excludes every `.env*`), never in a log
(`lib/server/log.ts` redacts by field name and by pattern, including credentials
inside a connection string), and never in an API response (`/api/health` reports
*whether* a provider is configured, never the key).

`npm run check:secrets` fails if an env file is tracked or a staged change looks
like a key, and it runs on every CI build. Install it locally as a pre-commit
hook with `make hooks`.

If a key is ever committed: rotate it first, then rewrite history. Rotation is
the fix; history rewriting is cleanup.
