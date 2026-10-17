# Repository Guidelines

## Scope

This file supplements the root [AGENTS.md](../../AGENTS.md) for `apps/board`.

## Project Structure & Module Organization

`apps/board` is a standalone Vue 3 board application integrated into the main `pnpm` workspace. App code lives in `src/`, browser tests in `e2e/`, and static assets in `public/`.

Important directories:

- `src/components`: presentational board widgets and table rows
- `src/composables`: data loaders, scrolling logic, and provider adapters
- `src/stores`: Pinia state
- `src/views`: route-level screens
- `tsconfig.base.json`: shared local TypeScript base for board-specific configs

Keep route-level views thin and delegate data loading to composables and state
to stores. The board consumes the OFeed REST API directly and does not depend on
`@repo/shared`.

TypeScript config notes:

- Keep board tsconfig inheritance local to `apps/board` where practical.
- `tsconfig.app.json` should extend the local `tsconfig.dom.json`.
- `tsconfig.config.json` and `e2e/tsconfig.json` should extend the local `tsconfig.base.json`.
- Do not reintroduce `@vue/tsconfig/tsconfig.node.json` or other external preset paths in `e2e/`, because editor resolution for that directory has already been brittle.

## Build, Test, and Development Commands

Run all commands from `apps/board` unless you are using the root workspace command.

- `pnpm dev`: start the Vite development server
- `pnpm dev:win`: Windows-friendly alias for the Vite development server
- `pnpm dev:board` from the repository root starts only this app
- `pnpm dev:board:win` from the repository root starts this app on Windows
- `pnpm build`: run strict type-checking, then build production assets
- `pnpm test:unit`: run Vitest unit tests once
- `pnpm test:e2e`: run Playwright tests
- `pnpm exec tsc -p e2e/tsconfig.json --showConfig`: verify the standalone E2E tsconfig chain when editor diagnostics look stale
- `pnpm lint`: run ESLint with the flat config
- `docker build -f apps/board/Dockerfile -t ofeed-board .` from the repository
  root: build the production container image using the workspace build context

## Coding Style & Naming Conventions

Use TypeScript in strict mode. Prefer explicit types on public composable APIs and provider response models. Indentation is 2 spaces, semicolons are omitted, and strings use single quotes.

- Vue components and views: `PascalCase.vue`
- Composables: `useX.ts`
- Tests: `*.spec.ts`
- Env vars exposed to the client: `VITE_*`

Custom theme colors (`header`, `male`, `female`, `highlight`) live in
`vite.config.ts`. Reuse them through UnoCSS utilities or CSS variables.
Use the existing vue-i18n locale resources for user-facing copy.

## Testing Guidelines

Keep unit tests close to the code under `src/**/__tests__`. Favor focused tests around provider transforms, route-dependent rendering, and table behavior. When changing result-provider behavior, add coverage for both happy-path parsing and failure-prone edge cases.

## Environment & Docker

Copy `.env.example` to `.env` for local overrides. By default the board talks to the local OFeed server via `/api/ofeed`, with Vite proxying to `http://localhost:3001` in development and Nginx proxying to `http://api:3001` in Docker.

Use the configured API base URL rather than hard-coding one. Development proxy
targets can be overridden with `VITE_OFEED_PROXY_TARGET`. For public container
runtime settings, see [frontend configuration](../../docs/FRONTEND_CONFIGURATION.md).

## Commit & Pull Request Guidelines

Follow the root [contribution guide](../../CONTRIBUTING.md): use Conventional
Commits such as `refactor(board): rename result provider` or
`fix(board): handle invalid competition data`. Pull requests should include a
concise summary, test evidence, and screenshots for visible UI changes.
