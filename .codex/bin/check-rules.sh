#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

GIT_RULES=".codex/rules/git.readonly.rules"
GH_RULES=".codex/rules/github.prompt.rules"

for cmd in codex node; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
done

for file in "$GIT_RULES" "$GH_RULES"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing required rules file: $file" >&2
    exit 1
  fi
done

decision_of() {
  codex execpolicy check \
    --rules "$GIT_RULES" \
    --rules "$GH_RULES" \
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
      -- "$@" >&2
    exit 1
  fi

  echo "PASS: $label -> $actual"
}

echo "Checking git.readonly.rules ..."
assert_decision allow     "git status"                 git status
assert_decision allow     "git log"                    git log --oneline -n 5
assert_decision allow     "git diff"                   git diff --stat
assert_decision forbidden "git commit"                 git commit -m test
assert_decision forbidden "git push"                   git push
assert_decision forbidden "git fetch"                  git fetch
assert_decision forbidden "git help"                   git help

echo
echo "Checking github.prompt.rules ..."
assert_decision prompt    "gh issue list"              gh issue list
assert_decision prompt    "gh issue view"              gh issue view 123
assert_decision prompt    "gh issue status"            gh issue status
assert_decision prompt    "gh pr list"                 gh pr list
assert_decision prompt    "gh pr view"                 gh pr view 123
assert_decision prompt    "gh pr status"               gh pr status
assert_decision prompt    "gh pr checks"               gh pr checks 123
assert_decision prompt    "gh project list"            gh project list --owner acme
assert_decision prompt    "gh project view"            gh project view 7 --owner acme
assert_decision prompt    "gh project item-list"       gh project item-list 7 --owner acme
assert_decision prompt    "gh workflow list"           gh workflow list
assert_decision prompt    "gh workflow view"           gh workflow view ci.yml
assert_decision prompt    "gh run list"                gh run list
assert_decision prompt    "gh run view"                gh run view 123
assert_decision prompt    "gh repo view"               gh repo view
assert_decision prompt    "gh repo list"               gh repo list openai
assert_decision prompt    "gh status"                  gh status

assert_decision forbidden "gh issue create"            gh issue create
assert_decision forbidden "gh issue edit"              gh issue edit 123
assert_decision forbidden "gh issue close"             gh issue close 123
assert_decision forbidden "gh pr create"               gh pr create
assert_decision forbidden "gh pr merge"                gh pr merge 123
assert_decision forbidden "gh pr review"               gh pr review 123 --approve
assert_decision forbidden "gh pr checkout"             gh pr checkout 123
assert_decision forbidden "gh workflow run"            gh workflow run ci.yml
assert_decision forbidden "gh workflow enable"         gh workflow enable ci.yml
assert_decision forbidden "gh workflow disable"        gh workflow disable ci.yml
assert_decision forbidden "gh project item-edit"       gh project item-edit --id PVT_xxx --project-id PVT_yyy
assert_decision forbidden "gh project item-archive"    gh project item-archive 7 --id PVT_xxx --owner acme
assert_decision forbidden "gh repo create"             gh repo create acme/test --private
assert_decision forbidden "gh repo delete"             gh repo delete acme/test --yes
assert_decision forbidden "gh repo edit"               gh repo edit acme/test --description "x"
assert_decision forbidden "gh repo fork"               gh repo fork
assert_decision forbidden "gh repo clone"              gh repo clone acme/test
assert_decision forbidden "gh repo rename"             gh repo rename renamed-test
assert_decision forbidden "gh repo sync"               gh repo sync

echo
echo "All rules passed."
