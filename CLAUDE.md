# CLAUDE.md

TypeScript monorepo — orienteering event platform. Vite + React client, Hono +
Prisma server, shared Zod contracts. Orchestrated by pnpm workspaces +
Turborepo.

See @README.md for full project overview and @package.json for all available
scripts.

## Requirements

- Node.js 24.14.1 (use `nvm install && nvm use`)
- pnpm >=10.33.0 (via `corepack enable && corepack use pnpm@10.33.0`)
- Docker (local MariaDB via
  `docker compose -f docker-compose.mysql.yaml up -d mysql`)

## Setup

```bash
pnpm setup:dev        # install deps + copy .env templates
pnpm db:generate      # generate Prisma client
pnpm db:migrate       # run migrations
pnpm dev              # client :3000 + server :3001
```

## Key Commands

```bash
pnpm build            # build all workspaces
pnpm lint             # lint all workspaces
pnpm type-check       # type-check all workspaces
pnpm format           # Prettier
pnpm test             # all tests (Turbo)
pnpm clean            # remove dist/build artifacts
```

Workspace filters: `pnpm --filter client <cmd>` / `pnpm --filter server <cmd>`

## Workspaces

| Workspace | Path              | Stack                                                                                         |
| --------- | ----------------- | --------------------------------------------------------------------------------------------- |
| client    | `apps/client`     | Vite 7, React 19, TanStack Router/Query, Apollo Client, Tailwind CSS 4, shadcn, atomic design |
| server    | `apps/server`     | Hono, Prisma 7 (MariaDB), GraphQL Yoga + Pothos, Pino, Zod OpenAPI                            |
| shared    | `packages/shared` | Zod schemas + TS types (`@repo/shared`)                                                       |

## Testing

```bash
# Client — Vitest + jsdom, files in apps/client/tests/**
pnpm --filter client test
pnpm --filter client test -- path/to/file
pnpm --filter client test:coverage
pnpm --filter client e2e              # Playwright, 9 spec files

# Server — Vitest, co-located *.test.ts next to source
pnpm --filter server test
pnpm --filter server test:e2e         # Testcontainers full suite
pnpm --filter server test:e2e:smoke   # smoke subset (PR pipelines)
pnpm --filter server test:ci          # lint + build + db:test:push + test
```

Server E2E tests spin up a real PostgreSQL container (Testcontainers). Scenarios
run sequentially (`singleFork: true`) — shared DB state. Global setup:
`src/e2e/setup/global-setup.ts`. Test factories:
`src/e2e/fixtures/factories.ts`.

## Architecture

### Server — Layered, ESLint-enforced import hierarchy

```
utils/ → config/ → lib/ → modules/
```

Violations are errors. `utils/` and `config/` ban dynamic imports (`import()`,
`require()`).

Entry points:

- `src/app.ts` — Hono assembly, exports `AppType` for RPC codegen
- `src/index.ts` — HTTP server + WebSocket upgrade + graceful shutdown
- `src/api/build-api.ts` — versioned router factory (`/rest/v1`),
  `MODULE_ROUTES` map

**Adding a new module:** register GraphQL side-effect import + REST export in
`src/modules/index.ts`, add entry to `MODULE_ROUTES` in `src/api/build-api.ts`,
wire into `buildApi()` in `src/app.ts`.

Path alias: `@/*` → `apps/server/src/*`. JSX: `jsxImportSource: "hono/jsx"` (NOT
React).

### Client — Container / UI-Bridge pattern

```
Route → Container (data/logic) → UI-Bridge → Template (pure UI)
```

- Routing: file-based via TanStack Router (`src/routes/`, generates
  `routeTree.gen.ts`)
- Route groups: `_public`, `_authenticated`, `_workspace`, `_signing_public`
- State: Zustand (`src/stores/`), REST via TanStack Query, GraphQL via Apollo
  Client (HTTP + WS)
- i18n: i18next, namespaced locales in `src/i18n/locales/{en,cs,es,sv,fr}/`
- Path alias: `@/*` → `apps/client/src/*`

### Key Invariants — read before making changes

- **Error handling** is centralized on root app (`notFoundHandler`,
  `errorHandler` in `src/lib/`). Never add `notFound`/`onError` on child
  routers.
- **Always use `createRouter()`** from `src/lib/create-app.ts` for new modules.
  The Zod `defaultHook` does not propagate to child routers — the factory
  ensures it's applied.
