# Repository Guidelines

## Project Structure & Module Organization

`apps/board` is a standalone Vue 3 board application integrated into the main `pnpm` workspace. App code lives in `src/`, browser tests in `e2e/`, and static assets in `public/`.

Important directories:

- `src/components`: presentational board widgets and table rows
- `src/composables`: data loaders, scrolling logic, and provider adapters
- `src/stores`: Pinia state
- `src/views`: route-level screens
- `tsconfig.base.json`: shared local TypeScript base for board-specific configs

TypeScript config notes:

- Keep board tsconfig inheritance local to `apps/board` where practical.
- `tsconfig.app.json` should extend the local `tsconfig.dom.json`.
- `tsconfig.config.json` and `e2e/tsconfig.json` should extend the local `tsconfig.base.json`.
- Do not reintroduce `@vue/tsconfig/tsconfig.node.json` or other external preset paths in `e2e/`, because editor resolution for that directory has already been brittle.

## Build, Test, and Development Commands

Run all commands from `apps/board` unless you are using the root workspace command.

- `pnpm dev`: start the Vite development server
- `pnpm dev:board` from the repository root starts only this app
- `pnpm build`: run strict type-checking, then build production assets
- `pnpm test:unit`: run Vitest unit tests once
- `pnpm test:e2e`: run Playwright tests
- `pnpm exec tsc -p e2e/tsconfig.json --showConfig`: verify the standalone E2E tsconfig chain when editor diagnostics look stale
- `pnpm lint`: run ESLint with the flat config
- `docker build -t ofeed-board .`: build the production container image

## Coding Style & Naming Conventions

Use TypeScript in strict mode. Prefer explicit types on public composable APIs and provider response models. Indentation is 2 spaces, semicolons are omitted, and strings use single quotes.

- Vue components and views: `PascalCase.vue`
- Composables: `useX.ts`
- Tests: `*.spec.ts`
- Env vars exposed to the client: `VITE_*`

## Testing Guidelines

Keep unit tests close to the code under `src/**/__tests__`. Favor focused tests around provider transforms, route-dependent rendering, and table behavior. When changing result-provider behavior, add coverage for both happy-path parsing and failure-prone edge cases.

## Environment & Docker

Copy `.env.example` to `.env` for local overrides. By default the board talks to the local OFeed server via `/api/ofeed`, with Vite proxying to `http://localhost:3001` in development and Nginx proxying to `http://api:3001` in Docker.

## Commit & Pull Request Guidelines

Use short imperative commits, for example `rename oriCloud provider to ofeed` or `tighten strict types in competition loaders`. Pull requests should include a concise summary, test evidence, and screenshots for visible UI changes.
