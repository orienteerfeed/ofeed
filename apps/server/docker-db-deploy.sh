#!/bin/sh
set -eu

# The image WORKDIR is /workspace/apps/server. The normal entrypoint loads Vault first.
./node_modules/.bin/prisma migrate deploy
exec ./node_modules/.bin/tsx prisma/seed-reference-data.ts
