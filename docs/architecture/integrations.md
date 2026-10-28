# Integrations

The exact endpoints and authentication requirements live in the
[API contracts](../api/README.md). Do not infer that every REST route supports
all authentication mechanisms.

| System / boundary            | Data and protocol                                            | Credentials / considerations                                                               |
| ---------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| First-party client and board | HTTP, GraphQL queries/mutations and live subscriptions       | Public reads or authenticated operations according to the field/route                      |
| External API clients         | REST JSON, uploads and OAuth2 token flow                     | Bearer/Basic only where declared; preserve existing response envelopes                     |
| IOF-producing timing tools   | IOF XML imports, including CourseData                        | Route-specific access, XML validation and import-state tracking                            |
| MeOS                         | MOP uploads and MIP polling                                  | Competition binding and event password; XML status can indicate failure even with HTTP 200 |
| ORIS / ČSOS                  | Event/results imports, registration and club-directory cache | Configured server-side base URL and provider-specific behavior                             |
| Eventor                      | Event/classes/results import                                 | Server-side API key; never expose it in browser configuration or logs                      |
| S3-compatible object storage | Maps and uploaded assets                                     | Server-side storage credentials; asset access/publication rules still apply                |
| Email provider               | Welcome, reset and entry notifications                       | Server-side mail configuration; avoid exposing recipients or tokens in logs                |
| QR Platba / SPAYD            | Payment instructions generated from an order                 | Payload contains contact names; instructions do not confirm settlement                     |

## Change checklist

- Define timeout, failure, retry and idempotency semantics in the feature spec.
- Preserve source/external IDs and avoid duplicates when repeating an import.
- Validate untrusted XML, files, filenames, URLs and provider responses.
- Check authorization before fetching private data or applying event mutations.
- Reconcile API docs with runtime behavior, including protocol-level errors.

## References

- [CourseData import](../COURSE_DATA_IMPORT.md)
- [Entry API contract](../entry-api-integration.md)
- [MeOS REST contract source](../../apps/server/src/modules/meos/meos.openapi.ts)
- [IOF XSD](../agent-context/IOF.xsd)
- [Server environment example](../../apps/server/.env.example)
- [Threat model](../security/threat-model.md)
