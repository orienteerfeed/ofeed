# Runbook: API is not ready

## Trigger and scope

API pods/processes fail readiness, traffic returns gateway errors, or a rollout
stalls. This runbook starts with read-only checks; use the actual environment,
namespace and release names from deployment configuration.

## Triage

1. Record start time, environment, deployed image digest/tag and recent changes.
2. Compare `/healthz` and `/readyz`. If only readiness fails, inspect the
   database check result; liveness success does not prove database connectivity.
3. Inspect application and migration-job status/logs in the deployment platform.
   Look for missing env configuration, database authentication/DNS/TLS issues,
   failed migrations, missing reference data or dependency startup failures.
4. Compare API and migration secret references without printing secret values.
   Verify service/network access to the intended database.
5. If API checks pass but browsers fail, check ingress, browser runtime config,
   CORS and WebSocket routing. Follow the
   [deployment guide](../../DEPLOYMENT_ARGOCD.md).

## Recovery

Correct the identified configuration/dependency problem through the normal
deployment path. Rerun migration delivery only after understanding its failure
and verifying retry safety. Consider an application rollback only after checking
schema compatibility. Do not reset/drop the database or edit migration history
as an incident shortcut. Escalate to the environment owner for restore
decisions.

## Exit criteria

Readiness remains healthy, rollout completes, and a representative event read
works through the public ingress. Check logs/error trends and relevant
live-result flows. Record cause, action, validation and follow-up issue without
credentials or personal data. An HTTP 200 alone is insufficient for GraphQL/MeOS
success.
