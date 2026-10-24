# Agent entry point

This file applies to the whole monorepo. Start here, then read
[docs/README.md](docs/README.md) and only the pages relevant to the task. More
specific instructions override these rules inside their directories:
[client](apps/client/AGENTS.md), [server](apps/server/AGENTS.md),
[board](apps/board/AGENTS.md), [shared](packages/shared/AGENTS.md) and
[GitHub workflows](.github/AGENTS.md).

## Workflow

1. Read the [glossary](docs/product/glossary.md), affected
   [spec](docs/specs/README.md) and applicable workspace instructions.
2. Before changing architecture, read
   [docs/architecture/adr/](docs/architecture/adr/README.md) and record a new
   decision as an ADR. Do not reopen accepted decisions without new context and
   a superseding record.
3. Write or update a feature spec before implementation and include it with the
   code change: goal, acceptance criteria, edge cases, API and test plan.
4. Use GitHub Issues as the source of truth for non-trivial planned work; link
   the issue in the spec and PR. Do not invent issue numbers.
5. For longer tasks keep `docs/plans/yyyy-mm-dd-task.md` with steps, status,
   open questions, checks and the next action. Remove or archive completed
   plans.
6. Preserve unrelated working-tree changes. Report what changed, validation and
   any required checks that could not run.

## Stack and layout

- `apps/client`: Vite + React, TypeScript, TanStack Router/Query, localized UI.
- `apps/server`: Hono, GraphQL Yoga + Pothos, Prisma 7 with MariaDB adapter.
- `apps/board`: separate Vite + Vue 3 event board.
- `packages/shared`: reusable Zod contracts and TypeScript types
  (`@repo/shared`).
- `deploy/`: Helm/deployment assets; `docs/`: product, architecture and
  operations.
- Workspace tooling: pnpm + Turborepo, TypeScript + ESM.

See [architecture](docs/architecture/overview.md),
[data model](docs/architecture/data-model.md) and
[API sources](docs/api/README.md).

## Environment and commands

Run from the repository root. Use Node.js **24.15.0** from `.nvmrc` and pnpm
**11.4.0** via Corepack (minimum `>=11.0.0`). Full instructions:
[setup](docs/dev/setup.md).

| Purpose                        | Command                                            |
| ------------------------------ | -------------------------------------------------- |
| Bootstrap                      | `pnpm setup:dev`                                   |
| Local database                 | `docker compose -f compose.mysql.yaml up -d mysql` |
| Client + API development       | `pnpm dev` (`pnpm dev:win` on Windows)             |
| Board development              | `pnpm dev:board` (`pnpm dev:board:win` on Windows) |
| Build / lint / types           | `pnpm build` / `pnpm lint` / `pnpm type-check`     |
| GraphQL types                  | `pnpm type-check:graphql`                          |
| Formatting                     | `pnpm format:check` (check), `pnpm format` (write) |
| Workspace tests                | `pnpm test` / `pnpm test:watch`                    |
| Client / server tests          | `pnpm test:client` / `pnpm test:server`            |
| Prisma generation / migrations | `pnpm db:generate` / `pnpm db:migrate`             |
| Rebuild shared contracts       | `pnpm --filter @repo/shared build`                 |

Prefer `pnpm --filter ./apps/client ...` or `pnpm --filter ./apps/server ...`
for focused checks; use workspace `:win` variants when POSIX env assignments are
unsupported. `pnpm dev` intentionally excludes the board.

Runtime env files are app-local: `apps/client/.env`, `apps/server/.env`,
`apps/board/.env`. Never introduce a root runtime `.env`; Compose may use a root
`.env` only for interpolation. Turbo uses strict env handling: new
task-affecting variables also need `turbo.json` and relevant `.env.example`
updates. Only browser-safe `VITE_*` values may reach browser code; container
configuration must also remain public-safe. Never commit secrets.

## Code and API agreements

- Keep changes targeted; preserve local import style and aliases. Use typed
  code; avoid `any` unless justified. Follow root and workspace formatting
  settings.
- Use existing i18n resources for user-facing frontend text.
- Prefer GraphQL for first-party app communication and REST for external/public
  integrations. Preserve existing REST response helpers and envelopes.
- Zod is the validation source of truth. Reuse `packages/shared` schemas when
  client/server share a payload; keep single-feature schemas close to the
  feature.
- Keep REST, GraphQL and form constraints aligned. Services own business rules;
  handlers/resolvers are transport adapters.
- Do not hand-edit generated artifacts: `apps/client/src/routeTree.gen.ts` and
  `apps/server/src/generated/**`. Schema changes require generation/migrations.
- New documentation filenames use lowercase kebab-case; preserve special root
  filenames and existing published paths. Use `.yaml`, not `.yml`. Add
  `.gitkeep` to otherwise empty directories.

Details: [conventions](docs/dev/conventions.md),
[GraphQL boundaries](docs/GRAPHQL_ARCHITECTURE.md),
[security](docs/security/threat-model.md),
[data protection](docs/security/data-protection.md).

## Validation and review

- Run the narrowest meaningful checks. Backend changes need relevant server
  Vitest tests; Prisma changes also need generation/migrations as applicable.
- Frontend changes usually need relevant Vitest checks; route/form flows need
  browser checks when practical. Add meaningful regressions for new behavior.
- Shared changes require rebuilding shared contracts and checking consumers.
- Follow [testing strategy](docs/dev/testing.md); report any unrun required
  check.
- Update README/docs for behavior, public API, infrastructure or configuration
  changes. Keep notable changes in `CHANGELOG.md` using Keep a Changelog format.
- Use Conventional Commits and lowercase `feature/`, `bugfix/`, `hotfix/` or
  `release/` branches. Reference issues with `Refs`, `Closes` or `Fixes`.
- Keep PRs focused and include scope, checks and contract/config changes.
- Preserve contributor-facing [CLA.md](CLA.md) links; follow
  [CONTRIBUTING.md](CONTRIBUTING.md).
- Releases on `main` use semantic-release and `vX.Y.Z` tags, with explicit
  release intent. `fix` means patch, `feat` minor, and `BREAKING CHANGE:` /
  `type!:` major intent; the workflow requires a release label/trailer/manual
  request. See [release guidance](CONTRIBUTING.md#release-requests). Changes to
  release semantics must update `.releaserc.json`,
  `.github/workflows/release.yaml` and README.
- Respect tool-specific permission settings, including `.claude/settings.json`.
  These docs do not authorize git mutation, deployment or external publication.

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