- **Auth SSoT (HTTP):** `authMiddleware` parses JWT → sets `userId`/`userRole`
  in Hono context → GraphQL Yoga reads from Hono context. No re-parsing.
- **Auth (WS):** WebSocket connections parse JWT independently from
  `connectionParams`. Hono middleware is NOT involved.
- **Middleware order in `src/lib/create-app.ts` is critical** — changing it can
  break functionality.

### GraphQL

- Yoga + GraphQL Armor: `maxDepth: 10`, `maxAliases: 15`, `costLimit: 5000`
- Persisted operations enforced in production (APQ + `doc_id` style). Empty
  store → fail-fast crash.
- Introspection disabled in production, enabled in dev/test.
- WS: subscription-only gate (query/mutation rejected over WS). Auth via
  `connectionParams`.

**Vitest + GraphQL dual-package hazard (DO NOT REMOVE):** `graphql@16` ships
both CJS and ESM. Without `server.deps.inline: [/graphql/, ...]` +
`resolve.dedupe: ["graphql"]` in `apps/server/vitest.config.ts`, WS security
tests break due to `instanceof` mismatches across module copies.

**GraphQL test pattern** — mock env before any app imports, then dynamic import:

```ts
vi.mock('@/config/env', async importOriginal => {
  /* override NODE_ENV */
});
const { yoga } = await import('@/graphql/server'); // AFTER mock
```

See `src/graphql/__tests__/ws-security.test.ts` for reference.

## Environment

- Server: `apps/server/.env` (template: `.env.example`)
- Client: `apps/client/.env` (template: `.env.example`) — VITE\_\* only
- Root `.env` — Makefile / Docker Compose only, NOT loaded by runtime apps
- Test mode (`NODE_ENV=test`) auto-provides DATABASE_URL, JWT_SECRET,
  JWT_TOKEN_SECRET_KEY, ENCRYPTION_SECRET_KEY and loads `.env.test`
- Turbo `envMode: "strict"` — env vars must be listed in `turbo.json globalEnv`
  for correct caching

## Git Restrictions

`.claude/settings.json` denies all mutating git commands (add, commit, push,
merge, rebase, reset, checkout, etc.) and GitHub API access. Only read-only
operations (status, log, diff, show, blame, grep) are allowed.

## Conventions

### REST API changes

When adding or modifying a REST endpoint (query params, request body, response
shape, new status codes), **always update the OpenAPI spec in the same PR**.
Each module keeps its spec in `src/modules/<module>/<module>.openapi.ts`. The
spec drives generated docs (`/reference`) and is the contract for API consumers.

Checklist for every endpoint change:

- New query param → add to `parameters[]` with type, `minimum`/`maximum`,
  `default`, and description.
- New error response (e.g. 422 for invalid input) → add to `responses`.
- Changed response shape → update the envelope/results schema reference.

### Postman collection

The Postman collection lives in `apps/server/postman/collection.json` and is the
scenario-driven integration test suite run via Newman in CI. **Keep it in sync
with every API change** — out-of-sync collections silently pass stale scenarios.

Checklist for every endpoint change:

- New query param → add an entry to `url.query[]` with `key`, `value` (the
  default), and `description`. Update `url.raw` to include the param.
- New required field in response → add a `pm.test` assertion in the request's
  `test` script that validates the field exists and has the expected type.
- New error response (e.g. 422) → add a separate request that sends invalid
  input and asserts the expected status code.
- Renamed or removed field → update all `pm.test` assertions that reference it.

Structure reference: each item has `request.url.query[]` for query params and
`event[listen=test].script.exec[]` for test assertions (array of strings, one
per line).

### Tests

When changing server-side logic, update or add tests in the same commit:

- **Unit tests** live next to source in `__tests__/` (e.g.
  `src/modules/admin/__tests__/admin.service.test.ts`). Update Prisma mocks to
  cover new parameters (`skip`, `take`, filters) and add cases for: happy path,
  boundary values, and invalid input that should produce an error.
- **Do not leave existing tests calling the old signature without params** when
  the behaviour under default params has changed — verify the defaults are still
  correct or add a dedicated default-params test.
- Run `pnpm --filter server test` after every server change and fix failures
  before considering the task done.

## Docs

Deep technical docs in `docs/`. `docs/WIKI.md` is a ~58KB technical reference —
consult before making architectural decisions.
