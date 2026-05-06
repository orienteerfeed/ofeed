# Client Guidelines

Vite + React 19 client. See @package.json for stack and scripts; root `CLAUDE.md` for monorepo rules.

## Architecture

`Route → Container → UI-Bridge → Template`. Routes wire params/loaders only; logic belongs in containers and hooks; templates are pure UI.

Component layering: `src/components/{ui → atoms → molecules → organisms}`. Build new UI from `src/components/ui` (shadcn primitives) first, then compose upward.

State:

- **GraphQL**: Apollo Client (HTTP + WS subscriptions; auth flows via `connectionParams`)
- **REST async**: TanStack Query
- **Global**: Zustand (`src/stores/`)

Don't wrap Apollo flows inside TanStack Query.

## Routes

File-based via TanStack Router. Generated barrel `src/routeTree.gen.ts` is auto-generated — never hand-edit.

Top-level under `src/routes/`: `auth/`, `admin/`, `events/$eventId/`, plus `index.tsx`, `my-events.tsx`, `profile.tsx`, `about.tsx`, `__root.tsx`.

## Forms

- New forms: `@tanstack/react-form` + Zod.
- Existing `react-hook-form` usage stays put for shadcn form helpers — don't expand it.
- Shared validation schemas → `packages/shared`. Client-only schemas → near the feature or `src/lib/validation.ts`.

## Localization

Supported locales: `en`, `cs`, `es`, `de`, `sv`, `fr` under `src/i18n/locales/<lang>/`. Keep all locale files in sync when adding keys.

## Testing

- Unit/component: Vitest + jsdom — `tests/**` and `**/__tests__/**` (the `src/` tree is excluded from Vitest).
- E2E: Playwright in `e2e/`.

For route, form, or i18n changes prefer running `pnpm test` and `pnpm e2e`.

## Key Invariants

- PWA service-worker config and vendor chunk splitting (React, TanStack, Radix, Recharts, Apollo) live in `vite.config.ts` — don't break that grouping.
- Tailwind CSS 4 utilities cover layout/spacing/color; don't introduce raw CSS or parallel UI systems alongside shadcn.
