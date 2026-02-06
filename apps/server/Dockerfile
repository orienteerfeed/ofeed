# Use the official Node.js image.
# https://hub.docker.com/_/node
# =========================
# BUILD STAGE
# =========================
FROM node:22.22.0-slim AS builder
WORKDIR /repo

ARG PNPM_VERSION=10.20.0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
ENV PNPM_STORE_DIR=/pnpm/store

# Install required system packages (including curl for healthcheck)
RUN apt-get update && apt-get install -y \
  curl \
  openssl \
  && rm -rf /var/lib/apt/lists/*

# Copy application dependency manifests to the container image.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/package.json
COPY apps/server/prisma apps/server/prisma/

# Install production dependencies.
RUN --mount=type=cache,target=/pnpm/store,sharing=locked \
  pnpm install --frozen-lockfile --filter ./apps/server...

# Copy local code to the container image.
COPY . .

WORKDIR /repo/apps/server

# Run the web service on container startup.
CMD ["npm", "run", "start:prod"]

# Expose the port the app runs on
EXPOSE 3001


#
# Ideally, this is what you want to achieve:
#

# FROM node:18-alpine AS builder

# WORKDIR /app

# COPY package*.json ./
# COPY prisma ./prisma/

# RUN npm install

# COPY . .

# RUN npm run build

# FROM node:18-alpine

# COPY --from=builder /app/node_modules ./node_modules
# COPY --from=builder /app/package*.json ./
# COPY --from=builder /app/build ./dist
# COPY --from=builder /app/prisma ./prisma

# EXPOSE 3001

# CMD ["npm", "run", "start:prod"]
