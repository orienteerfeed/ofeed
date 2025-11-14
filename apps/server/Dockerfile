# Use the official Node.js image.
# https://hub.docker.com/_/node
FROM node:22.14-slim

# Install required system packages (including curl for healthcheck)
RUN apt-get update && apt-get install -y \
  curl \
  openssl \
  && rm -rf /var/lib/apt/lists/*

# Create and change to the app directory.
WORKDIR /usr/src/app

# Copy application dependency manifests to the container image.
COPY package*.json ./
COPY prisma ./prisma/

# Install production dependencies.
RUN npm install --omit-dev

# Copy local code to the container image.
COPY . .

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
