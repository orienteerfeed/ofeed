# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=24.15.0
ARG PNPM_VERSION=11.4.0

FROM node:${NODE_VERSION}-bookworm-slim AS builder
ARG PNPM_VERSION
WORKDIR /workspace
ENV PNPM_HOME=/pnpm \
    PNPM_STORE_DIR=/pnpm/store \
    PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/client/package.json apps/client/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN --mount=type=cache,target=/pnpm/store,sharing=locked \
  pnpm install --frozen-lockfile --ignore-scripts --filter ./apps/client... --filter ./packages/shared...

COPY apps/client apps/client
COPY packages/shared packages/shared
RUN pnpm --filter ./apps/client... run build

FROM nginxinc/nginx-unprivileged:1.31-alpine AS runner
COPY apps/client/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY apps/client/docker-entrypoint-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
COPY --from=builder /workspace/apps/client/dist /usr/share/nginx/html
USER root
RUN chmod 0555 /docker-entrypoint.d/40-runtime-config.sh
USER 101
ENV PORT=8080 \
    API_UPSTREAM=http://api:3001 \
    OFEED_PUBLIC_API_URL= \
    OFEED_PUBLIC_URL= \
    OFEED_DEFAULT_LANGUAGE=en \
    OFEED_SUPPORT_EMAIL=support@orienteerfeed.com \
    OFEED_DOCS_URL=https://docs.orienteerfeed.com \
    OFEED_BOARD_APP_URL= \
    OFEED_DISCORD_INVITE_URL=https://discord.gg/QMvnurgKzU \
    OFEED_GITHUB_REPO_URL=https://github.com/orienteerfeed/orienteerfeed \
    OFEED_ENABLE_MAP_VIEW=true \
    OFEED_DEBUG_LOGGING=false
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:${PORT}/healthz >/dev/null || exit 1
