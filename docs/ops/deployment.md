# Deployment

This page is the operations entry point. Existing detailed guides and chart
configuration remain authoritative for deployment mechanics.

## Environments and delivery

| Target           | Delivery path                                                                            | Reference                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Local            | App-local env files, local database, optional Compose stack                              | [Setup](../dev/setup.md)                                                      |
| Development      | Successful `develop` CI build, immutable images/chart, GitOps `deploy/dev` update        | [Argo CD guide](../DEPLOYMENT_ARGOCD.md)                                      |
| Stable           | Explicit release request on `main`, semantic-release `vX.Y.Z`, release-tag image publish | [Root release flow](../../README.md#cicd-and-versioning-flow)                 |
| Kubernetes / k3s | Helm chart and environment-specific GitOps configuration                                 | [k3s guide](../DEPLOYMENT_K3S.md), [chart](../../deploy/helm/ofeed/README.md) |

Workflows: [CI](../../.github/workflows/ci.yaml),
[development deployment](../../.github/workflows/deploy-dev.yaml),
[release](../../.github/workflows/release.yaml),
[release images](../../.github/workflows/publish-images-ghcr.yaml).

## Container image retention

[GHCR cleanup](../../.github/workflows/cleanup-ghcr.yaml) runs every Sunday at
03:30 UTC and supports manual dispatch from Actions. After successful cleanup,
each of `ofeed/server`, `ofeed/client`, `ofeed/board` and `ofeed/ops` keeps only
its five newest tagged images across development and release versions. Unused
untagged images are removed; platform manifests and attestations for retained
multi-architecture images are preserved. GHCR may therefore show more than five
individual manifest entries per package.

The workflow uses `GITHUB_TOKEN` with `packages: write`. Grant the repository
**Admin** under **Package settings → Manage Actions access** for all four
packages. The schedule runs from the default branch and performs real deletion.

Deployed digests and release tags have no exemption: an environment more than
five builds behind may lose the ability to pull its image after cleanup. Update
the environment or export required images before they fall outside retention.
Check the cleanup logs and multi-architecture validation warnings after each run.
See the [retention specification](../specs/ghcr-image-retention.md).

## Deployment invariants

- Use explicit image tags/digests; do not deploy a moving `latest` tag.
- The migration image runs migrations and idempotent reference-data seeding
  before rollout. Preserve reference IDs and do not create demo users/events in
  deployment.
- Database and migration jobs must receive consistent runtime secrets. Supported
  secret-delivery modes and precedence are in the Argo CD guide.
- Public frontend runtime configuration contains only browser-safe values; see
  [frontend configuration](../FRONTEND_CONFIGURATION.md).
- Keep migrations compatible with the currently running application. Rolling
  back an image does not reverse schema/data changes.

## Verification and recovery

Check sync/migration completion, rollout status, `/healthz`, `/readyz`, and a
representative event/read workflow. Check frontend API/WebSocket configuration
and [telemetry](observability.md). Use the
[readiness runbook](runbooks/api-not-ready.md) for API startup failures.

A rollback/restore plan must identify the exact previous image version and
schema compatibility. Backup storage, restore exercises and approved RPO/RTO are
operator responsibilities not established by these repository docs. Do not
resolve a failed deployment by resetting the production database.
