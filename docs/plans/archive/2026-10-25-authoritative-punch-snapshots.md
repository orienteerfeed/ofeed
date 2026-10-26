# Authoritative competitor snapshots

- Status: complete
- Spec: [punch ingestion](../../specs/punch-ingestion.md)
- Issue: not yet linked; existing G1 issue remains pending manual creation.
- Scope: user clarification of snapshot precedence; no schema change.

## Steps

- [x] Inspect updateCompetitor, IOF and MOP snapshot writers.
- [x] Specify consumption of already stored pending observations.
- [x] Share event-scoped supersession across snapshot writers.
- [x] Add regressions for snapshot precedence and consumed pending observations.
- [x] Run focused checks and record results.

## Decisions and validation

- User confirmed that omitting splits in updateCompetitor preserves existing rows;
  supplying [] clears rows and a supplied list replaces the complete snapshot.
- Assigned punches and pending punches on old/new cards within the event are
  superseded under the event lock, including no-change IOF/MOP snapshots.
- Standard server suite: 838 passed (database suite intentionally opt-in).
- Final isolated MariaDB suite: 23 passed, using ofeed_punch_test_migration with
  the current migration. The initial run against the older ofeed_punch_test DB
  exposed its outdated deviceId collation; no application change was needed.
- Server TypeScript, changed-file ESLint/Prettier and git diff whitespace checks
  passed. No schema, GraphQL contract or frontend changes; generation and separate
  GraphQL/client checks were not rerun.
- Test MariaDB started for this task was shut down after validation.
- No remaining implementation work. Issue linkage remains pending as above.
