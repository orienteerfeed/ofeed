# Device heartbeat integration

Owners/admins configure devices, radio code mappings and YAROC under
**Event settings → Devices & radios**. Radio flags remain in **Settings → Files**.
**Insights → Device status** provides read-only monitoring and history. YAROC
configuration can be saved independently of starting its native receiver.

## Automatic application onboarding

Use the existing event password via HTTP Basic auth: username = eventId,
password = current event password. Password expiry and event scope are checked by
the existing authentication layer. No user JWT or new per-device bearer token
is required for these applications.

Applications persist a UUID for each installation and send either:

- `POST /rest/v1/events/{eventId}/live-status/devices` with
  `{ "sourceType": "quickevent", "sourceId": "<installation-uuid>", "name": "Timing laptop" }`;
- their first heartbeat to the existing heartbeat endpoint, including `sourceType`
  (`quickevent`, `ochecklist`, `meos` or `uploader`) and `sourceId` alongside its original fields;
- a successful existing IOF upload with optional headers `X-OFeed-Source-Type`
  and `X-OFeed-Source-Id` (installation UUID). The IOF XML creator can identify
  the source type when the header is absent. An identical successful re-upload
  also supports registration using stored import metadata.

Registration is idempotent by event, application and sourceId. It does not
reactivate revoked devices. Registration responds with identity only, never a
bearer token. An app continues using the event password for heartbeats.
Recognized legacy uploads without a UUID are grouped as one application source
per event; distinct installations require stable source IDs. Upload registration
is best-effort after success and never changes an upload payload or response.
Failed or unauthorized uploads do not register sources. Upload-derived activity
is recorded only during active monitoring; the explicit registration endpoint
works before monitoring starts. A first heartbeat can register the source and
still return the existing 409 if monitoring is inactive.

## Existing scoped bearer clients

Existing bearer-token heartbeat payloads and response envelopes remain supported.
Manual registration and token management are in event settings. Start monitoring
(default 24h, maximum 72h). A scoped token writes only telemetry for its device
and event, never punches or results. Redis is internal to the API.

Send `POST /rest/v1/events/{eventId}/live-status/heartbeat` with
`Authorization: Bearer <device-token>` and `Content-Type: application/json`:

```json
{
  "version": 1,
  "messageId": "f9e5f5b0-5540-49e2-a719-6c7db9a36fed",
  "measuredAt": "2026-11-10T10:00:00.000Z",
  "metrics": {
    "batteryPercent": 74,
    "gsmRsrpDbm": -98,
    "gsmSnrDb": 12,
    "queueSize": 3,
    "appVersion": "1.4.2"
  }
}
```

Use a new UUID for each measurement, retaining the same UUID and payload on
retries. A successful response uses the existing envelope with
`results.data = { duplicate, receivedAt }`. It confirms SQL commit. Retry 5xx
and transient network failures with bounded exponential backoff and jitter;
respect 429 Retry-After. A 400 means malformed JSON: correct it before retrying. A 401 needs a new token; 409 means monitoring is inactive.
Measurement times require a UTC offset; clocks more than a minute in the future
are rejected. Availability is calculated from measurement/activity time rather than
delivery time, with tolerated future clock skew clamped to receipt time. Delayed
readings can fill history without making an offline device appear online.

Default cadence is 10 seconds for apps and 60 seconds for YAROC. Upload progress
can be included in telemetry; throttle reports rather than sending every byte.
All fields are optional; send absent values as omitted, not zero or null.
RSRP/RSSI are in dBm, SNR in dB, battery in percent. The shared Zod schema is
`packages/shared/src/models/live-status.ts`; `/doc` describes the REST boundary.

History consists of minute aggregates and outage/unknown intervals, retained for
30 days. It does not provide an audit record of every individual heartbeat.
GraphQL subscriptions are notifications; clients reconcile snapshots every 30s.

## YAROC

Register unique names and MACs (12 hex for YAROC, 8 for Meshtastic). Configure
distinct Check/Start/Finish codes before reception. Default broker is public
`broker.emqx.io:1883`; MAC allowlisting is not sender authentication. Use only
non-sensitive test data for public-broker acceptance tests. Configure monitoring
windows that do not cross a daylight-saving offset transition.

YAROC is a lazy optional dependency pinned to 0.1.3. Its currently published npm
archive contains only package.json. Real reception is blocked until a functional
artifact is available. Linux glibc x64/arm64 are supported targets, not native
macOS. Do not silently substitute another version. The radio stream uses QoS 0;
SQL deduplication protects committed retries but cannot recover packets lost
before server receipt. Buffer/retry at the sending application when possible.

Server administrators may set `YAROC_BROKER_PROFILES` to a JSON object of named
profiles with `url`, `port`, optional `username`/`password` and `keepAliveSecs`.
Only profile names are exposed to authorized users. Profiles must use a transport
supported by YAROC; 0.1.3 does not expose TLS configuration. An authenticated plain
TCP broker requires a trusted network or an appropriate transport proxy.

## Automatic generic and MeOS import monitoring

The manual settings form registers only YAROC and Meshtastic radio units.
`uploader` remains a compatible wire value for generic integrations; it is not a
user-selectable device type. Authenticated IOF uploads from other exporters register
a source under their XML creator name. Generic applications can also self-register
on their first event-password heartbeat with sourceType `uploader`, a stable sourceId
and an optional name. Browser/JWT file imports do not create application instances.

Existing MeOS MOP requests keep the `competition` and `pwd` headers and their XML
responses. A validated binding/password creates one source per MeOS binding. Status
updates report `uploadState` (processing/completed/skipped/failed), `uploadBytes`,
`uploadCompletedAt` and `uploadDurationMs`. Monitoring must be active to retain these
samples. Failed telemetry never changes the MOP result. Unauthorized requests do not
create sources. Receiving the HTTP body precedes authentication in the existing MOP
handler, so these states describe server import processing, not live network transfer
percentages. No transfer percentages are inferred or fabricated.

## Receiver action validation

The UI enables saving only for valid changed settings while reception is stopped.
Start requires an available native receiver, an active registered radio fleet, valid
unit codes/broker/duration and a timezone window without an offset change. The UI
refreshes state before Save/Start/Stop and prevents duplicate clicks. Stop remains
available during startup/running even with invalid draft inputs. Server-side checks
remain authoritative and serialize configuration/session changes under the event lock.
The availability probe verifies the native MqttClient export; it does not establish
an MQTT connection or prove broker reachability. Saving configuration does not require
native receiver availability. Changing native artifacts requires a server restart.
