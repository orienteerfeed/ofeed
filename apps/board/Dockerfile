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
COPY apps/board/package.json apps/board/package.json
RUN --mount=type=cache,target=/pnpm/store,sharing=locked \
  pnpm install --frozen-lockfile --ignore-scripts --filter ./apps/board...

COPY apps/board apps/board
RUN pnpm --filter ./apps/board... run build

FROM nginxinc/nginx-unprivileged:1.29-alpine AS runner
COPY apps/board/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY apps/board/docker-entrypoint-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
COPY --from=builder /workspace/apps/board/dist /usr/share/nginx/html
USER root
RUN chmod 0555 /docker-entrypoint.d/40-runtime-config.sh
USER 101
ENV PORT=8080 \
    BOARD_API_UPSTREAM=http://api:3001 \
    OFEED_BOARD_API_URL=/api/ofeed \
    OFEED_BOARD_GQL_WS_URL= \
    OFEED_BOARD_PROVIDERS=ofeed,liveResultat
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:${PORT}/healthz >/dev/null || exit 1
