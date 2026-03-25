# GitHub Guidelines

## Scope

This file applies to `.github` and all GitHub-facing automation and templates in
this repository.

## Ownership Areas

- `ISSUE_TEMPLATE/*`: issue intake quality and triage structure.
- `workflows/*`: CI, release, notifications, and publishing automation.
- `.releaserc.json`: semantic-release behavior.
- `dependabot.yaml`: dependency update policy.

## Issues and Planning

- Prefer opening or updating a GitHub Issue before implementing non-trivial
  work.
- Issues should describe the problem, expected outcome, scope boundaries, and
  acceptance criteria.
- When useful, capture rollout notes, migration notes, and affected apps in the
  issue body.
- Keep issue labels, milestones, and project status aligned with the actual
  delivery state.
- PRs should link back to their issue and clearly state whether they close it or
  are only a partial delivery.

## Conventional Commits and SemVer

- Commit messages should follow Conventional Commits.
- Semver intent should be expressed through commit type:
  - `fix:` for patch changes
  - `feat:` for minor changes
  - `type!:` or `BREAKING CHANGE:` for major changes
- Avoid vague commit subjects such as `update stuff` or `misc fixes`.
- If a change should not produce release intent, prefer `chore:`, `docs:`,
  `test:`, or `refactor:` when that is accurate.

## Changelog Policy

- `CHANGELOG.md` follows Keep a Changelog structure and should remain readable
  for humans.
- Add or update changelog entries for user-visible changes, API changes,
  deployment-impacting changes, or release-process changes when they are not
  already covered by automation.
- Do not silently remove historical entries.
- If a workflow changes how releases or notes are generated, update
  `CHANGELOG.md`, `README.md`, and the release configuration together.

## Workflow Rules

- Keep workflow names, triggers, permissions, and concurrency explicit.
- Use the minimum required GitHub permissions for each workflow.
- Document any new required secret in `README.md` or `docs/`.
- Avoid adding automation that mutates the repo on every branch unless that
  behavior is intentional and reviewed.
- For release automation, verify interactions between:
  - `.github/workflows/release.yaml`
  - `.github/workflows/publish-images-ghcr.yaml`
  - `.releaserc.json`
  - `CHANGELOG.md`

## Current Repository Release Behavior

- Releases run from pushes to `main`.
- Tags use the `vX.Y.Z` format.
- A follow-up PR syncs the root `package.json` version to the latest release
  tag.
- The current `.releaserc.json` forces a patch release on `main`. If you want
  commit-type-driven semver, change the release config deliberately and update
  the surrounding docs in the same change.
