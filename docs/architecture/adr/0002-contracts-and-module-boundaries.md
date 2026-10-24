# 0002: Preserve code-owned contracts and feature service boundaries

- Status: accepted
- Date: 2026-10-24
- Deciders: existing repository guidelines; retrospective record, no new stack
  decision

## Context

The repository already uses Hono REST, GraphQL Yoga/Pothos, Prisma with MariaDB,
and shared Zod contracts. Separately maintained documentation or resolver-level
business rules can drift from service behavior. This record captures existing
rules; it does not claim a historical comparison of ORM or database
alternatives.

## Considered options

1. Continue deriving public documentation from the code-owned contracts.
2. Maintain additional independent API definitions in documentation.
3. Move business rules into each transport adapter.

Options 2 and 3 describe alternatives to the baseline, not previously evaluated
migration proposals.

## Decision

Keep reusable network validation in `packages/shared`; feature-only schemas stay
with the owning module. REST and GraphQL adapters call feature services. Global
GraphQL infrastructure stays in `src/graphql`, feature registrations in
`src/modules`. Prisma schema/migrations own persistence. Prefer GraphQL for
first-party communication and REST for external/public integrations.

`docs/api/` links to these authoritative sources rather than introducing a
hand-maintained `openapi.yaml`. An exported schema, if needed later, must have a
reproducible generation/check process defined in its spec.

## Consequences

- Positive: fewer parallel contracts and consistent service behavior.
- Negative: Pothos inputs and Zod still need explicit alignment and contract
  tests.
- Follow-up: any transport, ORM, database or boundary replacement needs a new
  ADR with migration, compatibility and validation details.

## References

- [Server guidelines](../../../apps/server/AGENTS.md)
- [Shared guidelines](../../../packages/shared/AGENTS.md)
- [GraphQL architecture](../../GRAPHQL_ARCHITECTURE.md)
- [API sources](../../api/README.md)
