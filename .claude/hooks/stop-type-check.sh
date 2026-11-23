#!/usr/bin/env bash
# Stop: definition of done. If TS/Vue sources changed, run `pnpm type-check` (Turbo-cached)
# and block the stop on failure so Claude keeps fixing. One retry max (stop_hook_active guard).
input=$(cat)
case "$input" in
  *'"stop_hook_active":true'* | *'"stop_hook_active": true'*) exit 0 ;;
esac
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

changed=$( {
  git diff --name-only HEAD 2>/dev/null
  git ls-files --others --exclude-standard 2>/dev/null
} | grep -E '\.(ts|tsx|vue)$' | head -1)
[ -n "$changed" ] || exit 0

out=$(pnpm type-check 2>&1) && exit 0
printf '%s' "$out" | tail -40 | jq -Rs '{decision: "block", reason: ("pnpm type-check failed, fix before finishing:\n" + .)}'
exit 0
