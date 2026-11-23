# Autonomous development

Codex project configuration enables network access with `workspace-write` and
`on-request` approvals. Trusted projects load `.codex/rules/*.rules`; restart the
session after changing them. Managed policy and global forbidden rules can
still prevent commands. This does not change Daxkit or global configuration.

Ordinary inspection, staging, commits, fetch, branch creation/switching, stash
save/apply/pop, worktree creation and feature pushes are allowed. GitHub PR
creation/editing and inspection are allowed. PR merging, destructive local
changes and generic `gh api` calls require approval. Repository administration
and release publishing remain forbidden. Existing Claude permissions are
unchanged; the two tools have independent permission systems.

Before changing files inspect status and preserve unrelated work. Stage only
the task's files and run relevant checks before committing. Push only an
approved feature/bugfix/hotfix/release branch with an explicit destination, for
example `git push --set-upstream origin HEAD:refs/heads/feature/my-task`.
Do not push main/develop, force-push or delete remote branches.

## Worktrees

For an isolated task use
`git worktree add .claude/worktrees/my-task -b feature/my-task HEAD`, then run
`pnpm install` in the new worktree. Start the agent from that directory. Claude
copies app-local env files through `.worktreeinclude`; configure the local
environment separately for Codex without printing or committing credentials.
All worktrees share the local MySQL container; coordinate schema migrations.
Remove a worktree only after checking for uncommitted/untracked files and
preserving its work. Removal requires Codex approval.

## Validation and limits

Run `bash .codex/bin/check-rules.sh` to evaluate policy decisions without
executing the example commands. GitLab rules retain their previous policy.

Prefix rules check tokens at the start of a command. They cannot inspect the
current branch or cover every ordering of Git options/refspecs. Common dangerous
push forms are blocked, but protection of main/develop and release tags must
also be enforced with GitHub branch protection/rulesets. These project files
are editable workflow configuration, not a security boundary against hostile
commands. No remote settings are changed by this configuration update.

Sources: [Codex execution policy](https://github.com/openai/codex/blob/main/codex-rs/execpolicy/README.md),
[Codex configuration](https://developers.openai.com/codex/config-reference/).
