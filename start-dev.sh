#!/bin/bash

set -euo pipefail

# Simple dev runner: start backend and frontend together.
cd "$(dirname "$0")"

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux not found, run these commands in two terminals:"
  echo "👉 Open two terminals:"
  echo "Terminal 1: pnpm --filter ./apps/server dev"
  echo "Terminal 2: pnpm --filter ./apps/client dev"
  exit 0
fi

SESSION_NAME="dev"

if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  tmux attach -t "$SESSION_NAME"
  exit 0
fi

tmux new-session -d -s "$SESSION_NAME" 'pnpm --filter ./apps/server dev'
tmux split-window -v 'pnpm --filter ./apps/client dev'
tmux select-layout even-vertical
tmux attach -t "$SESSION_NAME"
