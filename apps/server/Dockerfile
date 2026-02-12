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

FROM deps AS runner
COPY apps/server apps/server
COPY packages/shared packages/shared
WORKDIR /workspace/apps/server
RUN DATABASE_URL="mysql://user:password@localhost:3306/orienteerfeed" pnpm exec prisma generate
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["pnpm", "exec", "tsx", "src/index.ts"]
