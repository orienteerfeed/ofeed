# API rate-limit headroom

- Status: implemented
- Issue: pending; GitHub issue tools are disallowed by repository policy
- Related ADRs: none; retain the current Hono in-memory limiters and verified auth context

## Goal and observed behavior

Keep event administration, uploads, polling and multiple browser tabs usable.
The current GraphQL limit is hardcoded to 30/minute per IP, independently of
`RATE_LIMIT_MAX`. All users behind a shared IP consume that same budget. REST
uploads share the ordinary REST budget. REST defaults also disagree: 200 per
15 minutes in code versus 100 or 200 per minute in example/Helm configuration.
Results poll every 15 seconds, split publication every 30 seconds and live feed
every minute. A file selection submits one multipart upload (possibly multiple
files), then refetches GraphQL file status; imported results can also trigger
subscription-driven refetches in other tabs.

## Acceptance criteria

- GraphQL defaults to 600 requests/minute, ordinary REST to 600/minute,
  uploads to a separate 60/minute and refresh/logout to a separate 120/minute.
  Credential REST authentication remains 10/minute per IP.
- Ordinary GraphQL, REST and upload budgets use only verified auth context:
  JWT user ID, event Basic event ID, otherwise anonymous IP/fingerprint.
  Token rotation, forged credentials or arbitrary device IDs cannot create new
  authenticated budgets. Tabs for one user share a budget across IP changes.
- Refresh and credential authentication remain keyed by IP/fingerprint.
  GraphQL polling cannot exhaust REST, uploads, refresh or credential budgets.
- GraphQL, upload and refresh limits are positive integer environment settings;
  environment examples, Helm defaults and Turbo strict environment agree.
- Requests include limit/remaining/reset headers and 429 includes Retry-After;
  browser CORS exposes those headers. OPTIONS preflight does not consume quota.
- A single user can make a 240-request GraphQL burst (three tabs, each with 20
  initial/navigation queries, 20 polling/refetch queries, 10 edits and 30
  post-edit/import refetches), plus 120 REST requests, 12 multipart uploads and
  six refreshes within one minute. This leaves 60% GraphQL, 80% REST/upload and
  95% refresh headroom. Multiple users on the same IP remain independent.

## Edge cases and API

No schema, payload or database changes. Preserve upload body-size limits and
authorization. Reserve the upload budget for paths already using the larger
upload body limit, including event featured images. Normalize trailing slashes
for GraphQL/session route selection. Anonymous clients still share their IP
budget. In-memory limits remain per API process; these tests do not establish
database throughput or cluster-wide abuse protection.

## Test plan and rollout

Use the real createApp middleware with controlled verified auth and lightweight
handlers; send concurrent mixed requests and multipart bodies without touching
production data. Check exact limits, independence, spoofed identities, token
rotation, preflight, reset at one minute and configurable overrides. Run upload
handler, session, CORS and environment regressions, type checks, focused lint,
and Helm rendering checks. Inspect deployed response headers with one harmless
GraphQL request; do not load-test the shared deployed API.

Deploy API code and configuration together. Existing `RATE_LIMIT_*` overrides
still apply to REST; operators must replace old low values. The dev environment
may receive environment overrides from an external GitOps repository; document
any observed mismatch. No deployment is part of this local implementation.

## Validation evidence (2026-10-27)

- One harmless GraphQL `__typename` request to `api.dev.ofeed.live` confirmed
  the deployed policy is still `30;w=60`. No load test or upload was sent to dev.
- 162 server tests passed across 10 focused files: rate limits, CORS, environment,
  upload handling/import state/course/competitor/XSD, session routes and JWTs.
  The mixed-traffic regression admitted 1,140 requests for three concurrent
  accounts on one IP within one minute (including six quota probes). Each user
  retained 60% GraphQL and 80% REST/upload quota before the probes; their combined
  18 refreshes left 85% of the shared session quota. Real JWT/Basic verification
  and multipart parsing run against fixture database lookups/terminal handlers.
- All 600 anonymous GraphQL requests were admitted, request 601 returned 429,
  and an authenticated account on the same IP retained its own budget.
- Server Prisma generation and TypeScript passed. Deployment chart tests passed
  (5 tests, 26 assertions). Focused lint passed.
- Rendering the production Helm values produced exactly REST 600/60000 ms,
  GraphQL 600, upload 60 and session 120. Vault injection was disabled for that
  local render; no cluster settings or credentials were changed.
