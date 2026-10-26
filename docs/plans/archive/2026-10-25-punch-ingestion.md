# G1 punch ingestion implementation

- Status: implementation complete; GitHub tracking requires manual action
- Spec: [punch ingestion](../../specs/punch-ingestion.md)
- Issue: pending manual creation; automatic approval review rejected GitHub mutation

## Steps

- [x] Inspect split, competitor, auth, import and subscription paths.
- [x] Record agreed API, matching, timing and compatibility rules.
- [x] Add schema/migration, ledger service and REST/OpenAPI contracts.
- [x] Integrate assignment, snapshot, deletion and subscription behavior.
- [x] Add regression and disposable-database concurrency coverage.
- [x] Run focused checks; reconcile spec and archive this plan.

## Validation and remaining external action

- Standard server suite: 838 passed; database integration suite is opt-in.
- Client suite: 200 passed.
- Disposable MariaDB: final migration applied; integration cases passed, including
  independent connections, identities, rollback, late assignment, timing/status
  precedence, snapshots, deletion, 200-item batches and publisher failure.
- Prisma generation, shared/client/server type checks, strict GraphQL profile,
  server lint, formatting and diff whitespace checks passed.
- MeOS deliberately retains document-level atomicity; IOF uses per-competitor
  transactions. Reconciliation is limited to affected cards/competitors.

Create/link the G1 issue manually before the PR. Review the proposed ADR and roll
out the additive migration before all upgraded writers, then enable clients.
No production migration, deployment, commit or push was performed.
