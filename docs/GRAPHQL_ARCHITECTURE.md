# GraphQL Architecture

The server GraphQL API uses GraphQL Yoga for transport, Pothos for schema
construction, `@pothos/plugin-prisma` for Prisma-aware field definitions, and
Prisma v7 for database access.

## Directory Ownership

`apps/server/src/graphql/*` is global infrastructure only:

- `builder.ts`: Pothos builder and plugin setup.
- `context.ts`: Yoga/Pothos context construction for HTTP and WebSocket flows.
- `schema.ts`: root schema composition through side-effect imports.
- `scalars/*`: global scalar registrations.
- `http.ts` and `server.ts`: GraphQL Yoga HTTP and WebSocket integration.

Feature-specific GraphQL code lives with its owning module:

- `apps/server/src/modules/<feature>/<feature>.graphql-types.ts`: exported
  Pothos object/input/enum refs that are reused by other GraphQL modules.
- `apps/server/src/modules/<feature>/<feature>.graphql.ts`: root query,
  mutation, and subscription registration for the feature.
- `apps/server/src/modules/<feature>/<feature>.service.ts`: business rules and
  data access.
- `apps/server/src/modules/<feature>/<feature>.schema.ts`: Zod schemas when the
  module owns REST or shared validation contracts.
- `apps/server/src/modules/graphql/*.graphql-types.ts`: shared GraphQL API types
  that do not belong to one feature, such as generic response objects.

## Dependency Direction

Keep dependencies flowing in one direction:

```text
src/graphql/schema.ts
  imports src/modules/*/*.graphql.ts

src/modules/<feature>/<feature>.graphql.ts
  imports src/graphql/builder.ts
  imports src/modules/<feature>/<feature>.service.ts
  may import shared GraphQL refs from *.graphql-types.ts files

src/modules/<feature>/<feature>.service.ts
  may import Prisma types/client, auth helpers, and domain utilities
  must not import GraphQL builder or schema files
```

Avoid service-to-GraphQL imports. If two GraphQL modules need to share a type
reference, use a small `*.graphql-types.ts` file instead of importing a full
module registration file. A `*.graphql.ts` file may have side effects because it
registers root fields.

## Adding a GraphQL Module

1. Create or reuse the feature service in `src/modules/<feature>`.
2. Create `src/modules/<feature>/<feature>.graphql-types.ts` when the feature
   exposes object/input/enum refs reused by another module.
3. Create `src/modules/<feature>/<feature>.graphql.ts`.
4. Define feature-local Pothos refs in the module or import shared refs from the
   feature's `*.graphql-types.ts`.
5. Register root fields with `builder.queryFields`, `builder.mutationFields`,
   or `builder.subscriptionFields`.
6. Import the root module once from `src/graphql/schema.ts`.
7. Add or update schema tests and service/runtime tests.

GraphQL resolvers should remain adapter code:

- read field arguments;
- read values from context;
- call the owning service;
- return the service result.

Business rules, authorization decisions, Prisma queries, side effects, and error
mapping belong in services or shared guards unless a GraphQL-specific error shape
requires a thin adapter.

## Input Contracts

Prefer one module-owned Zod contract for each input shape:

```ts
export const updateCurrentUserInputSchema = z.object({
  email: z.string().email().max(255).nullable().optional(),
});

export type UpdateCurrentUserInput = z.infer<typeof updateCurrentUserInputSchema>;
```

Pothos input types still need explicit `builder.inputType(...)` definitions
because the public GraphQL SDL is not generated from Zod in this project. The
Pothos resolver should parse the incoming input with the module schema before
calling the service, and the service should type its input from the same schema.
This avoids a third source of truth where GraphQL input fields, service
TypeScript types, and validation rules drift apart.

If the project later adopts a Pothos validation plugin, these same Zod schemas
should be reused rather than replaced.

## Prisma Plugin Usage

Use `t.prismaField` when the resolver returns Prisma model data and the service
can pass the generated Pothos `query` selection into Prisma. This lets
`@pothos/plugin-prisma` add optimized `select`/`include` clauses and avoid
unnecessary relation loading.

Use `t.field` when the field:

- returns a computed DTO or connection object;
- calls raw SQL;
- has custom subscription behavior;
- cannot reasonably pass Pothos' Prisma `query` selection to the final Prisma
  operation.

When using `t.prismaField`, prefer service signatures like:

```ts
export function findEventById(
  prisma: AppPrismaClient,
  id: string,
  query: Omit<Prisma.EventFindUniqueArgs, 'where'> = {},
) {
  return prisma.event.findUnique({
    ...query,
    where: { id },
  });
}
```

