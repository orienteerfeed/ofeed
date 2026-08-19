#!/bin/sh
set -eu

escape_json() {
  value="$1"
  case "$value" in
    *"\n"*|*"\r"*)
      echo "Runtime configuration values must not contain line breaks." >&2
      exit 1
      ;;
  esac
  printf '%s' "$value" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

api_url="${OFEED_PUBLIC_API_URL:-}"
public_url="${OFEED_PUBLIC_URL:-}"
board_url="${OFEED_BOARD_APP_URL:-}"

cat > /usr/share/nginx/html/runtime-config.js <<EOF
window.__OFEED_RUNTIME_CONFIG__ = Object.freeze({
  VITE_BASE_API_URL: "$(escape_json "$api_url")",
  VITE_PUBLIC_URL: "$(escape_json "$public_url")",
  VITE_DEFAULT_LANGUAGE: "$(escape_json "${OFEED_DEFAULT_LANGUAGE:-en}")",
  VITE_DOCS_URL: "$(escape_json "${OFEED_DOCS_URL:-https://docs.orienteerfeed.com}")",
  VITE_BOARD_APP_URL: "$(escape_json "$board_url")",
  VITE_DISCORD_INVITE_URL: "$(escape_json "${OFEED_DISCORD_INVITE_URL:-https://discord.gg/QMvnurgKzU}")",
  VITE_GITHUB_REPO_URL: "$(escape_json "${OFEED_GITHUB_REPO_URL:-https://github.com/orienteerfeed/orienteerfeed}")",
  VITE_ENABLE_MAP_VIEW: "$(escape_json "${OFEED_ENABLE_MAP_VIEW:-true}")",
  VITE_DEBUG_LOGGING: "$(escape_json "${OFEED_DEBUG_LOGGING:-false}")"
});
EOF
