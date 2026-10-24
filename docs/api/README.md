# API contract sources

OFeed uses code-owned contracts. This directory is an entry point to those
sources; it deliberately does not maintain a second handwritten OpenAPI schema.

| Surface                   | Authoritative source                                                                                                                                                       | Published / validation surface                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| REST                      | [OpenAPI configuration](../../apps/server/src/config/openapi.ts), [path registry](../../apps/server/src/config/openapi.paths.ts), feature `*.openapi.ts` and input schemas | Running API `/doc` (JSON), `/reference` (interactive reference)                                       |
| Shared payload validation | [packages/shared/src](../../packages/shared/src/)                                                                                                                          | Exported Zod schemas and inferred TypeScript types                                                    |
| GraphQL                   | [schema composition](../../apps/server/src/graphql/schema.ts), feature `*.graphql.ts` / `*.graphql-types.ts`                                                               | `/graphql`; [schema snapshot tests](../../apps/server/src/graphql/__tests__/) detect contract changes |
| Persistence               | [Prisma schema](../../apps/server/prisma/schema.prisma)                                                                                                                    | Prisma migrations and generated clients; not a browser API                                            |

Local REST documentation is at `http://localhost:3001/doc` and
`http://localhost:3001/reference`. GraphQL input definitions are explicit Pothos
code, not automatically generated from shared Zod schemas.

## Updating a contract

1. Start from the feature spec and current service validation.
2. Update the owning Zod schema, REST documentation and/or Pothos definition.
3. Keep required fields, nullability, error codes and auth aligned with
   behavior.
4. Update relevant contract tests and intentional GraphQL snapshots; report
   breaking changes in the PR and changelog.
5. Rebuild `@repo/shared` after shared-contract changes and check consumers.

If a consumer needs `openapi.yaml` or an SDL export, define a reproducible
export and drift check before adding the generated artifact. Do not hand-edit
generated contracts or copy production data into examples.

See [entry integration](../entry-api-integration.md) and
[GraphQL architecture](../GRAPHQL_ARCHITECTURE.md).
