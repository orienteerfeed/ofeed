# Shared Package Guidelines

## Scope

This file applies to `packages/shared`.

## Purpose

`@repo/shared` contains reusable TypeScript and Zod contracts shared by the
client and server. Treat it as the source of truth for payloads that cross the
network boundary.

## Structure

- `src/models/*`: domain models and reusable schemas.
- `src/api.ts`: API-related schemas and helpers.
- `src/envelope.ts`: envelope and response primitives.
- `src/index.ts`: public package exports.

## Rules

- Prefer Zod schemas as the primary definition, then derive types from them.
- Keep this package framework-agnostic and environment-agnostic.
- Avoid adding browser-only or Node-only dependencies here.
- Keep exports intentional. Update barrel exports when adding new models.
- Favor additive changes; if a contract change is breaking, make that explicit
  in the change summary and update both consumers in the same work.

## Validation Guidance

- Put schemas here when both frontend and backend should validate the same
  payload or response shape.
- Keep server-only validation in `apps/server` and view-only validation in
  `apps/client`.

## Verification

This package has no dedicated scripts. Validate changes from the repo root:

- `pnpm type-check`
- `pnpm test:client`
- `pnpm test:server`

If a shared contract changes, check both consuming apps before finishing.
