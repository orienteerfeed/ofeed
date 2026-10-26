# Testing strategy

Run the narrowest meaningful checks for the changed area, then broaden only when
failures or cross-workspace impact justify it. Report checks that could not run.

## Layers

| Layer             | What to verify                                                                  | Dependencies                                                                             |
| ----------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Unit / validation | Domain calculations, allowed inputs, fee and eligibility edge cases             | Pure fixtures; no live provider calls                                                    |
| Service           | Authorization, query semantics, transaction boundaries, status and availability | Mock Prisma/provider boundaries where appropriate; mocks do not prove database isolation |
| API contract      | OpenAPI fields/errors, GraphQL execution and intentional schema changes         | Test app and controlled fixtures                                                         |
| Component         | Rendering, forms, localized validation and user interactions                    | Testing Library and controlled network responses                                         |
| Browser           | Critical user journeys, navigation, auth and checkout                           | Running API, test data/accounts and browser binaries                                     |
| Deployment        | Helm/image/migration delivery contract                                          | Existing checks in CI and `scripts/delivery`                                             |

Mock external email, storage, federation and timing services in deterministic
unit/service tests. Do not mock the business rule under test. Use a disposable
database when actual constraints, locking or concurrency need verification;
never run destructive fixtures against production.

## Commands from repository root

```bash
pnpm --filter ./apps/server test
pnpm --filter ./apps/client test
pnpm --filter ./apps/board test:unit
pnpm --filter ./apps/server exec vitest run src/config/__tests__/openapi-doc.test.ts
pnpm --filter ./apps/client e2e
pnpm --filter ./apps/board test:e2e
```

Server `test` and type-check scripts regenerate Prisma first. For a focused
`exec vitest` run on a fresh checkout, prepare generated files and shared builds
first. Root [package.json](../../package.json) defines aggregate `pnpm lint`,
`pnpm type-check`, `pnpm type-check:graphql`, `pnpm test` and `pnpm build`;
[CI](../../.github/workflows/ci.yaml) is the current automated gate.

## UI setup and artifacts

Client browser setup signs in with `E2E_USER_EMAIL` / `E2E_USER_PASSWORD`
(fallbacks exist for local tests); provide a matching test account and running
API. The Playwright web-server configuration starts the frontend, not the full
backend. Board CI uses a preview server, so prepare its build before browser
tests. Consult each workspace's Playwright config for exact projects and
startup. Keep screenshots, traces and authentication state out of commits and
shared artifacts if they contain secrets or personal data.

## Coverage and regressions

No repository-wide numeric coverage threshold is established here. Prioritize
meaningful regressions for security, money, imports and concurrent availability.
Use feature specs to name scenarios and gaps rather than claiming a coverage
percentage proves correctness. For documentation-only changes, check formatting,
local link targets, filename case and whitespace; app suites are usually
unnecessary.

## Punch concurrency integration tests

Punch integration tests are opt-in. Prepare a disposable local MariaDB database
named `ofeed_punch_test` (or `ofeed_punch_test_*`) with the current schema and
migrations, then run directly, bypassing task caching:

```bash
PUNCH_TEST_DATABASE_URL='mysql://test-user:test-password@127.0.0.1:3306/ofeed_punch_test' \
  pnpm --filter ./apps/server exec vitest run src/modules/punch/__tests__/punch.integration.test.ts
```

The suite refuses non-local databases and other database names, creates synthetic
fixtures and removes them after each test. It verifies cross-connection locking,
retry and physical uniqueness, atomic rollback, pending assignment, timing/status
precedence, snapshots and deletion. Default server tests skip this suite when the
variable is absent. Never point this suite at a production or shared development
database. Prisma generation and applying migrations are separate prerequisites.
## Payment concurrency integration tests

Payment integration tests require a disposable local MariaDB database named
`ofeed_payment_test` (or `ofeed_payment_test_*`) with current migrations applied.
The suite rejects non-local hosts and other database names. It creates synthetic
fixtures and removes them after each test; default server tests skip it.

```bash
PAYMENT_TEST_DATABASE_URL='mysql://test-user:test-password@127.0.0.1:13381/ofeed_payment_test' \
  pnpm --filter ./apps/server exec vitest run src/modules/entry/__tests__/entry-payment.integration.test.ts
```

The suite verifies concurrent payments and retries, races with manual updates and
repricing, currency protection, atomic rollback, report filters and database
constraints. Never point it at a shared or production database. Prisma generation
and migration deployment to the disposable database are separate prerequisites.
## Create idempotency concurrency tests

Use a disposable local MariaDB database named `ofeed_idempotency_test` (or
`ofeed_idempotency_test_*`) with the current migrations. The suite rejects other
hosts/database names, removes its synthetic fixtures and is skipped by default.
It checks cross-connection serialization, durable replay, atomic rollback and
expired key reuse.

```bash
IDEMPOTENCY_TEST_DATABASE_URL='mysql://root@127.0.0.1:13382/ofeed_idempotency_test' \
  pnpm --filter ./apps/server exec vitest run src/modules/idempotency/__tests__/create-idempotency.integration.test.ts
```
