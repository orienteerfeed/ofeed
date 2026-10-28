# Observability

## Existing signals

| Signal              | Source                                                                        | Interpretation                                                        |
| ------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `/healthz`          | Liveness endpoint                                                             | Process-level liveness, not proof dependencies work                   |
| `/readyz`           | [Health service](../../apps/server/src/modules/health/health.service.ts)      | Database-backed readiness using a bounded `SELECT 1` check            |
| `/metrics`          | [Metrics handlers](../../apps/server/src/modules/metrics/metrics.handlers.ts) | Prometheus process metrics and HTTP request duration histogram        |
| Request logs        | [Logging](../../apps/server/src/lib/logging.ts), structured/access middleware | Request IDs and HTTP context; review enabled sinks and redaction      |
| Browser diagnostics | UI console, network panel and browser-test artifacts                          | Check HTTP failures, runtime-config values and WebSocket connectivity |

## Metrics limits

`http_request_duration_seconds` labels are `method`, `route`, and `status_code`.
The current middleware uses the raw request path as `route`, not a normalized
route template. Watch label cardinality and avoid treating path identifiers as
safe public telemetry. HTTP-level success also does not prove GraphQL or MeOS
protocol-level success; inspect their error payloads.

Do not assume all requests are covered equally by rate limits or that request
IDs are distributed traces. End-to-end tracing, a collector, dashboards and
alert routing are not established by this document.

## API request budgets

Default budgets are independent. Ordinary GraphQL, REST and upload requests
use the verified user ID or event Basic identity; anonymous requests use the
client IP (or the existing fingerprint when forwarding headers are absent).
Tabs for one account share quota. Other accounts on the same network have
their own quota. Session endpoints and credential authentication use IP keys.

| Traffic | Default | Configuration |
| --- | --- | --- |
| GraphQL | 600/minute | `GRAPHQL_RATE_LIMIT_MAX` |
| Ordinary REST | 600/minute | `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS=60000` |
| Multipart imports and featured-image writes | 60/minute | `UPLOAD_RATE_LIMIT_MAX` |
| Session refresh/logout | 120/minute | `SESSION_RATE_LIMIT_MAX` |
| REST credential authentication | 10/minute | Fixed |
| Map tiles | 2000/minute per IP | `MAP_TILE_RATE_LIMIT_MAX`, `MAP_TILE_RATE_LIMIT_WINDOW_MS` |

Public health/documentation/metrics paths retain their existing exemption.
These budgets are per API process, using the existing memory store. They do
not establish sustainable database throughput or a cluster-wide limit. Upload
body limits and authorization are unchanged. Browser requests can inspect
`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, `RateLimit-Policy`
and `Retry-After`; CORS preflight does not consume quota.

The headroom regression sends, per account, 240 GraphQL requests, 120 REST
requests, 12 multipart uploads and six refreshes for three concurrent accounts
on one IP within one minute. This verifies quota isolation and admission,
using real authentication/multipart middleware and fixture handlers. It does
not measure import/database throughput.

Deploy the API and its environment configuration together. Check external
GitOps overrides for old `RATE_LIMIT_MAX=100/200` or a 15-minute window.
`RATE_LIMIT_MAX` controls ordinary REST; changing it does not change GraphQL.
On 2026-10-27 a harmless `__typename` request to `api.dev.ofeed.live/graphql`
confirmed the deployed old policy `RateLimit-Limit: 30`, `RateLimit-Policy:
30;w=60`. Recheck headers after rollout; the local changes do not update the
deployed API.

## Operational checks to configure

Operators should define probes, database-connectivity alerts, sustained error
and latency alerts, migration/job failures, storage/email/import failures and
live result freshness checks. Assign alert owners and thresholds from an agreed
SLO; none are claimed to exist simply because they appear here.

When collecting evidence, retain timestamps, deployment versions and request
IDs. Redact secrets, contact names, email addresses, reset links and payment
payloads. See [data protection](../security/data-protection.md) and the
[readiness runbook](runbooks/api-not-ready.md).
