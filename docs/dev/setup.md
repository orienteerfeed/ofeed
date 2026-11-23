# Local development setup

## Requirements

Use Node.js `24.15.0` from [.nvmrc](../../.nvmrc), pnpm `11.4.0` from
[package.json](../../package.json), and Docker for the local database. Follow
the root [quick start](../../README.md#quick-start-local-development) for
Node/Corepack activation and bootstrap commands.

From the repository root:

```bash
pnpm setup:dev
docker compose -f compose.mysql.yaml up -d mysql
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Bootstrap installs dependencies and creates missing app-local environment files
from examples. Configure database credentials consistently with local Compose.
Do not copy real production secrets into examples or documentation.

## Local database

`compose.mysql.yaml` runs **MariaDB 11.4 (LTS)**, the version used by
integration tests. CI additionally applies all migrations to `mariadb:latest`.
MySQL is not supported: the server uses the Prisma MariaDB adapter, and
migrations are not tested against MySQL (for example, current MySQL releases
lack the `MD5()` function used by a data migration).

- Before the first start, fill the empty `MYSQL_ROOT_PASSWORD`,
  `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_HOST` and
  `MYSQL_PORT` values in `apps/server/.env` with local-only credentials. The
  container reads the same file. `DATABASE_URL` may stay empty; the server and
  `prisma.config.ts` derive it from the `MYSQL_*` values.
- Data lives in the named Docker volume `<project>_mysql-data`, not in a
  host-directory bind mount. Host file systems on macOS and Windows are
  case-insensitive, which makes MariaDB switch to `lower_case_table_names=2`
  and breaks migrations referencing `Event`-style table names.
- To sync an existing database with the current branch, apply committed
  migrations without creating new ones:

  ```bash
  pnpm --filter ./apps/server db:migrate:deploy
  ```

  `pnpm db:migrate` (`prisma migrate dev`) needs a shadow database; the
  `MYSQL_USER` created by the image cannot create one. Use it only when
  authoring a migration, with `SHADOW_DATABASE_URL` or root credentials.
- Reset the local database (destroys all local data):

  ```bash
  docker compose -f compose.mysql.yaml down -v
  ```

- Upgrading from the former `mysql:latest` bind-mount setup: data in
  `./mysql-data` is not migrated automatically and MySQL data files are not
  MariaDB-compatible. Start with a fresh volume and re-run migrations and seeds.
- Never commit migrations that edit already applied ones; Prisma stores
  checksums of applied migrations. Write new migrations in SQL supported by
  every tested MariaDB version.

## Workspaces and ports

| Application      | Start            | Local URL                                        |
| ---------------- | ---------------- | ------------------------------------------------ |
| Client + server  | `pnpm dev`       | `http://localhost:3000`, `http://localhost:3001` |
| Board (separate) | `pnpm dev:board` | `http://localhost:5173`                          |
| GraphQL          | Server process   | `http://localhost:3001/graphql`                  |
| API docs         | Server process   | `http://localhost:3001/reference`                |

`pnpm dev` intentionally excludes the board. Shared-contract changes may require
`pnpm --filter @repo/shared build` before server consumers load the updated JS.

## Environment ownership

Runtime files are `apps/client/.env`, `apps/server/.env` and `apps/board/.env`.
A root `.env` is optional for Compose/Traefik interpolation only; applications
do not use it as their runtime configuration. Only browser-safe `VITE_*` values
may be used in frontend builds. Container runtime browser configuration is
documented in [frontend configuration](../FRONTEND_CONFIGURATION.md).

## macOS and Windows

- macOS/POSIX shells can use the standard scripts and root README commands.
- Windows shells without POSIX environment assignments use `pnpm dev:win` and
  `pnpm dev:board:win`; workspace-specific `:win` variants are in package
  scripts.
- Match filename case exactly; macOS can hide errors that Linux CI will expose.
- Docker Compose overlays and full-stack startup are in the
  [root README](../../README.md#docker-compose).

## Browser-driven UI testing

The root [.mcp.json](../../.mcp.json) connects Playwright MCP to Chrome CDP on
`http://localhost:9222`. Start Chrome using the
[macOS command in the root README](../../README.md#ui-testing-with-playwright-mcp)
and reload the MCP client's configuration. The dedicated browser profile
persists sessions; use test accounts and keep it outside the repository. MCP
interaction is separate from the repeatable browser suites in
[testing](testing.md).