If a resolver cannot pass the generated `query` argument to the final Prisma
operation, use `t.field` instead of `t.prismaField`. A Prisma field that ignores
`query` gives the impression of selection optimization without actually using
it.

For enum types that exactly mirror Prisma enum values, use generated Prisma enum
exports from `src/generated/prisma/enums.js` instead of hand-maintained string
arrays. Keep manual GraphQL enums only when they are intentionally different
from the database model, such as computed status summaries or API-only enum
values.

## Prisma Type Boundary

Keep Prisma implementation details on the server side:

- `*.service.ts` may import Prisma client/model/input types and should own
  Prisma query construction.
- `*.graphql-types.ts` may define Pothos Prisma object refs and may use
  generated Prisma enum exports when the public GraphQL enum mirrors the
  database enum.
- `*.graphql.ts` root registration files should not import Prisma model payload
  types directly. Use service-owned return types for wrapper DTOs such as
  mutation responses.
- Client code must not import `apps/server/src/generated/**` or Prisma types.
  Client types should come from the public GraphQL schema and operation codegen.

## Constraint Scalars

`src/graphql/scalars/constraint-scalars.ts` is a legacy compatibility layer. It
keeps historical public scalar names such as
`email_String_NotNull_maxLength_255_format_email` and
`password_String_NotNull_maxLength_255` visible in introspection after the move
from SDL directives to Pothos.

Short term, keep these scalars for public API compatibility and cover the
accepted/rejected values with unit tests. Long term, when a breaking GraphQL API
change is acceptable, prefer normal `String` fields plus explicit input
validation through Zod or a Pothos validation plugin. That would align GraphQL
input validation with the existing REST/Zod validation strategy.

## Subscriptions

Subscriptions should preserve existing public topics and payload shapes.

- Keep topic constants in `src/lib/pubsub.ts`.
- Keep subscription data loading and authorization in services or shared guards.
- In Pothos `subscribe`, return an async iterable from the service.
- In Pothos `resolve`, unwrap the published payload without changing the public
  GraphQL shape.
- For guarded split/live-result subscriptions, re-check authorization before
  yielding initial data and again before yielding later updates.

## Generated Files

Do not hand-edit generated files:

- `apps/server/src/generated/prisma/**`
- `apps/server/src/generated/pothos-prisma-types.ts`

Run:

```bash
pnpm --filter ./apps/server db:generate
```

This regenerates both the Prisma Client and the Pothos Prisma type map. CI runs
generation before type-checking; local clean checkouts should do the same before
server builds. The server `type-check` and `type-check:graphql` scripts run
`db:generate` first so ignored generated files exist before TypeScript resolves
Prisma and Pothos generated imports.

## GraphQL Type-Check Profile

The server has a dedicated GraphQL/Pothos type-check profile:

```bash
pnpm --filter ./apps/server type-check:graphql
```

It runs two profiles:

- `apps/server/tsconfig.graphql.json` covers the full GraphQL/Pothos source
  surface: `src/graphql/**/*.ts`, `src/modules/**/*.graphql.ts`, and
  `src/modules/**/*graphql-types.ts`.
- `apps/server/tsconfig.graphql.strict-small.json` is the first stricter
  module slice. It enables `noImplicitAny` and `useUnknownInCatchVariables` for
  the global builder/context types plus country, sport, class, team,
  user GraphQL type refs, system-message, and the changelog service/schema
  contract. The changelog root
  GraphQL registration is intentionally not in this slice yet because its
  public `competitor`, `event`, and `author` fields import the larger
  competitor/event/user GraphQL refs.

This is a ratchet for the GraphQL layer while the rest of the server remains on
the existing non-strict TypeScript config.

Because TypeScript applies compiler options to imported files too, the profile
still keeps `strictNullChecks` disabled in the strict-small slice until the
imported service/util graph is nullability-safe. Add more modules to
`tsconfig.graphql.strict-small.json` only after their imported service graph can
pass the stricter options.

## Testing Expectations

For GraphQL changes, prefer the following layers:

- service unit tests for business logic and Prisma query semantics;
- GraphQL execution tests for critical field wiring and error behavior;
- schema snapshot tests using `printSchema(lexicographicSortSchema(schema))` to
  catch public API changes in types, arguments, nullability, enum values, input
  fields, and scalar names.

Any intentional public GraphQL API change should update the schema snapshot and
be called out in the pull request.
