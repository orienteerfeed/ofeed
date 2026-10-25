# 0003: Persist punch observations separately from split projections

- Status: proposed
- Date: 2026-10-25
- Deciders: pending maintainer review

## Context

Split stores elapsed seconds and permits repeated control codes. It cannot retain
unknown cards, source metadata or stable retry identities. Replace-all imports
can race independent timing dongles and resurrect intentionally removed splits.

## Decision

Persist immutable device receipts and canonical physical punches separately.
Project matched punches into existing Split and Competitor fields. Uniqueness
constraints protect retry and physical identities. Serialize affected writes on
the event row within database transactions; in-memory locks are insufficient
across API replicas. Legacy snapshots supersede previously assigned punches.
Write Protocol in the transaction and publish existing subscriptions after commit.

## Consequences

Pending punches survive delayed assignment and retries remain safe. Event-level
serialization limits simultaneous writes within one event, but avoids card-change
and snapshot races. Raw receipts contain timing-card metadata and follow event
deletion. All writer versions must be upgraded before ingestion is enabled.

## Alternatives

Per-control upserts lose repeated visits; retry IDs alone duplicate cross-device
observations. Process-local locks do not protect multiple server instances.
