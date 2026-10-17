# Deployment: Argo CD, Helm, GHCR and Vault

See the [delivery pipeline](./DELIVERY_MODEL.md) for workflows, credentials,
qualification, automatic versioning and one-time activation. Environment state
lives in `martinkrivda/officelab-argocd-apps`; CI never connects to the cluster.

## Artifact contract

Dev and production pin all four GHCR image repositories with explicit aliases
and SHA-256 digests. Production promotes qualified manifests without rebuilding.
The same GitOps commit pins and vendors the qualified chart package. Never use
`latest`, floating branch chart sources or fabricated digests.

Make application image packages public after initial publication, or supply
an environment-specific read-only `imagePullSecret`. Chart and delivery-record
packages may remain private; Argo CD reads the chart from GitOps.

## Migration ordering

The chart creates an `ops` migration Job as an Argo CD **Sync** hook at wave -10,
after prerequisites at -20 and before application workloads at wave 0. A failed
`prisma migrate deploy` stops rollout. Do not use selective sync, which skips
hooks. ExternalSecret reconciliation must complete before the Job can start.

Use expand/contract schema changes compatible with the currently running API.
Reverting a GitOps bump does not reverse the database schema. Keep a tested
rollback window and backup/recovery plan, especially for the first managed
production deployment where the legacy baseline is not recorded yet.

## Existing MariaDB and test isolation

The shared MariaDB instance remains in namespace `database`. Dev uses a separate
`ofeed_test` database and a dedicated user restricted to that database. GitOps
provides an idempotent bootstrap Job using the existing root Secret; it works
with the current persistent volume and does not rely on first-start init SQL.
Production's database/user are not modified. Password mismatches on an existing
test user fail verification rather than silently rotating credentials.

## Secret delivery

Dev uses External Secrets Operator to create `ofeed-runtime` from Vault. The
same password creates the test database user and the URL-encoded `DATABASE_URL`.
Both API and migrations consume the same runtime Secret:

```yaml
api:
  envFrom:
    - secretRef: { name: ofeed-runtime }
ops:
  envFrom:
    - secretRef: { name: ofeed-runtime }
vault:
  enabled: false
```

Production's existing Vault Agent configuration is preserved. If using the
injector, configure `vault.enabled`, `role`, `authPath`, `secretPath`, `kvVersion`
and `secretKeys`. Explicit pod `env`/`envFrom` values take precedence. Never
commit Secret data, database URLs containing passwords or Vault tokens.

## Public runtime configuration

The same client/board image runs on another hostname without rebuilding.
Configure only public `OFEED_PUBLIC_URL`, `OFEED_PUBLIC_API_URL`,
`OFEED_BOARD_APP_URL` and optional `OFEED_BOARD_API_URL` through `web.env` or
`board.env`. Never put server credentials into public runtime configuration.
Unset API URLs use the current origin and Nginx's same-origin API proxy.
Deployments are supported at `/`, not under a URL path prefix. See
[frontend configuration](./FRONTEND_CONFIGURATION.md) for the complete contract.
