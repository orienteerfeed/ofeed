# OFeed Server

Hono API server for OrienteerFeed. It exposes REST endpoints, GraphQL
Yoga/Pothos schema, WebSocket subscriptions, OpenAPI documentation, health
checks, and Prometheus metrics.

## Stack

- Node.js 24.14.1
- TypeScript ESM
- Hono
- GraphQL Yoga + Pothos
- Prisma 7 with MariaDB adapter
- Zod via `@hono/zod-openapi`
- Vitest

## Local Development

Run commands from `apps/server` or from the repository root with
`pnpm --filter ./apps/server`.

From the repository root:

```bash
corepack enable
corepack use pnpm@10.33.0
pnpm install
cp apps/server/.env.example apps/server/.env
docker compose -f docker-compose.mysql.yaml up -d mysql
pnpm --filter ./apps/server db:generate
pnpm --filter ./apps/server db:migrate
pnpm --filter ./apps/server dev
```

On Windows shells that do not support POSIX-style environment assignments, use:

```powershell
pnpm --filter ./apps/server dev:win
```

Default local API URL: `http://localhost:3001`.

## Runtime Endpoints

- REST API: `http://localhost:3001`
- GraphQL: `http://localhost:3001/graphql`
- OpenAPI JSON: `http://localhost:3001/doc`
- API Reference UI: `http://localhost:3001/reference`
- Health: `http://localhost:3001/health`
- Metrics: `http://localhost:3001/metrics`

## Environment

Runtime environment lives in `apps/server/.env`; do not add a root runtime
`.env` for server behavior.

Important variables:

- `DATABASE_URL`: full MariaDB/MySQL connection URL. If empty, the server builds
  it from the `MYSQL_*` variables.
- `JWT_TOKEN_SECRET_KEY`: JWT signing secret. It must be set to a
  production-safe value outside local development.
- `SENDGRID_API_KEY`: optional for local development; required when sending
  email through SendGrid.

Keep `apps/server/.env.example` in sync when adding or changing server
configuration.

## Commands

- `pnpm dev`: run the API in watch mode on port `3001`
- `pnpm dev:win`: Windows-friendly watch mode
- `pnpm build`: compile the server to `dist/`
- `pnpm start:dist`: run the built server
- `pnpm type-check`: run the server TypeScript check
- `pnpm type-check:graphql`: run the strict GraphQL/Pothos TypeScript profile
- `pnpm lint`: run ESLint
- `pnpm lint:fix`: run ESLint with fixes
- `pnpm test`: run server tests
- `pnpm test:watch`: run server tests in watch mode
- `pnpm db:generate`: generate Prisma Client and Pothos Prisma types
- `pnpm db:migrate`: run local Prisma migrations
- `pnpm db:migrate:deploy`: apply migrations in deployment
- `pnpm db:seed`: seed the database

## Prisma

Prisma schema lives at `prisma/schema.prisma`.

Generated files are ignored and should not be hand-edited:

- `src/generated/prisma/**`
- `src/generated/pothos-prisma-types.ts`

Run `pnpm db:generate` after Prisma schema changes. The `type-check`,
`type-check:graphql`, `test`, and dev scripts generate Prisma artifacts before
they need them.

## GraphQL

Global GraphQL infrastructure lives in `src/graphql`. Feature-level GraphQL
registration lives with the owning module in `src/modules/*/*.graphql.ts`, with
shared Pothos refs in `src/modules/*/*.graphql-types.ts`.

`pnpm type-check:graphql` uses `tsconfig.graphql.json` and runs the full
GraphQL/Pothos profile in strict TypeScript mode. There is no separate
`tsconfig.graphql.strict-small.json` profile.

## Validation

Use Zod schemas as the main validation source of truth. When the same payload is
accepted by REST, GraphQL, and frontend forms, keep those contracts aligned and
prefer shared schemas from `@repo/shared` when both client and server consume
the shape.
