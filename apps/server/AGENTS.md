# Server Guidelines

## Scope

This file applies to `apps/server`.

## Stack

- Node.js
- TypeScript
- Hono
- GraphQL Yoga
- Prisma 7
- MariaDB via `@prisma/adapter-mariadb`
- Zod via `@hono/zod-openapi`

## Architecture

- `src/modules/*`: feature-oriented server modules.
- `src/graphql/*`: GraphQL schema, resolvers, and domain-specific logic.
- `src/routes/*`: route composition and REST entry points.
- `src/db/*`: Prisma client bootstrap and database wiring.
- `src/config/*`: runtime, logging, and OpenAPI configuration.
- `src/middlewares/*`: shared Hono middleware.
- `src/lib/*`: server utilities such as validation, storage, and HTTP helpers.
- `src/views/*`: server-rendered email templates and related views.
- `prisma/schema.prisma`: database schema.
- `prisma/migrations/*`: Prisma migrations.
- `prisma/seed.ts`: seed data.

## API and Validation Rules

- Prefer `@hono/zod-openapi` route definitions and Zod schemas for REST
  endpoints.
- Keep GraphQL types and resolvers colocated by domain under `src/graphql`.
- Reuse `@repo/shared` contracts for client-visible payloads when both sides
  depend on the same shape.
- Keep frontend form validation, REST validation, and GraphQL input constraints
  aligned whenever they represent the same business rule.
- Extract reusable business logic into helpers or services instead of expanding
  route handlers indefinitely.

## Prisma and Database Rules

- Use the app Prisma client from `src/db/prisma.ts` or the existing context
  helpers.
- Do not hand-edit `src/generated/prisma/**`.
- Make schema changes through `prisma/schema.prisma` and Prisma migrations.
- If a Prisma schema change affects shared payloads or docs, update the
  corresponding contracts and documentation in the same change.

## Code Style

- TypeScript ESM is the default.
- Follow the local Prettier settings: semicolons, single quotes, 2 spaces,
  `printWidth: 100`.
- Prefer lower-case or kebab-case file names for new server files; preserve the
  existing naming of touched legacy files instead of renaming broadly.
- Even though the current TypeScript config is not fully strict, write
  strict-friendly code and avoid new `any` usage where possible.

## Commands

Run from `apps/server` or from the repo root with `pnpm --filter ./apps/server`.

- `pnpm dev`
- `pnpm start:dev`
- `pnpm build`
- `pnpm type-check`
- `pnpm lint`
- `pnpm lint:fix`
- `pnpm test`
- `pnpm test:watch`
- `pnpm db:generate`
- `pnpm db:migrate`
- `pnpm db:migrate:deploy`
- `pnpm db:seed`

## Testing Expectations

- Use Vitest for server tests.
- `pnpm test` automatically generates Prisma client first; keep that in mind
  when changing schema-related code.
- For route, auth, upload, or GraphQL changes, run the closest relevant server
  tests before finishing.
- For Prisma changes, run at least `pnpm db:generate` and the relevant test or
  migration command.
