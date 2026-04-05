# Client Guidelines

## Scope

This file applies to `apps/client`.

## Stack

- Vite 7
- React 19
- TypeScript
- Tailwind CSS 4
- shadcn/ui
- TanStack Router
- TanStack Query
- TanStack Form
- Apollo Client for GraphQL
- i18next + react-i18next
- Zod-based validation

## Architecture

Frontend work should follow the existing Atomic Design structure:

- `src/components/ui`: low-level shadcn/ui primitives and wrappers.
- `src/components/atoms`: smallest reusable UI elements.
- `src/components/molecules`: composed controls and reusable feature widgets.
- `src/components/organisms`: larger composed sections.
- `src/templates`: layout shells.
- `src/pages`: page-level feature composition.
- `src/routes`: TanStack Router file-based route entries.
- `src/providers`: app-wide providers.
- `src/hooks`: reusable hooks.
- `src/lib`: shared helpers, API helpers, and local validation helpers.
- `src/i18n`: localization bootstrapping and locale files.

Keep `src/routes` thin. Route files should primarily wire params/loaders and
render page components from `src/pages`.

## UI Rules

- Build new reusable UI from `src/components/ui` primitives first, then compose
  them into atoms, molecules, and organisms.
- Prefer shadcn/ui and existing design tokens over introducing parallel UI
  systems.
- Keep components responsive, accessible, and translation-ready.
- Use the existing `@/` alias for internal imports.
- Avoid hand-editing `src/routeTree.gen.ts`.

## Data, Forms, and Validation

- Use Apollo Client for GraphQL queries, mutations, and subscriptions.
- Use TanStack Query for REST or other non-GraphQL async state.
- Do not wrap Apollo data flows inside TanStack Query unless there is a strong,
  explicit reason.
- Prefer `@tanstack/react-form` for new forms.
- Keep `react-hook-form` changes localized to existing components that already
  depend on the shadcn form helpers.
- Validate form data with Zod. Shared payload schemas belong in
  `packages/shared`; client-only schemas can live near the feature or in
  `src/lib/validation.ts`.

## Localization

- Never hard-code user-facing copy in components when it belongs in i18n; use
  existing locale keys or add new ones when needed.
- Current locale resources exist for `en`, `cs`, `es`, `de`, and `sv`.
- The target locale set also includes `fr`. When doing localization-heavy work
  or introducing new namespaces, add and maintain French resources instead of
  leaving it behind.
- When adding translation keys, keep the locale files in sync across supported
  languages.

## Naming and File Conventions

- React component, page, template, and provider files use PascalCase.
- Hook files use the `useX.ts` or `useX.tsx` convention.
- TanStack Router route files stay lowercase and file-based.
- Keep page-only logic in `src/pages`; promote code into
  `components/atoms|molecules|organisms` only when it becomes reusable.

## Commands

Run from `apps/client` or from the repo root with `pnpm --filter ./apps/client`.

- `pnpm dev`
- `pnpm build`
- `pnpm lint`
- `pnpm lint:fix`
- `pnpm type-check`
- `pnpm test`
- `pnpm test:watch`
- `pnpm test:coverage`
- `pnpm e2e`
- `pnpm e2e:ui`

## Testing Expectations

- Use Vitest for unit and component tests.
- Use Playwright for route-level and end-to-end behavior.
- For UI, routing, form, or i18n changes, prefer at least `pnpm test` and the
  most relevant focused check (`pnpm test:coverage` or `pnpm e2e`) before
  finishing.
