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
