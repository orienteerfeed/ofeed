# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22.20.0
ARG PNPM_VERSION=10.29.2

FROM node:${NODE_VERSION}-alpine AS builder
ARG PNPM_VERSION
WORKDIR /workspace
ENV PNPM_HOME="/pnpm"
ENV PNPM_STORE_DIR="/pnpm/store"
ENV PATH="${PNPM_HOME}:${PATH}"
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/client/package.json apps/client/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN --mount=type=cache,target=/pnpm/store,sharing=locked \
  pnpm install --frozen-lockfile --filter ./apps/client...

COPY apps/client apps/client
COPY packages/shared packages/shared

RUN --mount=type=secret,id=client_env,target=/workspace/apps/client/.env \
  pnpm --filter ./apps/client... run build

FROM nginx:1.29-alpine AS runner
RUN apk add --no-cache gettext

COPY apps/client/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /workspace/apps/client/dist /usr/share/nginx/html

ENV PORT=80
ENV API_UPSTREAM="http://api:3001"
EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -qO- http://localhost:${PORT}/healthz >/dev/null || exit 1

CMD ["/bin/sh", "-c", "envsubst '$API_UPSTREAM $PORT' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'"]
