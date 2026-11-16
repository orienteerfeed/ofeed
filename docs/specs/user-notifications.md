# User notification inbox

- Status: implemented
- Issue: [#293](https://github.com/orienteerfeed/orienteerfeed/issues/293)
- Related ADR: [0011](../architecture/adr/0011-user-notification-inbox.md)

## Goal and acceptance criteria

Replace the mock bell with a durable, authenticated inbox. An event's current
owner receives one `ENTRY_ORDER_RECEIVED` per new order (including guest orders)
and one `ENTRY_PAYMENT_RECEIVED` per received payment receipt (manual CASH/QR,
bank import, partial payments, excess payments and cash settlement).

- Notification and source record commit or roll back together. Replays produce
  no additional messages. No historical backfill.
- Only the recipient can read or mark messages. Order/payment messages require
  current event ownership on every read/mutation; global admins do not receive other owners' messages.
  Event passwords cannot access a personal inbox. Deleted accounts receive none.
- Bell shows 20 latest messages and the total unread count. `/notifications`
  provides cursor pagination. Selecting a message marks it read and opens the
  order; mark-all covers only messages existing when the operation starts.
- Open clients update via subscription and reconcile every 30 seconds, on focus,
  online recovery and subscription reconnect. Redis failure cannot lose history.
- Both read and unread messages expire after 90 days. Account anonymization
  deletes the inbox. Text is translated in all six client languages.

## Contracts and edge cases

GraphQL: `myNotifications(first, after)`, `markNotificationRead(id)`,
`markAllNotificationsRead`, `myNotificationsChanged`. Shared Zod contracts own
message types and pagination bounds. Amounts are decimal strings. Cursor ordering
uses creation time and ID. Source keys are unique per recipient; each payment
receipt is a separate source, even for the same order.

No message for a free order's paid flag, legacy non-receipt paid toggles,
unmatched bank transactions or events without an owner. New-order notifications
still apply to free orders. Existing email and Expo bank push remain independent.
Messages contain event name, item count or amount/currency/method, and internal
event/order IDs, without email, payment access tokens or bank payer details.

## Architecture and rollout

MariaDB stores the inbox and pending publication marker in the source transaction.
A bounded worker publishes user-scoped invalidations only after commit using the
existing PubSub/Redis bridge. Duplicate invalidations are harmless. Polling is the
recovery mechanism. Deploy the additive migration before the updated API; old API
versions ignore the new table. No new secrets, providers or runtime variables.

Migration: `20261112120000_user_notifications`. The worker checks up to 500
pending messages every two seconds and deletes up to 1000 expired messages per
minute. Recipient row locking serializes new messages with account erasure.
The existing account-scoped Apollo provider isolates caches on sign-out/account
switches. Web push, notification preferences and historical backfill are excluded.

## Test plan

Service and GraphQL tests cover identity isolation, current ownership, pagination,
read operations and malformed cursors. Worker tests cover retries and retention.
Disposable MariaDB tests cover atomicity and duplicate/concurrent writes. Existing
entry/payment/bank regressions verify all source paths. Client tests cover loading,
failure, localization and navigation. Run shared build/type-check, server and
client Vitest, GraphQL/client/server type checks, focused browser checks and
formatting; report unavailable infrastructure explicitly.

Validation results are recorded in the
[archived implementation plan](../plans/archive/2026-11-12-user-notifications.md).
Browser checks use real components/hooks with a deterministic transport;
MariaDB/Redis integration suites verify server persistence and fan-out separately.

## Follow-up scope

Event-scoped [competitor favorites](competitor-favorites.md), their event detail
tab and observed starts/radios/finishes/readouts/result corrections are implemented
as the next stage. Spectator messages require a public event and an active favorite,
independently of order/payment permissions.

[Registration-based following](registration-follows.md) and profile management
are implemented as the following stage, including pause, resume and cancellation.

Remaining: followed events, start-list publication, entry opening and capacity
availability; web push and additional Expo types. These are not part of v1.
