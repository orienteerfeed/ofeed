# Repository Guidelines

## Start Here

This is the canonical entry point for all coding agents working in this
repository. `CLAUDE.md` files import the corresponding `AGENTS.md` instead of
maintaining a second set of rules.

1. Read this file, then the scoped guidelines for every directory you will
   change (linked below).
2. Use [README.md](./README.md) for the project overview and local setup,
   [CONTRIBUTING.md](./CONTRIBUTING.md) for branching, commits, and review, and
   [CHANGELOG.md](./CHANGELOG.md) for the human-readable change history.
3. Consult the [documentation index](./docs/README.md) for architecture,
   configuration, deployment, and feature references relevant to the task.
4. Inspect the working tree before editing, preserve unrelated changes, and run
   the narrowest meaningful checks before handing off the result. Report the
   changes, checks run, and any remaining limitations.

## Scope

This file applies to the whole monorepo. Read the following additional rules
when working in their scope; more specific instructions take precedence:

- [Client guidelines](./apps/client/AGENTS.md)
- [Server guidelines](./apps/server/AGENTS.md)
- [Board guidelines](./apps/board/AGENTS.md)
- [Shared package guidelines](./packages/shared/AGENTS.md)
- [GitHub automation and template guidelines](./.github/AGENTS.md)

## Repository Overview

This repository is a `pnpm` workspace orchestrated by Turborepo.

- `apps/client`: Vite + React frontend.
- `apps/server`: Hono + GraphQL Yoga + Pothos + Prisma (MariaDB) backend.
- `apps/board`: Vite + Vue 3 event board with Pinia and UnoCSS.
- `packages/shared`: shared TypeScript/Zod contracts consumed via
  `@repo/shared`.
- `docs/`: project, deployment, and environment references.
- `deploy/`: Helm and deployment assets.

Do not hand-edit generated artifacts unless the task explicitly requires it.
Important generated paths:

- `apps/client/src/routeTree.gen.ts`
- `apps/server/src/generated/**`

## Environment

- Use Node.js `24.15.0` from the root `.nvmrc`.
- Use `pnpm` `11.4.0` via Corepack. The minimum required version is `>=11.0.0`.
- Runtime env files are app-local only:
  - `apps/client/.env`
  - `apps/server/.env`
  - `apps/board/.env`
- Do not introduce a root runtime `.env` for application behavior. A root `.env`
  is optional for Docker Compose / Traefik interpolation only.
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
  code at build time. Container startup also exposes documented public `OFEED_*`
  settings; see [frontend configuration](./docs/FRONTEND_CONFIGURATION.md).

## Build, Test, and Development Commands

Run from the repository root unless noted otherwise.

- `pnpm install`: install all workspace dependencies.
- `pnpm setup:dev`: bootstrap local development.
- `pnpm dev`: run the client and server in parallel; the board is excluded.
- `pnpm dev:win`: Windows-friendly variant of `pnpm dev`.
- `pnpm dev:board` / `pnpm dev:board:win`: run the optional board separately.
- `pnpm build`: build all workspaces.
- `pnpm lint`: lint all workspaces.
- `pnpm format`: format the repo with Prettier.
- `pnpm format:check`: verify formatting.
- `pnpm type-check`: run TypeScript checks across workspaces.
- `pnpm type-check:graphql`: run the server GraphQL/Pothos type-check profile.
- `pnpm --filter @repo/shared build`: rebuild shared contracts after changing
  `packages/shared`.
- `pnpm test`: run workspace tests.
- `pnpm test:watch`: run watch-mode tests in parallel.
- `pnpm test:client`: run client tests only.
- `pnpm test:server`: run server tests only.
- `pnpm --filter ./apps/board test:unit`: run board unit tests; the board has no
  `test` script and is not covered by root `pnpm test`.
- `pnpm db:generate`: run Prisma generate through Turbo.
- `pnpm db:migrate`: run Prisma migrations through Turbo.
- `docker compose -f compose.mysql.yaml up -d mysql`: start local MariaDB/MySQL
  for backend work.

Prefer `pnpm --filter ./apps/client ...` or `pnpm --filter ./apps/server ...`
when validating a single workspace. Use the `:win` script variants on Windows
shells that do not support POSIX-style environment assignments such as
`NODE_ENV=development`.

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
- Record notable product-facing or operational changes under `[Unreleased]` in
  [CHANGELOG.md](./CHANGELOG.md), using Keep a Changelog categories. Preserve
  historical entries. The file is maintained manually; release automation
  publishes separate GitHub Release notes.
- This repository uses `semantic-release` on `main` and tags releases as
  `vX.Y.Z`. Conventional Commits determine the version automatically; a
  `Release-Type:` commit trailer or manual override is an emergency fallback and
  must not downgrade the inferred level. Labels do not control versioning.
  Release/hotfix PRs require a merge commit and successful qualification of the
  exact candidate image digests, chart package, and production baseline. Follow
  the [release request process](./CONTRIBUTING.md#release-requests).
- Desired semver discipline is:
  - `fix` for patch-level changes
  - `feat` for minor-level changes
  - `BREAKING CHANGE:` or `type!:` for major-level changes
- Current release automation is defined in `.releaserc.json` and
  `.github/workflows/release.yaml`. If release semantics, release notes, or
  changelog generation changes, update those files together with `README.md`.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between
installed versions and may differ from your training data. Resolve the `turbo`
package from this file's directory or relevant workspace; in monorepos, it may
not be visible from the repository root. For example, run
`node -p "require.resolve('turbo/package.json')"` from a workspace that depends
on `turbo`.

Read `docs/README.md` inside that installed package first, then read the
relevant pages from its `docs/` directory before changing Turborepo
configuration or commands. Heed deprecation notices. These bundled docs match
the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands
when an AI agent is detected. In the Turborepo source repository, its template
is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the
managed block while updates are enabled means a later qualifying invocation will
add it again. Set `"agentGuidance": false` in the root `turbo.json` or
`turbo.jsonc` to opt out; this does not remove an existing block. Keep the block
committed with your work to avoid an uncommitted change on the next agent
invocation.
<!-- END:turborepo-agent-rules -->
