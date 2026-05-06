# Server Guidelines

Hono + Prisma 7 (MariaDB) + GraphQL Yoga + Pothos. See @package.json for stack
and scripts; root `CLAUDE.md` for monorepo rules.

## Layered architecture (ESLint-enforced)

```
utils/ → config/ → lib/ → modules/
```

Violations are ESLint errors. `utils/` and `config/` ban dynamic imports
(`import()`, `require()`).

Entry points:

- `src/app.ts` — Hono assembly, exports `AppType` for RPC codegen
- `src/index.ts` — HTTP + WebSocket upgrade + graceful shutdown
- `src/api/build-api.ts` — versioned router factory (`/rest/v1`),
  `MODULE_ROUTES`

Path alias `@/*` → `apps/server/src/*`. **JSX uses `jsxImportSource: "hono/jsx"`
— NOT React.**

## Adding a module

1. Register GraphQL side-effect import + REST export in `src/modules/index.ts`.
2. Add entry to `MODULE_ROUTES` in `src/api/build-api.ts`.
3. Wire into `buildApi()` in `src/app.ts`.
4. Use `createRouter()` from `src/lib/create-app.ts` — the Zod `defaultHook`
   does not propagate to child routers; the factory ensures it is applied.

## Key Invariants

- **Centralized error handling** in root app (`notFoundHandler`, `errorHandler`
  in `src/lib/`). Never add `notFound`/`onError` on child routers.
- **Auth SSoT (HTTP)**: `authMiddleware` parses JWT → sets `userId`/`userRole`
  on Hono context → GraphQL Yoga reads from Hono context. No re-parsing
  downstream.
- **Auth (WS)**: WebSocket connections parse JWT independently from
  `connectionParams`. Hono middleware is NOT involved.
- **Middleware order in `src/lib/create-app.ts` is critical** — reordering can
  break behavior.
- Use typed errors from `src/exceptions/`. REST error responses must follow the
  existing envelope structure.

## GraphQL

- Yoga + GraphQL Armor: `maxDepth: 10`, `maxAliases: 15`, `costLimit: 5000`.
- Persisted operations enforced in production (APQ + `doc_id` style); empty
  store → fail-fast crash.
- Introspection disabled in production, enabled in dev/test.
- WS is subscription-only — query/mutation rejected over WS.
- Keep types and resolvers colocated by domain under `src/graphql/`.

**Test pattern** — mock env _before_ any app import, then dynamic-import:

```ts
vi.mock('@/config/env', async (importOriginal) => {
  /* override NODE_ENV */
});
const { yoga } = await import('@/graphql/server'); // AFTER mock
```

Working example: `src/graphql/__tests__/server.test.ts`.

**Vitest + GraphQL dual-package hazard**: `graphql@16` ships both CJS and ESM.
If `instanceof` mismatches surface in GraphQL/WS tests, add
`server.deps.inline: [/graphql/]` and `resolve.dedupe: ["graphql"]` to
`vitest.config.ts`.

## Prisma

- Use the client from `src/db/prisma.ts` or existing context helpers.
- Schema changes go through `prisma/schema.prisma` + a migration; never
  hand-edit `src/generated/prisma/**`.
- The `pretest` hook runs `db:generate` automatically; run it manually after a
  schema change before non-test work.

## REST + OpenAPI

Use `@hono/zod-openapi` for new routes. Each module owns its spec at
`src/modules/<module>/<module>.openapi.ts` — this drives `/reference` docs and
is the consumer contract.

When changing an endpoint, update its spec in the same change:

- New query param → add to `parameters[]` (type, `minimum`/`maximum`, `default`,
  description).
- New error response (e.g. 422) → add to `responses`.
- Changed response shape → update the envelope/results schema reference.

## Postman collection

`postman/collection.json` is the Newman-driven CI integration suite. Out-of-sync
collections silently pass stale scenarios — keep it in sync with every API
change.

For each endpoint change:

- New query param → add to `url.query[]` (`key`, `value` (default),
  `description`); update `url.raw`.
- New required response field → add a `pm.test` assertion validating presence
  and type.
- New error response → add a separate request with invalid input asserting the
  status.
- Renamed/removed field → update all `pm.test` assertions referencing it.

Structure: items use `request.url.query[]` for params and
`event[listen=test].script.exec[]` (array of strings, one per line) for
assertions.

## Logging

- Use **Pino**. No `console.log` / `console.error` / `console.warn` in
  application code.
- Structured logs with context: request IDs, route names, entity IDs, operation
  names.
- **Never log secrets, tokens, cookies, authorization headers, passwords, or
  sensitive request payloads.**
- Levels: `debug` (diagnostic), `info` (lifecycle), `warn` (recoverable),
  `error` (failures requiring attention).

## Testing

Vitest, co-located `*.test.ts` and `__tests__/*.test.ts`. Run `pnpm test` after
server changes.

When changing logic, update Prisma mocks to cover new parameters (`skip`,
`take`, filters) with happy-path, boundary, and invalid-input cases. Don't leave
existing tests calling old signatures unverified — defaults may have shifted.
