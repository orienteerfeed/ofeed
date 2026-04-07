# Repository Guidelines

## Scope

This file applies to the whole monorepo. More specific instructions in
`apps/client/AGENTS.md`, `apps/server/AGENTS.md`, and
`packages/shared/AGENTS.md` override these rules inside their directories.

## Repository Overview

This repository is a `pnpm` workspace orchestrated by Turborepo.

- `apps/client`: Vite + React frontend.
- `apps/server`: Hono + GraphQL Yoga + Prisma backend.
- `packages/shared`: shared TypeScript/Zod contracts consumed via
  `@repo/shared`.
- `docs/`: project, deployment, and environment references.
- `deploy/`: Helm and deployment assets.

Do not hand-edit generated artifacts unless the task explicitly requires it.
Important generated paths:

- `apps/client/src/routeTree.gen.ts`
- `apps/server/src/generated/**`

## Environment

- Use Node.js `24.14.1` from the root `.nvmrc`.
- Use `pnpm` `10.33.0` via Corepack. The allowed range is `>=10.33.0 <11`.
- Runtime env files are app-local only:
  - `apps/client/.env`
  - `apps/server/.env`
- Do not introduce a root runtime `.env` for application behavior.
- `turbo.json` uses strict env handling. When adding a new env var that affects
  Turbo tasks, update `turbo.json` and the relevant `.env.example` file.

## Working Agreements

- TypeScript + ESM is the default across apps and packages.
- Prefer small, targeted changes over broad refactors.
- For frontend user-facing text, use the existing i18n locale resources or add
  new locale entries when needed rather than hard-coded copy.
- Keep cross-service API contracts and reusable validation schemas in
  `packages/shared` whenever both client and server depend on them.
- If a schema is server-only or UI-only, keep it close to the feature that owns
  it.
- Update `README.md`, `CONTRIBUTING.md`, or `docs/` when behavior, public API,
  infrastructure, or configuration changes.
- Use the `.yaml` extension for YAML files; do not introduce new `.yml` files.
- Preserve contributor-facing references to `CLA.md` when changing contribution,
  licensing, or pull request workflows.
- Never commit secrets. Only client-safe `VITE_*` variables may reach browser
  code.

## Build, Test, and Development Commands

Run from the repository root unless noted otherwise.

- `pnpm install`: install all workspace dependencies.
- `pnpm setup:dev`: bootstrap local development.
- `pnpm dev`: run workspace dev tasks in parallel.
- `pnpm build`: build all workspaces.
- `pnpm lint`: lint all workspaces.
- `pnpm format`: format the repo with Prettier.
- `pnpm format:check`: verify formatting.
- `pnpm type-check`: run TypeScript checks across workspaces.
- `pnpm --filter @repo/shared build`: rebuild shared contracts after changing
  `packages/shared`.
- `pnpm test`: run workspace tests.
- `pnpm test:watch`: run watch-mode tests in parallel.
- `pnpm test:client`: run client tests only.
- `pnpm test:server`: run server tests only.
- `pnpm db:generate`: run Prisma generate through Turbo.
- `pnpm db:migrate`: run Prisma migrations through Turbo.
- `docker compose -f docker-compose.mysql.yaml up -d mysql`: start local
  MariaDB/MySQL for backend work.

Prefer `pnpm --filter ./apps/client ...` or `pnpm --filter ./apps/server ...`
when validating a single workspace.

## Style and Naming

- Formatting defaults come from the root `.editorconfig` and `.prettierrc`:
  UTF-8, LF, 2-space indentation, semicolons, single quotes, `printWidth: 100`.
- Follow local workspace overrides where they exist.
- Preserve the current import style and path aliases of the touched workspace.
- Write clear, typed code. Avoid `any` unless there is a concrete reason.

## Validation and Contracts

- Use Zod-based schemas as the main validation source of truth.
- Reuse shared schemas between frontend forms and backend handlers when the same
  payload crosses the network.
- Prefer GraphQL for first-party internal app communication and REST for
  external, integration-facing, or public API surfaces.
- For REST endpoints, keep the existing response API structure consistent with
  current server response helpers.
- Keep REST, GraphQL, and form validation behavior aligned.

## Testing Expectations

- Run the narrowest meaningful checks for the area you changed.
- Prefer focused unit tests for new behavior and regressions; add or update them
  together with the code change when practical.
- Frontend changes should usually run relevant client Vitest commands and, for
  route/form flows, Playwright when practical.
- Backend changes should run relevant server Vitest commands; schema changes
  should also run Prisma generation or migration commands as needed.
- If you cannot run a required check, say so explicitly in the final handoff.

## Commit and Review Guidance

- Follow Conventional Commits such as `feat:`, `fix:`, `chore:`, `docs:`,
  `refactor:`, and `test:`.
- Use lowercase branch prefixes such as `feature/`, `bugfix/`, `hotfix/`, or
  `release/`.
- Keep commits focused and reviewable.
- Pull requests should summarize scope, impacted paths, executed checks, and any
  config or contract changes.

## GitHub and Release Discipline

- Use GitHub Issues as the source of truth for planned work whenever the change
  is larger than a trivial fix.
- Link implementation work back to its issue using references such as
  `Refs #123`, `Closes #123`, or `Fixes #123` in commits or pull requests.
- Prefer pull requests that map cleanly to a single issue or a tightly related
  set of acceptance criteria.
- Keep `CHANGELOG.md` in sync with notable product-facing or operational changes
  when the release process or documentation requires a human-readable summary.
- This repository uses `semantic-release` on `main` and tags releases as
  `vX.Y.Z`.
- Desired semver discipline is:
  - `fix` for patch-level changes
  - `feat` for minor-level changes
  - `BREAKING CHANGE:` or `type!:` for major-level changes
- Current release automation is defined in `.releaserc.json` and
  `.github/workflows/release.yaml`. If release semantics, release notes, or
  changelog generation changes, update those files together with `README.md`.
