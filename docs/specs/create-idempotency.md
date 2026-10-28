# Create request idempotency

- Status: implemented
- Source: user request G3, “Idempotency on creates”; GitHub issue lookup was
  unavailable (repository access rejected), so no issue number is asserted.
- Decision: [transactional response storage](../architecture/adr/0005-create-idempotency.md).

## Goal

Prevent offline HTTP retries from creating duplicate entry orders, competitors
or status-change protocol records.

## Acceptance criteria and API

- `POST /rest/v1/events/{eventId}/entries`, `POST
  /rest/v1/events/{eventId}/competitors` and `POST
  /rest/v1/events/{eventId}/competitors/{competitorId}/status-change` accept an
  optional `Idempotency-Key` header (1–255 visible ASCII characters).
- Successful response status, content type and exact JSON body are stored for
  24 hours from completion and replayed without executing the write again.
- Keys are case-sensitive and scoped to the authenticated numeric user (or
  anonymous entry checkout), event, operation and competitor where applicable.
  Anonymous callers must generate unpredictable keys (for example UUIDs).
- Reusing a live key with a different validated request body returns 409.
  Object property order does not affect identity; array order does.
- Validation and authorization run before replay. Invalid header values return
  422. Failed requests are rolled back and can be retried with the same key.
- Writes and stored responses commit atomically. Concurrent requests serialize
  on the existing event lock, including across API instances. Replay does not
  resend email or publish competitor changes.
- After expiry the key may be reused. Expired records are deleted when that
  event receives a keyed create. A startup and once-per-minute background pass
  also deletes up to 1,000 expired records, including those for idle events.
- Requests without the header retain existing behavior. CORS and OpenAPI expose
  the new optional header.

## Persistence and edge cases

Store SHA-256 identities for scoped keys and canonical request payloads, response
text, content type, HTTP status, event ID and indexed expiry. The event relation
cascades on deletion. The response can contain personal data and entry access
tokens; treat this table with the same access controls as entries. Expiry is a
replay deadline; physical removal follows on the next cleanup pass, subject to
backlog and database availability.

## Test plan

Test all three adapters, replay, changed bodies, caller/endpoint isolation,
expiry, missing/invalid keys, rollback, suppressed side effects and concurrent
requests. Run Prisma generation, focused Vitest suites, OpenAPI checks and server
type checking. Use an opt-in disposable MariaDB suite for actual lock/rollback
verification; mocks alone do not establish database isolation.


## Validation

Prisma generation and all 63 migrations passed on disposable MariaDB. The real
concurrency suite passed (4 tests). Focused route, contract, service and shutdown
regressions, TypeScript and ESLint passed. No deployment or production migration
was performed. The ADR remains proposed pending maintainer review.
