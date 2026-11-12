# 0010: Durable live device telemetry

Status: proposed

Use MariaDB for event device identity, scoped token hashes, monitoring windows,
minute summaries and outage intervals. Redis is a recoverable cache/notification bus,
not history. Keep feature GraphQL registration in modules. Serialize per-device writes
and fence YAROC workers in SQL, independently of Redis availability. Poll snapshots
to recover at-most-once notifications. Keep native loading optional and lazy.

Alternatives: Redis-only history loses post-race analysis; one SQL row per heartbeat
increases retention cost. Minute aggregates retain operational trends with bounded rows.
Consequences: heartbeat requests perform SQL writes; Redis failure degrades live delivery
but does not reject committed telemetry or punches. Profile fleet reuse and Streams deferred.

## Revised application onboarding

At the maintainer's request, QuickEvent/oChecklist use the existing expiring event
password via eventBasic authentication for additive self-registration and heartbeats.
Keep scoped bearer authentication for existing clients. Automatic registration is
idempotent by event, source type and stable instance ID; it cannot un-revoke an identity.
Configuration is in event settings; Insights remains read-only. Upload integration is
post-success and best-effort, preserving existing upload behavior and response envelopes.
