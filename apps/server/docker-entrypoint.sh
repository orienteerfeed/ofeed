#!/bin/sh
set -eu

VAULT_ENV_FILE="${VAULT_ENV_FILE:-/vault/secrets/api-env}"

if [ -f "$VAULT_ENV_FILE" ]; then
  # shellcheck source=/dev/null
  . "$VAULT_ENV_FILE"
fi

exec "$@"
