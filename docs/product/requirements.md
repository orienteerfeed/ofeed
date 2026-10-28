# Requirements baseline

This is a summary of the current product and engineering constraints, not a
complete backlog. Feature acceptance criteria live in
[specs](../specs/README.md); planned work is tracked in GitHub Issues.

## Functional requirements

| ID    | Requirement                                                                   | Primary reference                               |
| ----- | ----------------------------------------------------------------------------- | ----------------------------------------------- |
| FR-01 | Manage event-scoped classes, competitors, teams, courses and results          | [Data model](../architecture/data-model.md)     |
| FR-02 | Expose public and authenticated API operations with appropriate access checks | [API sources](../api/README.md)                 |
| FR-03 | Create entry orders with server-calculated fees and validated availability    | [Checkout spec](../specs/entry-checkout.md)     |
| FR-04 | Import IOF data and integrate federation and timing systems                   | [Integrations](../architecture/integrations.md) |
| FR-05 | Deliver live result updates and a separate event-board interface              | [Architecture](../architecture/overview.md)     |
| FR-06 | Keep user-facing client text in localization resources                        | [Conventions](../dev/conventions.md)            |

## Non-functional requirements

| ID     | Constraint or objective                                                             | Verification / status                          |
| ------ | ----------------------------------------------------------------------------------- | ---------------------------------------------- |
| NFR-01 | Shared payloads use reusable validation; REST, GraphQL and forms stay aligned       | Contract, schema and service tests             |
| NFR-02 | Capacity and start-slot changes must preserve consistency under concurrent requests | Service and transaction regression tests       |
| NFR-03 | Secrets stay server-side; personal data is minimized in responses and logs          | [Security review](../security/threat-model.md) |
| NFR-04 | Changes pass relevant lint, type, test and build checks                             | [Testing](../dev/testing.md), CI               |
| NFR-05 | Deployments use explicit versions/digests and ordered database migrations           | [Deployment](../ops/deployment.md)             |
| NFR-06 | Provide liveness, database-backed readiness and operational telemetry               | [Observability](../ops/observability.md)       |

## Targets requiring an owner decision

Numeric latency/throughput targets, expected event concurrency, availability SLO
and any contractual SLA are not established by this document. RPO/RTO, backup
restore cadence, retention periods and global coverage targets also need
explicit agreement. Do not substitute illustrative numbers for approved
requirements.

For a feature requiring a performance guarantee, the spec must identify
workload, data volume, measurement method, owner and acceptance threshold before
that threshold is presented as a supported promise.
