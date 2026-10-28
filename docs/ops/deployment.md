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
