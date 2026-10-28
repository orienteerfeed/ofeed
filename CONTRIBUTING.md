# Contributing

When contributing to this repository, please first discuss the change you wish
to make via issue, email, or any other method with the owners of this repository
before making a change.

Please note we have a code of conduct, please follow it in all your interactions
with the project. See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## Contributor License Agreement (CLA)

This repository is published under `GPL-3.0`.

By submitting a contribution to this repository, you agree that your
contribution may be used in commercial products, SaaS services, and relicensed
by the project owner under the terms of [CLA.md](./CLA.md).

If you do not agree to those terms, do not submit a contribution.

## Pull Request Process

1. Create a branch using lowercase branch prefix naming.
2. Make sure you are able to contribute under [CLA.md](./CLA.md).
3. Commit changes using Conventional Commits.
4. Push your branch and open a Pull Request.
5. Update README.md and docs when behavior, API, or configuration changes.
6. You may merge a Pull Request after required review approval.

## Specs, decisions and documentation

Use [docs/README.md](docs/README.md) as the documentation map. For non-trivial
work, link the GitHub Issue in the pull request and relevant spec.

- Write or update a [feature spec](docs/specs/README.md) before implementation:
  goal, acceptance criteria, edge cases, API changes and test plan. Include the
  spec with the code change.
- Before architecture changes, read
  [accepted ADRs](docs/architecture/adr/README.md) and record the new decision
  using the MADR-lite template. Explain replacements with a superseding ADR
  rather than silently changing an accepted decision.
- Run checks from the [testing guide](docs/dev/testing.md) and report
  limitations.
- Update code-owned [API contracts](docs/api/README.md) and affected docs
  together.
- Keep notable changes under `Unreleased` in [CHANGELOG.md](CHANGELOG.md), using
  Keep a Changelog categories. Release notes do not replace this local summary.
- New documentation filenames use lowercase kebab-case; use `.gitkeep` for empty
  directories. Agent plans in `docs/plans/` are temporary: remove or archive
  them after completion, retaining durable decisions in specs and ADRs.

## Git Conventions

### Branch prefixes

| Prefix     | Usage                                                   |
| ---------- | ------------------------------------------------------- |
| `bugfix/`  | Used for work fixing product bugs                       |
| `feature/` | Used for work on new features                           |
| `hotfix/`  | Used for fixing urgent production bugs with high impact |
| `release/` | Used for preparing and testing work for release         |

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

Releases are created only when explicitly requested.

- For pull requests, add one label: `release:patch`, `release:minor`, or
  `release:major`.
- For direct pushes to `main`, you do not need a label. Use a commit trailer
  instead:

```bash
git commit -m "fix(auth): handle invalid refresh token" -m "Release-Type: patch"
git push origin main
```

## Code of Conduct

This project follows [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

Please read it before contributing and follow it in all project spaces and
interactions. For reporting or enforcement details, refer to the contact and
process described in that document.
