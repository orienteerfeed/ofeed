# OFeed Helm Chart

Deploys the web client, API, optional board and an ordered Argo CD migration Job
using the `ops` image. MariaDB/MySQL is external; this chart does not create a
database server.

## Images and GitOps

Every component requires an explicit immutable candidate or stable tag. Managed
GitOps also sets `requireImageDigests: true` and supplies all four SHA-256
digest pins. The rendered reference is `repository:tag@sha256:...`; the digest
is the deployment identity. `latest`, `main` and `develop` tags are rejected.

For a local render without remote registry access:

```bash
helm template ofeed ./deploy/helm/ofeed \
  --set api.image.tag=1.2.3 \
  --set web.image.tag=1.2.3 \
  --set ops.image.tag=1.2.3 \
  --set board.image.tag=1.2.3
```

This non-enforcing local example is not a production values file. The delivery
pipeline pins the chart version and vendors the exact qualified package into the
GitOps environment wrapper; all image/chart changes form one atomic bump.

## Runtime configuration and secrets

`api.env` contains non-secret server settings. Supply credentials through
`api.envFrom` and `ops.envFrom` Kubernetes SecretRefs, or the optional Vault
Agent Injector (`vault.enabled=true`). Explicit pod variables override Vault
values. Migrations and API must receive the same database connection settings.

For the injector, set `vault.role`, `vault.secretPath`, `vault.authPath`,
`vault.kvVersion` and the exact `vault.secretKeys` list. Dev's GitOps bootstrap
instead uses External Secrets Operator and the existing shared MariaDB.

`web.env` and `board.env` are public values used to generate
`/runtime-config.js` at container startup; never include passwords or API keys.

## Migration ordering

The ServiceAccount is wave -20; the migration Job is a Sync hook at wave -10;
workloads are wave 0. Use a full Argo CD sync so hooks run. A failed migration
blocks rollout. Rollback reverts image/chart state, not database schema: use
backward-compatible expand/contract changes.

See [deployment operations](../../../docs/DEPLOYMENT_ARGOCD.md) and the
[delivery/activation guide](../../../docs/DELIVERY_MODEL.md).
