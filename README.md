# OFeed

[![Nodejs Version](https://img.shields.io/badge/node.js-24.15.0%20LTS-green.svg)](https://nodejs.org/)
[![CI](https://github.com/orienteerfeed/ofeed/actions/workflows/ci.yaml/badge.svg)](https://github.com/orienteerfeed/ofeed/actions/workflows/ci.yaml)
[![License](https://img.shields.io/badge/license-GPLv3-blue.svg)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/orienteerfeed/ofeed?label=GitHub%20Stars)](https://github.com/orienteerfeed/ofeed/stargazers)

OrienteerFeed (OFeed) is a monorepo web platform for orienteering event data,
combining REST + GraphQL APIs, real-time event workflows, and a modern React
frontend.

⭐ Star us on GitHub — it motivates us a lot!

[![](https://dcbadge.limes.pink/api/server/https://discord.gg/YWURC23tHZ)](https://discord.gg/YWURC23tHZ)

## How It Works

This application is like a digital hub for all things related to orienteering
events. It serves as a one-stop platform where you can get details about various
events, the classes offered at these events, and the competitors participating
in them. It provides these services through a web server and is capable of
communicating using both RESTful APIs and GraphQL, which are two ways of
fetching data from a server.

## Localization

We are using [Weblate](https://hosted.weblate.org/projects/ofeed/) free
localization hosting, thanks to [weblate.org](https://weblate.org/) and Michal
Čihař.

[![Translation status](https://hosted.weblate.org/widget/ofeed/multi-auto.svg)](https://hosted.weblate.org/engage/ofeed/)

## Tech Stack

- Client: Vite + React + TypeScript
- Board: Vue 3 + Vite + TypeScript
- Server: Hono + TypeScript + GraphQL Yoga + Pothos + Prisma (MariaDB adapter)
- UI: shadcn/ui + Tailwind CSS
- Data and Routing: TanStack Query + TanStack Router
- i18n: i18next + react-i18next
- Monorepo: pnpm workspaces + Turborepo
- Shared: `@repo/shared` (shared schemas/types)

## Repository Layout

```text
apps/
  board/     # Vite + Vue event board application
  client/    # Vite + React application
  server/    # Hono + Prisma API
packages/
  shared/    # shared schemas/types
```

## Requirements

- Node.js version pinned in `.nvmrc` (`24.15.0`)
- pnpm `>=11.0.0` (pinned via `packageManager` to `11.4.0`)
- Docker with Docker Compose for the documented local database setup

Keep Zod dependency versions aligned in `packages/shared`, `apps/client`, and
`apps/server` so shared schemas and the server's OpenAPI integration use
compatible types. Update all three manifests and regenerate `pnpm-lock.yaml`
together when upgrading Zod.

Use nvm to install and activate the exact Node.js version from `.nvmrc`:

```bash
nvm install
nvm use
```

Use Corepack:

```bash
corepack enable
corepack use pnpm@11.4.0
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
- creates `apps/board/.env` from `apps/board/.env.example` (if missing)

Review the app-local `.env` files before starting the apps. Ensure the server's
`DATABASE_URL` matches the local database and set the required values described
in [the server environment guide](./apps/server/README.md#environment).

Then run:

```bash
docker compose -f compose.mysql.yaml up -d mysql
pnpm db:generate
pnpm db:migrate
pnpm dev
```

On Windows shells that do not support POSIX-style environment assignments, use
the Windows aliases:

```powershell
pnpm dev:win
```

Run the board only when needed:

```bash
pnpm dev:board
```

On Windows:

```powershell
pnpm dev:board:win
```

Default local URLs:

- Client: `http://localhost:3000`
- API: `http://localhost:3001`
- Board dev server: `http://localhost:5173` when started with `pnpm dev:board`
- GraphQL: `http://localhost:3001/graphql`
- OpenAPI JSON: `http://localhost:3001/doc`
- API Reference UI: `http://localhost:3001/reference`
- Liveness: `http://localhost:3001/healthz`
- Readiness: `http://localhost:3001/readyz`
- Metrics (Prometheus): `http://localhost:3001/metrics`

## Development Commands (Root)

- `pnpm setup:dev` - bootstrap local dev environment
- `pnpm dev` - run client + server in parallel via Turborepo
- `pnpm dev:win` - Windows-friendly client + server dev command
- `pnpm dev:board` - run only the board app; it is intentionally excluded from
  `pnpm dev`
- `pnpm dev:board:win` - Windows-friendly board dev command
- `pnpm build` - build all workspace packages/apps
- `pnpm lint` - lint all workspace packages/apps
- `pnpm format` - format repo files with Prettier
- `pnpm format:check` - check formatting
- `pnpm type-check` - type-check all packages/apps
- `pnpm type-check:graphql` - run the server GraphQL/Pothos type-check profile
- `pnpm test` - run tests across workspace
- `pnpm test:watch` - run tests in watch mode (parallel)
- `pnpm test:client` - run only client tests
- `pnpm test:server` - run only server tests
- `pnpm --filter ./apps/board test:unit` - run board unit tests separately; the
  board has no `test` script, so root `pnpm test` does not include them
- `pnpm db:generate` - run prisma generate via turbo
- `pnpm db:migrate` - run prisma migrate via turbo
- `pnpm clean` - clean turbo outputs

## App-Level Commands

### Server (`apps/server`)

- `pnpm dev` / `pnpm start:dev` - run API in watch mode
- `pnpm dev:win` / `pnpm start:dev:win` - Windows-friendly API watch mode
- `pnpm build` - build `@repo/shared` for Node and compile the server to
  `dist/index.js`
- `pnpm start:dist` - run the built server from `dist/index.js`
- `pnpm test` / `pnpm test:watch`
- `pnpm type-check` / `pnpm type-check:graphql`
- `pnpm lint` / `pnpm lint:fix`
- `pnpm db:generate`
- `pnpm db:migrate`
- `pnpm db:migrate:deploy`
- `pnpm db:seed`

### Shared (`packages/shared`)

- `pnpm build` - compile runtime JS to `dist/` for Node consumers such as the
  built server
- `pnpm type-check`

### Client (`apps/client`)

- `pnpm dev`
- `pnpm dev:win`
- `pnpm build`
- `pnpm test` / `pnpm test:watch`
- `pnpm lint` / `pnpm lint:fix`
- `pnpm e2e`

### Board (`apps/board`)

- `pnpm dev`
- `pnpm dev:win`
- `pnpm build`
- `pnpm test:unit`
- `pnpm lint` / `pnpm lint:fix`
- `pnpm test:e2e`

## Database and Prisma

- Prisma schema: `apps/server/prisma/schema.prisma`
- Prisma Client output is generated into: `apps/server/src/generated/prisma`
- Pothos Prisma types are generated into:
  `apps/server/src/generated/pothos-prisma-types.ts`
- ORM: Prisma v7 with MariaDB adapter (`@prisma/adapter-mariadb`)
- `pnpm db:generate` runs Prisma generate for both the Prisma Client and the
  generated Pothos Prisma type map.
- Server `type-check` and `type-check:graphql` run `db:generate` first, so local
  clean checkouts regenerate ignored Prisma/Pothos generated files before
  TypeScript resolves them.

## Server GraphQL Architecture

The server GraphQL API is built with GraphQL Yoga, Pothos, and
`@pothos/plugin-prisma`.

- `apps/server/src/graphql/*` contains only global GraphQL infrastructure:
  Pothos builder setup, Yoga context helpers, root schema composition, scalar
  registrations, and HTTP/WebSocket integration.
- `apps/server/src/modules/*/*.graphql.ts` owns feature-level GraphQL type and
  field registration.
- Reusable GraphQL object/input/enum refs live in
  `apps/server/src/modules/*/*.graphql-types.ts`; root registration files should
  not be imported by another module just to reuse a type.
- `apps/server/src/modules/*/*.service.ts` owns business and data-access logic.
- `apps/server/src/modules/*/*.schema.ts` owns Zod input/output contracts when a
  module needs shared validation. Services should import `z.infer` types from
  these schemas instead of keeping parallel hand-written TypeScript input types.

## Docker Compose

This repository does not require root `.env` for application runtime. Use
app-level env files:

- `apps/server/.env`
- `apps/client/.env`
- `apps/board/.env`

Create them from examples:

```bash
cp apps/server/.env.example apps/server/.env
cp apps/client/.env.example apps/client/.env
cp apps/board/.env.example apps/board/.env
```

Start full app stack:

```bash
docker compose up -d --build
```

All app images use the repository root as their build context. Keep `patches/`
in that context: each dependency-install stage copies it before running pnpm,
because `pnpm-workspace.yaml` declares patched dependencies even for filtered
installs.

Available compose overlays:

- `compose.mysql.yaml` - local MySQL/MariaDB-compatible DB
- `compose.minio.yaml` - local MinIO + init
- `compose.traefik.yaml` - Traefik labels/integration
- `compose.scaled.yaml` - static replicas for api/frontend
- `compose.infra.yaml` - attach shared external network
- `compose.remote.yaml` - host networking variant (API)

Docker Compose can also use a root `.env` only for Compose interpolation, for
example:

- `SERVER_PORT=3001`
- `FRONTEND_PORT=3000`
- `BOARD_PORT=3002`
- `API_HOST=api.orienteerfeed.com`
- `FRONTEND_HOST=orienteerfeed.com`
- `BOARD_HOST=board.orienteerfeed.com`
- `TRAEFIK_CERT_RESOLVER=le`

An example Compose-only file is provided as [`.env.example`](./.env.example).
Keep in mind that this root `.env` is optional and is meant for Docker/Traefik
interpolation only, not for app runtime configuration.

## Helm / k3s Deployment

- Helm chart: `deploy/helm/ofeed`
- Deployment guide: `docs/DEPLOYMENT_K3S.md`

## CI/CD and Versioning Flow

### Automated versioning and GitHub releases

Semantic-release automatically infers versions from Conventional Commits:
`fix:`/`perf:` → patch, `feat:` → minor, breaking changes → major.
Labels are not required. An optional `Release-Type:` trailer or manual workflow
override is an emergency fallback; it cannot downgrade the inferred level.

The delivery contract is:

1. PR into `develop`: source verification only.
2. Merge into `develop`: verify, build four multi-architecture candidate images
   and a versioned chart, record their digests, then atomically update dev GitOps.
3. `release/*` or `hotfix/*` PR into `main`: qualify the exact candidate
   containers, migrations, browser flows, contracts and chart package.
4. Merge the qualified PR using a merge commit: promote those existing image
   digests without a rebuild, then create `vX.Y.Z`, publish GitHub Release notes
   and open a production GitOps PR.
5. Merge the production GitOps PR: Argo CD deploys `ofeed.live`. Revert the bump
   through Git to roll back within the tested database compatibility window.

The `GITOPS_TOKEN` secret, branch protections, the existing MariaDB test-database
bootstrap, Vault and first-deployment checks are documented in the
[delivery pipeline and activation guide](./docs/DELIVERY_MODEL.md). The code is
implemented locally; the guide distinguishes that from live activation.

The release workflow does not push generated package-version/changelog commits
to main. Keep `CHANGELOG.md` manually in Keep a Changelog format. Documentation
and maintenance-only commits do not release unless explicitly overridden.

### Docker image publishing

`.github/workflows/publish-images-ghcr.yaml` publishes candidates for pushes to
`develop`, `release/*` and `hotfix/*`, never for a feature PR alone. Each
candidate contains `linux/amd64` and `linux/arm64` manifests, SBOM and provenance.
Stable `X.Y.Z` aliases refer to the same qualified manifest digests:

- `ghcr.io/orienteerfeed/ofeed/server:X.Y.Z`
- `ghcr.io/orienteerfeed/ofeed/ops:X.Y.Z` for `prisma migrate deploy`
- `ghcr.io/orienteerfeed/ofeed/client:X.Y.Z`
- `ghcr.io/orienteerfeed/ofeed/board:X.Y.Z`

GitOps always pins both an explicit alias and a digest. The qualified chart
package is versioned, digest-verified and vendored into the same environment
commit. CI never obtains cluster credentials. After first publication, make the
application image packages public or provide environment-specific read-only
GHCR pull credentials.

Client and board images are environment-neutral: public browser configuration is
generated as `/runtime-config.js` when the container starts. Set only the
documented `OFEED_*` variables in Docker Compose or Kubernetes; never expose
server secrets through those variables. Deployment guidance is in
[`docs/DEPLOYMENT_ARGOCD.md`](./docs/DEPLOYMENT_ARGOCD.md).

Existing Compose app-local `.env` files using `VITE_*` remain supported at
container startup. Non-empty `OFEED_*` values take precedence over their legacy
`VITE_*` equivalents. For naming, migration, and production verification, see
[`docs/FRONTEND_CONFIGURATION.md`](./docs/FRONTEND_CONFIGURATION.md).

The client and board images run as UID 101, which owns a pre-created
`runtime-config.js` so startup scripts can write it. The API image includes
`wget` for the Docker Compose `/healthz` check. When updating these Dockerfiles
in a source-based Compose deployment, rebuild the images with
`docker compose build` before running `docker compose up -d --remove-orphans`.

## Documentation and AI Agents

- [Documentation index](./docs/README.md): architecture, configuration,
  deployment, feature references, and scoped guides.
- [AGENTS.md](./AGENTS.md): the canonical entry point for coding agents, with
  stack details, commands, conventions, and links to directory-specific rules.
- [CLAUDE.md](./CLAUDE.md): imports `AGENTS.md` for Claude Code. App-level
  `CLAUDE.md` files import the corresponding scoped guidelines.

## Contributing

Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution process and
standards.

1. Create your feature branch: `git checkout -b feature/my-new-feature`
2. Commit your changes using Conventional Commits:

```bash
git commit -m "feat(server): add event image upload validation"
git commit -m "fix(auth): handle invalid refresh token"
git commit -m "docs(readme): update contributing examples"
git commit -m "feat(events): add competitor status sync" -m "Refs #45"
git commit -m "feat(events): add competitor status sync" -m "Closes #45"
```

3. Push to the branch: `git push origin feature/my-new-feature`
4. Submit a pull request :D

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

## Credits

- [Martin Křivda](https://github.com/martinkrivda)
- [Lukáš Kettner](https://github.com/lukaskett)
- [All Contributors](https://github.com/orienteerfeed/ofeed/graphs/contributors)

## License

[![License](https://img.shields.io/badge/license-GPLv3-blue.svg)](./LICENSE)

This repository is licensed under the GNU General Public License v3.0. See
[LICENSE](./LICENSE).

Contributions are accepted under the terms of [CLA.md](./CLA.md). By
contributing, you agree that your contributions may be relicensed and used in
commercial products and SaaS offerings.
