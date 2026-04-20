# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=24.14.1
ARG PNPM_VERSION=10.33.0

FROM node:${NODE_VERSION}-alpine AS builder
ARG PNPM_VERSION
WORKDIR /workspace
ENV PNPM_HOME="/pnpm"
ENV PNPM_STORE_DIR="/pnpm/store"
ENV PATH="${PNPM_HOME}:${PATH}"
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/board/package.json apps/board/package.json
RUN --mount=type=cache,target=/pnpm/store,sharing=locked \
  pnpm install --frozen-lockfile --filter ./apps/board...

COPY apps/board apps/board

RUN --mount=type=secret,id=board_env,target=/workspace/apps/board/.env \
  pnpm --filter ./apps/board... run build

FROM nginx:1.29-alpine AS runner
RUN apk add --no-cache gettext

COPY apps/board/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /workspace/apps/board/dist /usr/share/nginx/html

ENV PORT=80
ENV BOARD_API_UPSTREAM="http://api:3001"
EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:${PORT}/healthz >/dev/null || exit 1

CMD ["/bin/sh", "-c", "envsubst '$BOARD_API_UPSTREAM $PORT' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'"]
