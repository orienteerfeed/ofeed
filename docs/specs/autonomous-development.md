# Autonomous development permissions

Status: implemented. Issue: not assigned (direct repository configuration request).

## Goal

Allow agents to complete ordinary development in feature branches and worktrees,
including commits, feature pushes and pull request creation, without repeated
approvals. Preserve unrelated changes and protected branches.

## Acceptance criteria

- Codex permits Git inspection, staging, commits, fetch, fast-forward pull,
  branch creation/switching, reversible stashes and worktree creation.
- GitHub inspection and PR creation/editing are allowed. Merging a PR and
  destructive local operations require approval.
- Network access is enabled inside the workspace-write sandbox; approval mode
  remains on-request. Managed restrictions still take precedence.
- Agents use explicit feature-branch push refspecs, never push main/develop,
  force-push, delete remote branches, bypass protection, deploy or release.
- Policy checks exercise allowed, prompted and forbidden commands without
  executing Git mutations or contacting GitHub.

## Edge cases and boundaries

Prefix rules inspect command prefixes, not Git's current branch or every
possible argument ordering. They are workflow guardrails, not a complete Git
authorization boundary. GitHub branch protection/rulesets must enforce remote
branch protection. Global forbidden rules and managed policy cannot be relaxed
by project allow rules. Trusted projects load project-local rules; start a new
session after configuration changes.

Worktrees share Git metadata and the local database. Never discard another
task's work or remove a dirty worktree. Claude copies app env files using
`.worktreeinclude`; Codex worktrees need local environment setup separately.

## API and data changes

None. No application runtime or database changes.

## Test plan

Run `bash .codex/bin/check-rules.sh`, shell syntax checks and `git diff --check`.
No push, PR creation, merge or worktree mutation is needed for validation.
