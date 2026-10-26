# 0005: Commit create responses with their writes

- Status: proposed
- Date: 2026-10-25
- Scope: G3 create request idempotency

## Context

Offline retries can duplicate REST creates. In-memory caches do not survive
restarts or coordinate replicas. Saving a response after committing the create
leaves a failure window that permits a duplicate on retry.

## Decision

Use a Prisma-backed response table with a 24-hour replay deadline. Execute keyed
creates and response persistence in one transaction under the existing event
write lock. Pass the transaction explicitly to services; queue email and
subscription publication until commit. Existing unkeyed callers retain their
service transaction boundaries. Validate and authorize before replay; scope
hashed keys by caller and operation and reject mismatched payloads.

## Consequences

A migration is required. Keyed entry creates join event write serialization.
Response data inherits entry privacy requirements. Expired rows are removed
for active events and by a bounded startup/once-per-minute cleanup loop. This proposal needs maintainer review, not an invented approval.
