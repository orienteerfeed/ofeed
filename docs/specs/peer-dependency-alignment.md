# Peer dependency alignment

Status: implemented. Maintenance fix; no linked issue.

## Goal and acceptance criteria

Restore a clean `pnpm peers check` by matching Vitest helpers to their runner
and meeting the client TanStack tools' runtime peer requirements.

## Scope and edge cases

Keep the existing dependency major versions and preserve unrelated dependency
updates. The missing `GITLAB_NPM_TOKEN` configuration warning is independent of
peer compatibility and does not require repository credentials or config changes.

## API and data

No API or data changes.

## Test plan

Refresh the lockfile and installed dependencies, run `pnpm peers check`, and run
the client and board unit suites to verify the updated tooling.
