# G1: Punch ingestion

- Status: implemented; deployment pending
- Issue: pending manual creation from G1 (automatic approval review blocks GitHub issue mutation)
- Related ADR: [0003](../architecture/adr/0003-punch-observation-ledger.md)

## Goal

Accept independent SRR and SI readout punches without replace-all split races.
Retain unmatched observations for assignment later. Existing REST, IOF and MeOS
split snapshots remain authoritative. No frontend or punch browsing API is added.

## Contract and acceptance criteria

- JWT event owner/admin can POST `/rest/v1/events/{eventId}/punches`, with source
  `SRR` or `READOUT`, stable deviceId and 1–200 punches. Each punch carries UUID
  clientPunchId, card, controlCode, offset-aware punchTime and receivedAt, plus
  optional stationSerial. Codes 0/-1/-2 mean start/finish/check.
- Results retain input order and return STORED, DUPLICATE or UNKNOWN_CARD, with
  competitorId only when matched. Unknown and ambiguous cards are stored.
- Retry identity is event/device/clientPunchId. Changed payload under the same
  identity rejects the complete batch with 409. Physical identity is
  event/card/control/time at millisecond precision, across devices and sources.
- A unique card matches directly. Shared cards match exactly one bounded race
  window: inclusive start and finish, or exclusive next start when unfinished.
  Missing bounds, overlaps and ties remain pending. Assignment is sticky.
- Ordinary controls project individual splits in elapsed whole seconds (floor).
  Repeated codes at different times remain separate. Start/finish/check are
  retained outside Split. A missing start leaves elapsed time null.
- READOUT timing takes precedence over SRR; within a source choose earliest
  start and earliest finish at or after start. Existing start is the fallback.
  SRR sets Finished from Inactive/Active/Finished only; READOUT sets OK even over
  adjudication. Later SRR cannot downgrade a readout result.
- Competitor creation/card/timing changes retry pending matches. Snapshot writes
  supersede already assigned observations, including observations absent from
  the snapshot. Retries never resurrect superseded projections.
- Punch application and field changes write Protocol atomically, attributed to
  the original receipt author. Publish competitorUpdated and class updates
  after commit, once per changed competitor/class. Pure retries do neither.

## Persistence and compatibility

Prisma owns canonical punches and immutable receipt metadata. Database unique
constraints enforce both identities; device identity is case-sensitive. Event row locks serialize affected writers
across processes, with bounded deadlock retries. Existing Split and public
GraphQL shapes remain compatible. Deleting competitors retains observations,
clears links and prevents replay of formerly applied punches; event deletion
cascades the ledger. No historical split backfill is attempted.

## Implementation notes

Reconciliation is limited to affected cards and competitors. IOF operations use
per-competitor transactions. MeOS retains its existing atomic document transaction
and acquires the event lock once for that document, preserving import rollback
behavior. Typed Protocol support is added to the shared contract and existing
report filters/translations; no new frontend workflow is introduced.

## Test plan and rollout

Validate auth, limits, conflicts, input ordering, source promotion, late matching,
strict windows, repeated controls, timing recalculation, status precedence,
snapshot supersession, deletion and post-commit publication. Verify database
constraints and races against disposable MariaDB, in addition to service tests.
Run Prisma generation, focused server Vitest suites, server/GraphQL type checks,
OpenAPI contract tests, lint and formatting checks.

Apply the additive migration before the application rollout. Complete all writer
upgrades before enabling ingestion clients; mixed old/new writers cannot provide
the concurrency guarantee. No production migration is authorized by this spec.

## Validation

The standard server suite, client suite, shared/client/server type checks, strict
GraphQL type checks, server lint and changed-file formatting checks pass. The
migration was applied to a fresh disposable MariaDB database. Its opt-in suite
covers separate-connection races, batch rollback and the maximum 200 punches.
See the [testing guide](../dev/testing.md#punch-concurrency-integration-tests).
The ADR remains proposed for maintainer review. No deployment has been performed.
