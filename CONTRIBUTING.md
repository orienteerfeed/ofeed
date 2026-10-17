# Contributing

When contributing to this repository, please first discuss the change you wish
to make via issue, email, or any other method with the owners of this repository
before making a change.

For non-trivial work, use a GitHub Issue to record the problem, scope, and
acceptance criteria, and link the implementation PR with `Refs #123`,
`Closes #123`, or `Fixes #123` as appropriate.

Start with [README.md](./README.md#quick-start-local-development) for setup and
the [documentation index](./docs/README.md) for technical references. Coding
agents must read [AGENTS.md](./AGENTS.md) and the applicable scoped guidelines.

Please note we have a code of conduct, please follow it in all your interactions
with the project. See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## Contributor License Agreement (CLA)

This repository is published under `GPL-3.0`.

By submitting a contribution to this repository, you agree that your
contribution may be used in commercial products, SaaS services, and relicensed
by the project owner under the terms of [CLA.md](./CLA.md).

If you do not agree to those terms, do not submit a contribution.

## Pull Request Process

1. Create a branch from the latest `main` using a lowercase prefix listed below.
2. Make sure you are able to contribute under [CLA.md](./CLA.md).
3. Commit changes using Conventional Commits.
4. Push your branch and open a Pull Request.
5. Describe the problem, resulting behavior, affected workspaces, and related
   issue. Include checks run, config or contract changes, and migration notes
   when relevant. Include screenshots for visible UI changes.
6. Update README.md and docs when behavior, API, or configuration changes. Add
   notable changes to `CHANGELOG.md` under `[Unreleased]`.
7. Request review and address feedback. Merge only after required CI checks pass
   and required review approvals are in place. Re-request review after material
   changes to an already reviewed PR. Normal contributions must use a PR rather
   than a direct push to `main`.

## Validation Before Review

Run the narrowest meaningful checks for the changed workspace and report the
results in the PR. The current [CI workflow](./.github/workflows/ci.yaml) runs
Prisma generation, lint, TypeScript checks (including the GraphQL profile),
tests, and builds.

- Client: relevant unit/component tests, lint, and type checks; use Playwright
  for affected route or form flows when practical.
- Server: relevant tests, lint, and type checks; regenerate Prisma/Pothos types
  for schema changes and run the GraphQL type-check profile for GraphQL changes.
- Board: run `pnpm --filter ./apps/board test:unit`, lint, and type checks; root
  `pnpm test` does not run board unit tests.
- Shared contracts: rebuild `@repo/shared` and verify both client and server.
- Documentation only: verify relative links, documented commands against
  `package.json`, and Markdown formatting. Application tests are not needed
  unless executable behavior also changes.

See [AGENTS.md](./AGENTS.md#build-test-and-development-commands) and the scoped
guides for exact commands. If a check cannot run, explain why and describe any
remaining risk rather than reporting it as passed.

## Git Conventions

### Branch prefixes

| Prefix     | Usage                                                   |
| ---------- | ------------------------------------------------------- |
| `bugfix/`  | Used for work fixing product bugs                       |
| `feature/` | Used for work on new features                           |
| `hotfix/`  | Used for fixing urgent production bugs with high impact |
| `release/` | Used for preparing and testing work for release         |
| `chore/`   | Used for maintenance, dependency, and tooling updates   |

### Conventional Commit Prefixes

| Prefix      | Description                                                         |
| ----------- | ------------------------------------------------------------------- |
| `feat:`     | New feature or enhancement                                          |
| `fix:`      | Bug fix                                                             |
| `chore:`    | Project maintenance (for example dependency updates, build scripts) |
| `docs:`     | Documentation changes                                               |
| `style:`    | Code style changes (formatting, spacing) without behavior changes   |
| `refactor:` | Code refactoring without behavior changes                           |
| `test:`     | Adding or updating tests                                            |
| `perf:`     | Performance optimization                                            |
| `ci:`       | CI/CD configuration changes                                         |

Reference: [conventionalcommits.org](https://www.conventionalcommits.org/)

Use `<type>(<optional scope>): <description>`, for example
`fix(auth): handle invalid refresh token`. Mark breaking changes with `!` after
the type/scope or a `BREAKING CHANGE:` footer, and describe the migration.
Commit types communicate intent (`fix` for patch, `feat` for minor, breaking
changes for major). Semantic-release uses those commits automatically when a
qualified release reaches main, as described below.

### Examples

```bash
git checkout -b feature/competitor-status-sync

git commit -m "feat(events): add competitor status sync"
git commit -m "feat(events): add competitor status sync" -m "Refs #45"
git commit -m "feat(events): add competitor status sync" -m "Closes #45"

git checkout -b bugfix/oauth-invalid-token
git commit -m "fix(auth): handle invalid refresh token"

git checkout -b chore/deps-update
git commit -m "chore(server): update aws sdk dependencies"
```

## Release Requests

Merge features into `develop`; its successful candidate build updates dev GitOps
automatically. Prepare `release/*` or `hotfix/*` and open a PR to `main`. Its
exact head must have a complete GHCR candidate and pass release qualification.
Merge with a **merge commit**, not squash or rebase, to preserve Conventional
Commit history and the qualified tree. Requalify after either PR head, main, or
the managed production baseline changes.

Semantic-release calculates patch/minor/major automatically. Documentation and
chore-only changes do not release by default. Release labels and subject markers
have no effect. An emergency `Release-Type:` footer or manual workflow override
can increase the inferred level but cannot downgrade it or bypass qualification:

```bash
git commit -m "fix(auth): handle invalid refresh token" -m "Release-Type: patch"
```

Automation first promotes the existing image digests, then publishes a `vX.Y.Z`
tag and GitHub Release notes and opens a production GitOps PR. Merging that PR
approves deployment. Rollback is a Git revert; database changes must remain
backward-compatible through the rollback window. Automation does not rewrite
package versions or `CHANGELOG.md`. See the
[release workflow guide](./README.md#cicd-and-versioning-flow) for details.

## Changelog Entries

Follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Put notable
changes under `[Unreleased]`, grouped as `Added`, `Changed`, `Deprecated`,
`Removed`, `Fixed`, or `Security`. Omit empty categories, write for users and
operators, and preserve historical release entries.

When preparing a release, move the relevant entries into a section named
`## [X.Y.Z] - YYYY-MM-DD`, using the actual release date, and keep an
`[Unreleased]` section for future work. GitHub Releases contain the automated
release notes; the repository changelog is a manually curated companion.

## Code of Conduct

This project follows [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

Please read it before contributing and follow it in all project spaces and
interactions. For reporting or enforcement details, refer to the contact and
process described in that document.
