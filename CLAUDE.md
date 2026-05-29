# CLAUDE.md

TypeScript pnpm + Turborepo monorepo for an orienteering event platform.

See @README.md for project overview and @package.json for available scripts.
Per-app rules live in `apps/*/CLAUDE.md`.

## Workspaces

| Workspace | Path              | Stack                                                               |
| --------- | ----------------- | ------------------------------------------------------------------- |
| client    | `apps/client`     | Vite 7, React 19, TanStack Router/Query, Apollo, Tailwind 4, shadcn |
| server    | `apps/server`     | Hono, Prisma 7 (MariaDB), GraphQL Yoga + Pothos, Pino, Zod OpenAPI  |
| board     | `apps/board`      | Vite, Vue 3, Pinia, TanStack Vue Query, UnoCSS                      |
| shared    | `packages/shared` | Zod schemas + TS types (`@repo/shared`)                             |

The `board` app is excluded from root `pnpm dev` — start it separately with
`pnpm dev:board`.

## Requirements

- Node.js 24.15.0 (`nvm install && nvm use`)
- pnpm 11.4.0 (`corepack enable && corepack use pnpm@11.4.0`)
- Docker for local MariaDB:
  `docker compose -f docker-compose.mysql.yaml up -d mysql`

Bootstrap: `pnpm setup:dev && pnpm db:generate && pnpm db:migrate`.

Use `:win` script variants (`pnpm dev:win`, etc.) on Windows shells that don't
support POSIX-style env assignments like `NODE_ENV=development PORT=3001`.

## Cross-cutting Rules

- **Shared contracts**: Zod schemas crossing the network boundary live in
  `packages/shared`. Rebuild with `pnpm --filter @repo/shared build` after
  changes; verify both consumers still type-check.
- **Runtime env files** are app-local only (`apps/client/.env`,
  `apps/server/.env`, `apps/board/.env`). The repo-root `.env` is for Docker
  Compose / Traefik interpolation only — runtime apps don't load it.
- **Browser exposure**: only `VITE_*` variables reach client/board browser code.
- **Test mode** (`NODE_ENV=test`) auto-provides `DATABASE_URL`, `JWT_SECRET`,
  `JWT_TOKEN_SECRET_KEY`, `ENCRYPTION_SECRET_KEY` and loads `.env.test`.
- **Turbo strict env**: new env vars affecting Turbo tasks must be added to
  `turbo.json:globalEnv`, otherwise caching breaks.
- **i18n**: frontend user-facing copy uses i18next locale keys, not hardcoded
  strings.
- **YAML extension**: use `.yaml`, not `.yml`.

## Git Restrictions

`.claude/settings.json` denies all mutating git commands (add, commit, push,
merge, rebase, reset, checkout) and GitHub API access. Only read-only operations
(status, log, diff, show, blame, grep) are allowed.

## Conventional Commits

Use `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`. Releases on `main`
are automated by `semantic-release` and require an explicit release request via
PR label (`release:patch|minor|major`), `Release-Type:` commit trailer, or
`workflow_dispatch`.

## Documentation

- `docs/WIKI.md` is a ~58KB technical reference — consult before architectural
  decisions.
- `docs/DEPLOYMENT_K3S.md` covers Helm/k3s deployment.
- Update `README.md`, `CONTRIBUTING.md`, or `docs/` when behavior, public API,
  infrastructure, or configuration changes.
