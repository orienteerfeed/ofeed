# CI action runtimes

Status: implemented. Routine CI maintenance; no linked issue.

## Goal

Remove Node.js 20 action-runtime warnings from the CI validation jobs and avoid
an implicit operating-system upgrade when `ubuntu-latest` moves to Ubuntu 26.

## Acceptance criteria

- Both validation jobs use `ubuntu-24.04`.
- Checkout, Node.js setup, pnpm setup and Helm setup use actions whose metadata
  declares `runs.using: node24`.
- Application Node.js remains selected by `.nvmrc`, pnpm by the root
  `packageManager`, and deployment validation uses Helm `v3.18.6`.
- Existing triggers, permissions, dependency caching, checks and deployment
  dependencies remain intact.

## Edge cases and API

The action runtime is independent of the Node.js version installed for app
commands. These jobs use GitHub-hosted runners compatible with Node.js 24
actions. Checkout v7's fork protections for `pull_request_target` and
`workflow_run` do not affect CI's `push`, `pull_request` and `workflow_dispatch`
triggers. No application API, data model, secrets or release behavior changes.
Other workflows are outside this maintenance change.

## Test plan

Check workflow YAML syntax and formatting; verify referenced releases declare
Node.js 24 and support existing inputs. Run the Ruby chart and database delivery
checks and the Python delivery unit tests. The next GitHub CI run must confirm
the actions execute without the reported deprecation warnings.
