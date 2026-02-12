# OFeed

[![Nodejs Version](https://img.shields.io/badge/node.js-22.20%20LTS-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-GPLv3-blue.svg)](LICENSE)

OrienteerFeed (OFeed) is a monorepo web platform for orienteering event data, combining REST + GraphQL APIs, real-time event workflows, and a modern React frontend.

## Tech Stack

- Client: Vite + React + TypeScript
- Server: Hono + TypeScript + Prisma (MariaDB adapter)
- UI: shadcn/ui + Tailwind CSS
- Data and Routing: TanStack Query + TanStack Router
- i18n: i18next + react-i18next
- Monorepo: pnpm workspaces + Turborepo
- Shared: `@repo/shared` (shared schemas/types)

## Repository Layout

```text
apps/
  client/    # Vite + React application
  server/    # Hono + Prisma API
packages/
  shared/    # shared schemas/types
```

## Requirements

- Node.js version pinned in `.nvmrc` (`22.20.0`)
- pnpm `>=10.20.0 <11` (recommended: `10.29.2`)

Use nvm to install and activate the exact Node.js version from `.nvmrc`:

```bash
nvm install
nvm use
```

Use Corepack:

```bash
corepack enable
corepack prepare pnpm@10.29.2 --activate
pnpm -v
```

## Quick Start (Local Development)

```bash
git clone https://github.com/orienteerfeed/ofeed.git
cd ofeed
pnpm setup:dev
```

`pnpm setup:dev`:

- installs dependencies
- creates `apps/server/.env` from `apps/server/.env.example` (if missing)
- creates `apps/client/.env` from `apps/client/.env.example` (if missing)

Then run:

```bash
docker compose -f docker-compose.mysql.yaml up -d mysql
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Default local URLs:

- Client: `http://localhost:3000`
- API: `http://localhost:3001`
- GraphQL: `http://localhost:3001/graphql`
- OpenAPI JSON: `http://localhost:3001/doc`
- API Reference UI: `http://localhost:3001/reference`
- Health: `http://localhost:3001/health`
- Metrics (Prometheus): `http://localhost:3001/metrics`

## Development Commands (Root)

- `pnpm setup:dev` - bootstrap local dev environment
- `pnpm dev` - run client + server in parallel via Turborepo
- `pnpm build` - build all workspace packages/apps
- `pnpm lint` - lint all workspace packages/apps
- `pnpm format` - format repo files with Prettier
- `pnpm format:check` - check formatting
- `pnpm type-check` - type-check all packages/apps
- `pnpm test` - run tests across workspace
- `pnpm test:watch` - run tests in watch mode (parallel)
- `pnpm test:client` - run only client tests
- `pnpm test:server` - run only server tests
- `pnpm db:generate` - run prisma generate via turbo
- `pnpm db:migrate` - run prisma migrate via turbo
- `pnpm clean` - clean turbo outputs

## App-Level Commands

### Server (`apps/server`)

- `pnpm dev` / `pnpm start:dev` - run API in watch mode
- `pnpm test` / `pnpm test:watch`
- `pnpm lint` / `pnpm lint:fix`
- `pnpm db:generate`
- `pnpm db:migrate`
- `pnpm db:migrate:deploy`
- `pnpm db:seed`

### Client (`apps/client`)

- `pnpm dev`
- `pnpm build`
- `pnpm test` / `pnpm test:watch`
- `pnpm lint` / `pnpm lint:fix`
- `pnpm e2e`

## Database and Prisma

- Prisma schema: `apps/server/prisma/schema.prisma`
- Prisma Client output is generated into: `apps/server/src/generated/prisma`
- ORM: Prisma v7 with MariaDB adapter (`@prisma/adapter-mariadb`)

## Docker Compose

This repository does not require root `.env` for application runtime.
Use app-level env files:

- `apps/server/.env`
- `apps/client/.env`

Create them from examples:

```bash
cp apps/server/.env.example apps/server/.env
cp apps/client/.env.example apps/client/.env
```

Start full app stack:

```bash
docker compose up -d --build
```

Available compose overlays:

- `docker-compose.mysql.yaml` - local MySQL/MariaDB-compatible DB
- `docker-compose.minio.yaml` - local MinIO + init
- `docker-compose.traefik.yaml` - Traefik labels/integration
- `docker-compose.scaled.yaml` - static replicas for api/frontend
- `docker-compose.infra.yaml` - attach shared external network
- `docker-compose.remote.yaml` - host networking variant (API)

## Helm / k3s Deployment

- Helm chart: `deploy/helm/ofeed`
- Deployment guide: `docs/DEPLOYMENT_K3S.md`

## CI/CD and Versioning Flow

### Automated versioning and GitHub releases

Releases are automated from `main` via `semantic-release` (`.github/workflows/release.yaml`).

Behavior:

- every push to `main` (except `package.json`-only commits) creates a new release version (`patch` increment)
- creates git tag `vX.Y.Z`
- creates GitHub Release
- after successful release, `.github/workflows/sync-version-pr.yaml` creates/updates PR that syncs root `package.json` version to released tag

Note:

- set optional secret `RELEASE_PLEASE_TOKEN` (PAT) to allow tag/release events to trigger downstream workflows (for example Docker publish). If it is not set, workflow falls back to `GITHUB_TOKEN`.

### Docker image publishing

Docker images are published by `.github/workflows/publish-images-ghcr.yaml` on tag `v*` to GHCR:

- `ghcr.io/orienteerfeed/ofeed-server`
- `ghcr.io/orienteerfeed/ofeed-client`

Packages are published as private by default.

## Contributing

Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution process and standards.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

## Credits

- [Martin Křivda](https://github.com/martinkrivda)
- [Lukáš Kettner](https://github.com/lukaskett)
- [All Contributors](https://github.com/orienteerfeed/ofeed/graphs/contributors)

## License

[GPL-3.0](./LICENSE)
