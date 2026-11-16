# System radio devices

Status: implemented; real native acceptance remains subject to upstream
package/timezone fixes. Issue: https://github.com/orienteerfeed/ofeed/issues/435
ADR: [System radio inventory](../architecture/adr/0014-system-radio-devices.md).

## Goal and acceptance

Admins manage reusable YAROC/Meshtastic units in Admin → System devices. A unit
has at most one current event assignment, or none. Owners can inspect assigned
devices and history but cannot configure, revoke, rotate tokens, start or stop
system reception. Existing manually managed event devices remain independent.

Connection profile/channel and expected status interval belong to the unit.
Admins configure special station codes and 1–72 hours (default 24) per event;
system reception starts/stops all its assigned units together. Assignment does
not start reception; stopping/expiry does not remove assignments. Reassignment
and connection edits require the affected collection to be stopped. Unassigned
units can be archived/restored. Event deletion releases inventory assignments.

Assignment records preserve actor/time and event-scoped device identities retain
history. Returning to an event reuses that identity. No raw heartbeat tokens are
issued for system devices. Reserved IDs cannot be claimed by manual registration
or token reactivation. Conflicting existing registrations require explicit
resolution.

## API and failure modes

Add admin-only GraphQL inventory, event search, assignment, configuration and
collection operations. Extend event status additively with system collection and
device management origin/current assignment. Never reveal another event's
assignment or connection credentials to event owners. Schemas live in shared
contracts.

Separate event/system YAROC sessions and fencing. Worker groups system
connections by profile/channel. Stop invalidates queued writes immediately;
validate assignment again at commit and reject punches outside the current
system collection window. Monitoring may be extended, never shortened by another
collection. Native absence fails start explicitly. Upstream package/timezone
fixes are outside this feature.

## Validation

Server/API authorization, identity collisions and concurrent assignment,
migrations, native-unavailable start, independent collections, timeout, event
deletion, stale worker writes and A→stop→unassign→B history isolation. Client
component/browser checks cover inventory CRUD, assignment/event search,
configuration, readonly event rendering and mobile layout. Use disposable local
DB only for integration tests.

Verified: 468 client tests, 53 focused server tests, four disposable MariaDB
integration scenarios and two Chrome lifecycle scenarios at 1280px/390px passed.
Client/server TypeScript, strict GraphQL types, shared contracts and targeted
ESLint passed. Migration chain (80 migrations) applied only to disposable local
MariaDB. Browser and database tests use a controlled native boundary; no
production deployment or real radio acceptance is implied.
