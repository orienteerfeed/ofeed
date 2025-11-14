# =============================================================================
# BUILD STAGE
# =============================================================================
FROM node:22.20.0-alpine AS builder

# Set working directory
WORKDIR /repo

# Pin pnpm version from the monorepo
ARG PNPM_VERSION=10.20.0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# Speed up repeated installs
ENV PNPM_STORE_DIR=/pnpm/store

# Copy monorepo manifests (lock + workspace + all package.json files)
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
# Copy client package.json
COPY apps/client/package.json apps/client/package.json

# Install only what the client app (and its local deps) needs
RUN --mount=type=cache,target=/pnpm/store,sharing=locked \
  pnpm install --frozen-lockfile --filter ./apps/client...

# Copy source code
COPY . .

# Build the application
RUN --mount=type=secret,id=client_env,target=/repo/apps/client/.env \
    pnpm --filter ./apps/client... build

# =============================================================================
# PRODUCTION STAGE (NGINX)
# =============================================================================
FROM nginx:1.29.1-alpine AS production

# Install curl for health checks
RUN apk add --no-cache curl

# Create required nginx runtime dirs
RUN mkdir -p /var/cache/nginx /var/log/nginx /var/run/nginx

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nginxuser -u 1001

# Set permissions on required nginx directories
RUN chown -R nginxuser:nodejs \
    /usr/share/nginx \
    /var/cache/nginx \
    /var/log/nginx \
    /var/run/nginx \
    /etc/nginx

# Copy custom nginx configuration
COPY apps/client/nginx.conf /etc/nginx/nginx.conf

# Copy built app to nginx
COPY --from=builder /repo/apps/client/dist /usr/share/nginx/html

# Switch to non-root user
USER nginxuser

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
