#!/usr/bin/env bash
# PostToolUse(Edit|Write|MultiEdit): format, lint-fix and validate the edited file.
# Exit 2 reports remaining problems to Claude (the edit itself is kept).
f=$(jq -r '.tool_input.file_path // empty')
[ -n "$f" ] && [ -f "$f" ] || exit 0
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$root" || exit 0

case "$f" in
  */routeTree.gen.ts | */src/generated/*) exit 0 ;; # generated, do not touch
esac

case "$f" in
  *.ts | *.tsx | *.js | *.jsx | *.mjs | *.cjs | *.vue | *.json | *.md | *.css | *.yaml)
    pnpm exec prettier --write --ignore-unknown --log-level warn "$f" >/dev/null 2>&1
    ;;
esac

case "$f" in
  *.ts | *.tsx | *.vue)
    # ESLint 9 resolves flat config from cwd: run from the nearest dir with eslint.config.js.
    dir=$(dirname "$f")
    while [ "$dir" != "/" ] && [ ! -f "$dir/eslint.config.js" ]; do dir=$(dirname "$dir"); done
    [ -f "$dir/eslint.config.js" ] || exit 0
    if ! out=$(cd "$dir" && pnpm exec eslint --fix --no-warn-ignored "$f" 2>&1); then
      printf 'ESLint problems in %s:\n%s\n' "$f" "$(printf '%s' "$out" | tail -25)" >&2
      exit 2
    fi
    ;;
  */schema.prisma)
    if ! out=$(pnpm --filter ./apps/server exec prisma format 2>&1 && pnpm --filter ./apps/server exec prisma validate 2>&1); then
      printf 'Prisma schema invalid:\n%s\n' "$(printf '%s' "$out" | tail -25)" >&2
      exit 2
    fi
    ;;
esac
exit 0
