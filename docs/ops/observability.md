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

## Operational checks to configure

Operators should define probes, database-connectivity alerts, sustained error
and latency alerts, migration/job failures, storage/email/import failures and
live result freshness checks. Assign alert owners and thresholds from an agreed
SLO; none are claimed to exist simply because they appear here.

When collecting evidence, retain timestamps, deployment versions and request
IDs. Redact secrets, contact names, email addresses, reset links and payment
payloads. See [data protection](../security/data-protection.md) and the
[readiness runbook](runbooks/api-not-ready.md).
