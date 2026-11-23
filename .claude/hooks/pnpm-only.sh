#!/usr/bin/env bash
# PreToolUse(Bash): enforce pnpm. Exit 2 blocks the call and feeds stderr back to Claude.
cmd=$(jq -r '.tool_input.command // empty')
if printf '%s' "$cmd" | grep -qE '(^|[;&|[:space:]])(npm[[:space:]]+(install|i|ci|add)|yarn([[:space:]]+(add|install)|[[:space:]]*$)|bun[[:space:]]+(install|add|i))([[:space:]]|$)'; then
  echo 'Use pnpm (Corepack, see .nvmrc / AGENTS.md), not npm/yarn/bun.' >&2
  exit 2
fi
exit 0
