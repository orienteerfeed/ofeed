# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=24.15.0
ARG PNPM_VERSION=11.4.0

FROM node:${NODE_VERSION}-bookworm-slim AS base
ARG PNPM_VERSION
WORKDIR /workspace
ENV PNPM_HOME=/pnpm \
    PNPM_STORE_DIR=/pnpm/store \
    PATH=/pnpm:$PATH
RUN apt-get update \
  && apt-get install --yes --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@${PNPM_VERSION} --activate

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN --mount=type=cache,target=/pnpm/store,sharing=locked \
  pnpm install --frozen-lockfile --ignore-scripts --filter ./apps/server... --filter ./packages/shared...

FROM deps AS builder
COPY apps/server apps/server
COPY packages/shared packages/shared
WORKDIR /workspace/apps/server
RUN DATABASE_URL=mysql://user:password@localhost:3306/ofeed pnpm exec prisma generate \
  && pnpm run build

FROM base AS production-deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN --mount=type=cache,target=/pnpm/store,sharing=locked \
  pnpm install --frozen-lockfile --ignore-scripts --prod --filter ./apps/server... --filter ./packages/shared...

FROM base AS production
ENV NODE_ENV=production \
    PORT=3001 \
    VAULT_ENV_FILE=/vault/secrets/api-env
COPY package.json ./package.json
COPY --from=production-deps /workspace/node_modules ./node_modules
COPY --from=production-deps /workspace/apps/server/node_modules ./apps/server/node_modules
COPY --from=production-deps /workspace/packages/shared/node_modules ./packages/shared/node_modules
COPY apps/server/package.json ./apps/server/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /workspace/apps/server/dist ./apps/server/dist
COPY --from=builder /workspace/apps/server/src/generated ./apps/server/src/generated
COPY --from=builder /workspace/packages/shared/dist ./packages/shared/dist
COPY apps/server/docker-entrypoint.sh /usr/local/bin/ofeed-entrypoint
RUN chmod 0555 /usr/local/bin/ofeed-entrypoint \
  && chown -R node:node /workspace
WORKDIR /workspace/apps/server
USER node
EXPOSE 3001
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/ofeed-entrypoint"]
CMD ["node", "dist/index.js"]

FROM base AS ops
ENV NODE_ENV=production \
    VAULT_ENV_FILE=/vault/secrets/api-env
COPY package.json ./package.json
COPY --from=deps /workspace/node_modules ./node_modules
COPY --from=deps /workspace/apps/server/node_modules ./apps/server/node_modules
COPY apps/server/package.json ./apps/server/package.json
COPY --from=builder /workspace/apps/server/prisma ./apps/server/prisma
COPY --from=builder /workspace/apps/server/prisma.config.ts ./apps/server/prisma.config.ts
COPY apps/server/docker-entrypoint.sh /usr/local/bin/ofeed-entrypoint
RUN chmod 0555 /usr/local/bin/ofeed-entrypoint \
  && chown -R node:node /workspace
WORKDIR /workspace/apps/server
USER node
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/ofeed-entrypoint"]
CMD ["/workspace/apps/server/node_modules/.bin/prisma", "migrate", "deploy"]

FROM production AS runner
