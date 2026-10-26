# Development conventions

Root [AGENTS.md](../../AGENTS.md) and more specific workspace instructions
define scope. Keep changes small and preserve unrelated working-tree edits.

## Code and file organization

- TypeScript + ESM; follow existing aliases and local import style.
- Use `.editorconfig`, root `.prettierrc` and workspace overrides. The usual
  style is UTF-8/LF, two spaces, semicolons and single quotes; do not reformat
  unrelated code to override a workspace convention.
- New filenames use lowercase kebab-case, YAML uses `.yaml`. Preserve special
  entrypoint names such as `AGENTS.md`, `README.md` and existing published
  links.
- Do not hand-edit `apps/client/src/routeTree.gen.ts` or
  `apps/server/src/generated/**`.
- Client-facing copy belongs in localization resources, not hard-coded strings.

## Boundaries and errors

- Feature services own business rules, database access and authorization
  decisions. REST handlers and GraphQL resolvers adapt requests and responses.
- Shared network validation lives in `packages/shared`; feature-only schemas
  stay near the owning module. Infer service input types from Zod schemas.
- Preserve the existing REST response helpers in
  [responseApi.ts](../../apps/server/src/utils/responseApi.ts). Document actual
  validation/conflict behavior; do not add stricter docs-only requirements.
- Preserve GraphQL error codes and field nullability. Use existing service
  errors and guards rather than leaking database exceptions or secrets to
  clients.
- Read [GraphQL architecture](../GRAPHQL_ARCHITECTURE.md) for dependency
  direction, reusable type refs and Prisma selection behavior.

## Configuration and security

Keep runtime env files app-local; add new task-affecting variables to
`turbo.json` and relevant `.env.example` files. Read installed Turbo
documentation before changing its configuration. Never commit secrets,
production personal data or browser authentication state. See
[data protection](../security/data-protection.md).

## Review and documentation

Use [CONTRIBUTING.md](../../CONTRIBUTING.md) for branching, Conventional
Commits, review and [CLA.md](../../CLA.md). Non-trivial work references a GitHub
Issue. Before architecture changes read [ADRs](../architecture/adr/README.md),
then record a new decision. Write feature specs before code and update them with
it.

Follow [testing](testing.md). Public API, infrastructure or configuration
changes also update documentation. Maintain [CHANGELOG.md](../../CHANGELOG.md)
in Keep a Changelog format for notable changes; releases require explicit
release intent. Respect tool-specific permission settings, including
`.claude/settings.json`; this documentation does not grant git mutation or
external publication permissions.
