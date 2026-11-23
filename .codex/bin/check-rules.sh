#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

GIT_RULES=".codex/rules/git.development.rules"
GH_RULES=".codex/rules/github.development.rules"
GL_RULES=".codex/rules/gitlab.prompt.rules"

for cmd in codex node; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
done

for file in "$GIT_RULES" "$GH_RULES" "$GL_RULES"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing required rules file: $file" >&2
    exit 1
  fi
done

decision_of() {
  codex execpolicy check \
    --rules "$GIT_RULES" \
    --rules "$GH_RULES" \
    --rules "$GL_RULES" \
    -- "$@" \
  | node -e '
      const fs = require("node:fs");
      const raw = fs.readFileSync(0, "utf8");
      const data = JSON.parse(raw);

      function findDecision(value) {
        if (Array.isArray(value)) {
          for (const item of value) {
            const found = findDecision(item);
            if (found) return found;
          }
          return null;
        }

        if (value && typeof value === "object") {
          if (typeof value.decision === "string") return value.decision;
          if (typeof value.strictest_decision === "string") return value.strictest_decision;

          for (const item of Object.values(value)) {
            const found = findDecision(item);
            if (found) return found;
          }
        }

        return null;
      }

      const decision = findDecision(data);
      if (!decision) {
        console.error("Could not find decision in codex execpolicy output.");
        process.exit(2);
      }

      process.stdout.write(decision);
    '
}

assert_decision() {
  local expected="$1"
  shift
  local label="$1"
  shift

  local actual
  actual="$(decision_of "$@")"

  if [[ "$actual" != "$expected" ]]; then
    echo "FAIL: $label" >&2
    echo "  expected: $expected" >&2
    echo "  actual:   $actual" >&2
    echo "  command:  $*" >&2
    echo >&2
    echo "Debug output:" >&2
    codex execpolicy check --pretty \
      --rules "$GIT_RULES" \
      --rules "$GH_RULES" \
      --rules "$GL_RULES" \
      -- "$@" >&2
    exit 1
  fi

  echo "PASS: $label -> $actual"
}

echo "Checking git.development.rules ..."
assert_decision allow     "git status"                 git status
assert_decision allow     "git log"                    git log --oneline -n 5
assert_decision allow     "git diff"                   git diff --stat
assert_decision allow "git commit"                 git commit -m test
assert_decision allow "git push"                   git push
assert_decision allow "git fetch"                  git fetch
assert_decision allow "git help"                   git help

echo
echo "Checking github.development.rules ..."
assert_decision allow    "gh issue list"              gh issue list
assert_decision allow    "gh issue view"              gh issue view 123
assert_decision allow    "gh issue status"            gh issue status
assert_decision allow    "gh pr list"                 gh pr list
assert_decision allow    "gh pr view"                 gh pr view 123
assert_decision allow    "gh pr status"               gh pr status
assert_decision allow    "gh pr checks"               gh pr checks 123
assert_decision allow    "gh project list"            gh project list --owner acme
assert_decision allow    "gh project view"            gh project view 7 --owner acme
assert_decision allow     "gh project item-list"       gh project item-list 7 --owner acme
assert_decision allow    "gh workflow list"           gh workflow list
assert_decision allow    "gh workflow view"           gh workflow view ci.yml
assert_decision allow    "gh run list"                gh run list
assert_decision allow    "gh run view"                gh run view 123
assert_decision allow    "gh repo view"               gh repo view
assert_decision allow    "gh repo list"               gh repo list openai
assert_decision allow    "gh status"                  gh status

