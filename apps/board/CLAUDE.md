# Board Guidelines

Vue 3 + Pinia + UnoCSS standalone SPA. See @package.json for stack and scripts; root `CLAUDE.md` for monorepo rules.

## Architecture

- `src/composables/`: data loaders and provider adapters (`useX.ts`)
- `src/stores/`: Pinia state
- `src/views/`: route-level screens — keep thin, delegate data to composables and state to stores
- `src/components/`: presentational widgets and table rows

The board is excluded from root `pnpm dev`. Start with `pnpm dev:board` (root) or `pnpm dev` from `apps/board/`.

## API

In dev, Vite proxies `/api/ofeed` → `http://localhost:3001` (override via `VITE_OFEED_PROXY_TARGET`). In Docker, Nginx proxies to `http://api:3001`. Don't hardcode the API base URL — use the proxy path.

The board does **not** depend on `@repo/shared` — it consumes the OFeed REST API directly.

## TypeScript config

- `tsconfig.app.json` extends local `tsconfig.dom.json`.
- `tsconfig.config.json` and `e2e/tsconfig.json` extend local `tsconfig.base.json`.
- Do **not** reintroduce `@vue/tsconfig/tsconfig.node.json` or other external preset paths in `e2e/` — editor resolution there has been brittle.

When E2E diagnostics look stale: `pnpm exec tsc -p e2e/tsconfig.json --showConfig`.

## Theming

Custom theme colors (`header`, `male`, `female`, `highlight`) live in `vite.config.ts`. Use them via UnoCSS utilities or CSS variables — don't hardcode hex.

## Testing

- Unit: Vitest + jsdom — `src/**/__tests__/*.spec.ts`.
- E2E: Playwright in `e2e/`.

Focus unit coverage on provider transforms, composable logic, and route-dependent rendering. For result-provider changes, cover happy-path parsing **and** failure-prone edges.
