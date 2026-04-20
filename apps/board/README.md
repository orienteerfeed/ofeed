# OFeed Board

![Node.js 24.14.1](https://img.shields.io/badge/Node.js-24.14.1-5FA04E?logo=node.js&logoColor=white)
![Vue 3.5.32](https://img.shields.io/badge/Vue-3.5.32-4FC08D?logo=vue.js&logoColor=white)

- Vue 3 + Vite application for displaying live orienteering event boards.
- Supports multiple data providers, currently `ofeed` and `liveResultat`.
- Uses `pnpm`, strict TypeScript, Vitest, ESLint, Docker, and Traefik-friendly deployment wiring.

## Prerequisites

- Node.js `24.14.1`
- pnpm `10.33.0`
- From the repository root, run `pnpm install`

## Quick Start

- Copy the example environment file:

```bash
cp apps/board/.env.example apps/board/.env
```

- Start the main app stack as usual:

```bash
pnpm dev
```

- Run the board separately when you need it:

```bash
pnpm dev:board
```

- Or run the package directly:

```bash
pnpm --filter ./apps/board dev
```

- Open `http://localhost:5173`

## Environment

- `VITE_PROVIDERS` controls enabled providers, for example `ofeed,liveResultat`
- `VITE_OFEED_API_URL` defaults to `/api/ofeed`, so the board uses the same origin in both local Docker and Traefik deployments
- `VITE_OFEED_PROXY_TARGET` defaults to `http://localhost:3001` for local development against the monorepo server
- `BOARD_API_UPSTREAM` controls the Nginx upstream inside the board container and defaults to `http://api:3001`
- In development, OFeed requests are proxied through `/api/ofeed`

## Quality Checks

- `pnpm --filter ofeed-board type-check` runs Vue TypeScript checks
- `pnpm --filter ofeed-board lint` runs ESLint
- `pnpm --filter ofeed-board test:unit` runs Vitest unit tests
- `pnpm --filter ofeed-board build` creates a production build in `apps/board/dist`

## Docker

- Build the container image from the repository root:

```bash
docker build -f apps/board/Dockerfile -t ofeed-board .
```

- Run the production image:

```bash
docker run --rm -p 8080:80 --env BOARD_API_UPSTREAM=http://host.docker.internal:3001 ofeed-board
```

- The app will be available at `http://localhost:8080`
- In the main Compose flow it is exposed on `${BOARD_PORT:-3002}` and can be routed through Traefik with `BOARD_HOST`
