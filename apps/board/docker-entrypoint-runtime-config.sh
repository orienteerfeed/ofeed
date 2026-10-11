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

cat > /usr/share/nginx/html/runtime-config.js <<EOF
window.__OFEED_BOARD_RUNTIME_CONFIG__ = Object.freeze({
  VITE_OFEED_API_URL: "$(escape_json "${OFEED_BOARD_API_URL:-/api/ofeed}")",
  VITE_OFEED_GQL_WS_URL: "$(escape_json "${OFEED_BOARD_GQL_WS_URL:-}")",
  VITE_PROVIDERS: "$(escape_json "${OFEED_BOARD_PROVIDERS:-ofeed,liveResultat}")"
});
EOF
