# Live device status and YAROC

Status: implemented; real native reception acceptance blocked by the published package. Issue: link pending; no issue number invented.
ADR: [Live telemetry](../architecture/adr/0010-live-device-telemetry.md).

## Goal and acceptance

Owner/admin-only Insights device dashboard, 30-day minute telemetry and outage history,
external event/device-scoped heartbeat tokens and YAROC 0.1.3 radio ingestion.
REST is external ingest; GraphQL is first-party read/control. MariaDB is durable;
Redis is notification/cache infrastructure. Default monitoring is 24h, maximum 72h.
Online <=2 heartbeat intervals; delayed <=4; offline thereafter. Missing measurements
are unknown. Availability uses measurement/activity time, never delayed delivery time;
small future producer clock skew is clamped to receipt time. Duplicate or old messages cannot revive a device. Monitoring expiry is not
an outage. Starting a new window resets its checkpoint; workers ignore pre-window checkpoints.
Malformed JSON returns a non-retriable 400 before OpenAPI validation. YAROC defaults to broker.emqx.io:1883 and requires unique fleet names/MACs.

## API and failure handling

POST /rest/v1/events/{eventId}/live-status/heartbeat accepts a device token and shared
Zod payload. Acknowledgement follows SQL commit. Tokens cannot write results.
GraphQL eventLiveStatus/eventDeviceHistory and management mutations require owner/admin JWT.
Subscriptions are notifications; snapshot polling every 30s reconciles lost notifications.
YAROC uses existing SRR punch projection, stable identities, author attribution and
DB fencing leases. A stopped client is never reused. DST-crossing sessions are rejected.
Published npm 0.1.3 currently lacks entrypoints: native startup must fail explicitly
without disabling API or external heartbeat ingest. No substitute version/build is implied.
Public EMQX traffic is unauthenticated and MAC allowlisting is not sender authentication.

## Validation

Test schemas, device authorization, deduplication, timing boundaries, expiry,
minute aggregation, retention, lease takeover, SRR/readout precedence, subscriptions,
Insights navigation and graphs. Real native smoke test requires a functional 0.1.3
artifact on Linux, fake source deadbeef1234 and +02:00. No production migration/deploy.

## Implementation and validation notes

The dashboard is at `/events/{eventId}/insights/devices`. MariaDB owns latest
state and minute history; Redis caches versioned device metrics and distributes
both telemetry and existing result notifications. Cache operations have bounded
waits and SQL fallback. Optional `YAROC_BROKER_PROFILES` holds server-managed
broker credentials; only profile names reach the browser.

Validation: client full suite 439 passed. Server full suite: 1202 passed, 71 skipped,
5 failures in price-adjustment.test.ts; the same five failures reproduce against a
clean HEAD source export. Final focused suites and disposable SQL/Redis integration
cover event isolation, concurrent deduplication, stale measurements, token revocation,
worker fencing, receipt replay, metric cache versions and cross-process notification
payloads with Date preservation. SQL migrations were applied only to a disposable DB.
Interactive browser verification could not run: Browser discovery returned no browsers.

Pending release checks: functional Linux native 0.1.3 import and public-broker fake
punch smoke test, maintainer issue link and ADR review. External producer applications
must implement the documented heartbeat API in their own repositories.

## Settings and automatic application registration (2026-11-11)

Device registration, monitoring/YAROC configuration and radio code mappings belong
in event settings; Insights is a read-only status/history view. Existing radio
control flags remain in the Files settings tab. QuickEvent/oChecklist instances
self-register with event-password Basic auth (event ID as username), using stable
sourceId UUIDs. Support an explicit registration endpoint, first heartbeat and
successful IOF upload. Registration is event-scoped and idempotent; it cannot
reactivate revoked devices. It issues no token and requires event-password auth
on subsequent application requests. Existing scoped bearer-token heartbeat and
GraphQL contracts remain supported without changed required fields or responses.

IOF upload recognition uses optional headers X-OFeed-Source-Type and X-OFeed-Source-Id
or the XML creator. Legacy uploads without instance identity represent one source
per application/event. Auxiliary registration failure never changes an upload response;
failed/unauthorized uploads cannot register devices. Header identity is metadata,
not authentication. External application changes are outside this repository.

## Upload sources and presentation (2026-11-11)

Hide generic uploader from manual registration; retain its wire value for compatibility.
Automatically register authenticated IOF producers (including generic exporters) and MeOS
MOP bindings. Preserve all existing REST/MOP payloads, XML statuses and auth behavior.
For MOP, report processing/completed/skipped/failed after password verification, bytes
received and processing duration. Transport percentages are unavailable after buffered
request reception and must not be fabricated. Telemetry errors never change import results.
Remove the automatic-registration explanatory paragraph from settings. Use existing
BackLink, Card/Table/Badge/Alert/Select primitives, semantic theme colors and responsive
forms/charts. Keep settings embedded without a second page container or h1.

## YAROC action preconditions

Save is enabled for valid changed configuration while reception is stopped.
Start requires a current readable status, valid distinct unit codes and duration,
a configured broker, an available native MqttClient, a non-revoked valid radio fleet
and an event timezone whose offset remains constant throughout the requested window.
Stop is enabled while a non-expired session is starting/running, regardless of form
errors or native availability. Before each receiver action the client refreshes state;
the server validates current prerequisites and serializes session/config writes using
the event lock. Concurrent local actions are blocked. Disabled actions show a reason.
Stop remains an idempotent API operation. Unit labels describe Check/Start/Finish units.
