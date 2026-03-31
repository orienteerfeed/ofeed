# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22.20.0
ARG PNPM_VERSION=10.29.2

FROM node:${NODE_VERSION}-alpine AS base
ARG PNPM_VERSION
WORKDIR /workspace
ENV PNPM_HOME="/pnpm"
ENV PNPM_STORE_DIR="/pnpm/store"
ENV PATH="${PNPM_HOME}:${PATH}"
RUN apk add --no-cache tini \
  && corepack enable \
  && corepack prepare pnpm@${PNPM_VERSION} --activate

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN --mount=type=cache,target=/pnpm/store,sharing=locked \
  pnpm install --frozen-lockfile --filter ./apps/server... --filter ./packages/shared...

FROM deps AS builder
COPY apps/server apps/server
COPY packages/shared packages/shared
WORKDIR /workspace/apps/server
RUN DATABASE_URL="mysql://user:password@localhost:3306/orienteerfeed" pnpm exec prisma generate
RUN pnpm build

FROM base AS runner
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY --from=builder /workspace/node_modules ./node_modules
COPY --from=builder /workspace/apps/server ./apps/server
COPY --from=builder /workspace/packages/shared ./packages/shared
COPY apps/server/docker-entrypoint.sh /usr/local/bin/ofeed-server-entrypoint
WORKDIR /workspace/apps/server
RUN chmod +x /usr/local/bin/ofeed-server-entrypoint
ENV NODE_ENV=production
ENV PORT=3001
ENV VAULT_ENV_FILE=/vault/secrets/api-env
EXPOSE 3001
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/ofeed-server-entrypoint"]
CMD ["node", "dist/index.js"]