assert_decision allow "gh issue create"            gh issue create
assert_decision allow "gh issue edit"              gh issue edit 123
assert_decision prompt "gh issue close"             gh issue close 123
assert_decision allow "gh pr create"               gh pr create
assert_decision prompt "gh pr merge"                gh pr merge 123
assert_decision prompt "gh pr review"               gh pr review 123 --approve
assert_decision allow "gh pr checkout"             gh pr checkout 123
assert_decision prompt "gh workflow run"            gh workflow run ci.yml
assert_decision prompt "gh workflow enable"         gh workflow enable ci.yml
assert_decision prompt "gh workflow disable"        gh workflow disable ci.yml
assert_decision prompt "gh project item-edit"       gh project item-edit --id PVT_xxx --project-id PVT_yyy
assert_decision prompt "gh project item-archive"    gh project item-archive 7 --id PVT_xxx --owner acme
assert_decision forbidden "gh repo create"             gh repo create acme/test --private
assert_decision forbidden "gh repo delete"             gh repo delete acme/test --yes
assert_decision forbidden "gh repo edit"               gh repo edit acme/test --description "x"
assert_decision forbidden "gh repo fork"               gh repo fork
assert_decision forbidden "gh repo clone"              gh repo clone acme/test
assert_decision forbidden "gh repo rename"             gh repo rename renamed-test
assert_decision forbidden "gh repo sync"               gh repo sync

echo
echo "Checking gitlab.prompt.rules ..."
assert_decision prompt    "glab issue list"            glab issue list
assert_decision prompt    "glab issue view"            glab issue view 123
assert_decision prompt    "glab issue board"           glab issue board
assert_decision prompt    "glab mr list"               glab mr list
assert_decision prompt    "glab mr view"               glab mr view 123
assert_decision prompt    "glab mr diff"               glab mr diff 123
assert_decision prompt    "glab pipeline list"         glab pipeline list
assert_decision prompt    "glab pipeline view"         glab pipeline view 123
assert_decision prompt    "glab pipeline status"       glab pipeline status
assert_decision prompt    "glab ci status"             glab ci status
assert_decision prompt    "glab ci view"               glab ci view
assert_decision prompt    "glab repo view"             glab repo view
assert_decision prompt    "glab repo list"             glab repo list
assert_decision prompt    "glab release list"          glab release list
assert_decision prompt    "glab release view"          glab release view v1.0.0
assert_decision prompt    "glab auth status"           glab auth status

assert_decision forbidden "glab issue create"          glab issue create
assert_decision forbidden "glab issue update"          glab issue update 123
assert_decision forbidden "glab issue close"           glab issue close 123
assert_decision forbidden "glab mr create"             glab mr create
assert_decision forbidden "glab mr merge"              glab mr merge 123
assert_decision forbidden "glab mr approve"            glab mr approve 123
assert_decision forbidden "glab mr checkout"           glab mr checkout 123
assert_decision forbidden "glab pipeline run"          glab pipeline run
assert_decision forbidden "glab pipeline retry"        glab pipeline retry 123
assert_decision forbidden "glab pipeline cancel"       glab pipeline cancel 123
assert_decision forbidden "glab ci run"                glab ci run
assert_decision forbidden "glab ci retry"              glab ci retry 123
assert_decision forbidden "glab ci cancel"             glab ci cancel 123
assert_decision forbidden "glab repo create"           glab repo create acme/test --private
assert_decision forbidden "glab repo delete"           glab repo delete acme/test
assert_decision forbidden "glab repo fork"             glab repo fork
assert_decision forbidden "glab repo clone"            glab repo clone acme/test
assert_decision forbidden "glab release create"        glab release create v1.0.0
assert_decision forbidden "glab release delete"        glab release delete v1.0.0

echo

assert_decision allow "worktree creation" git worktree add .claude/worktrees/demo -b feature/demo HEAD
assert_decision allow "stash save" git stash push -u -m task
assert_decision allow "stash apply" git stash apply
assert_decision allow "fast-forward pull" git pull --ff-only
assert_decision allow "feature push" git push --set-upstream origin HEAD:refs/heads/feature/demo
assert_decision prompt "stash deletion" git stash clear
assert_decision prompt "worktree removal" git worktree remove .claude/worktrees/demo
assert_decision prompt "hard reset" git reset --hard HEAD
assert_decision prompt "discard files" git restore .
assert_decision prompt "force switch" git switch --discard-changes feature/demo
assert_decision prompt "force delete branch" git branch -D feature/demo
assert_decision forbidden "force push" git push origin --force
assert_decision forbidden "protected main" git push origin main
assert_decision forbidden "protected develop refspec" git push --set-upstream origin HEAD:refs/heads/develop
assert_decision prompt "generic GitHub API" gh api repos/acme/api
assert_decision forbidden "release publishing" gh release create v1.0.0

echo "All rules passed."
