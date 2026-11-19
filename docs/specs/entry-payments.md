# Entry payment records (G5)

- Status: implemented
- Issue: G5 proposal supplied in the task; GitHub issue link pending
- Decisions: [0004](../architecture/adr/0004-entry-payment-ledger.md), [cash settlement 0009](../architecture/adr/0009-cash-paid-settlement.md)

## Goal

Record actual CASH and QR receipts across cash desks, including amount,
currency, client payment identity, payment time, device and authenticated
operator. Provide an event-scoped closing-report source without fabricating
historical payments.

## Acceptance criteria

- POST `/rest/v1/events/{eventId}/entries/{entryId}/payments` accepts
  `clientPaymentId` (UUID), `method` (CASH or QR), positive `amount` (at most
  99999999.99, at most two decimals), uppercase three-letter `currency`,
  timezone-qualified `paidAt` (at most millisecond precision), and nonempty
  `deviceId` (at most 191 characters).
- Both endpoints require a user JWT and event owner/admin access. The server
  records `operatorId`; clients cannot supply or override it.
- Store money as Decimal(10,2), with the entry's currency. Reject a currency
  mismatch with 422 and an entry outside this event with 404.
- `clientPaymentId` is unique per event, across all devices and entries.
  Identical retries return the original receipt (200); new receipts return 201.
  Changed entry, method, amount, currency, paidAt or device returns 409.
  Operator is the original authenticated recorder and is never overwritten by a
  retry.
- GET `/rest/v1/events/{eventId}/payments?entryId=&since=&deviceId=` returns all matching
  receipts, ordered by server `recordedAt`, then ID. `since` is an inclusive UTC
  instant filtering server recording time, so offline receipts uploaded later
  remain visible. Omit it for a full closing report. Deduplicate overlapping
  incremental reads by receipt ID. No pagination or totals are implied.
- Responses use existing `results.data` envelopes and contain ID, event/entry
  IDs, all submitted fields, operator ID and server recording time. Dates are
  ISO UTC strings and amount is a JSON number.
- The organizer-only entry-detail UI lists immutable receipts, exposes the
  received total and remaining amount, and records CASH or QR receipts. It
  hides the legacy manual paid toggle after the first receipt.

## Edge cases and compatibility

Partial payments and overpayments are preserved as actual receipts. A QR receipt
asserts a received payment; generating/displaying a QR code is not confirmation.
No payment gateway verification, refunds or receipt editing/deletion are added.
Recording a new receipt atomically calculates `paid` as the decimal sum of
receipts being at least the entry total. Partial payments leave it false;
overpayments are retained. Repricing a receipt-backed order recalculates the
flag under the same entry-row lock; changing its currency is rejected. State
changes append the existing payment-state audit history with the authenticated
operator.

The first receipt recalculates historical manual flags too: a partial first
receipt can change true to false. No historical receipts are fabricated. For non-cash orders the
legacy manual paid mutation remains available only without receipts; otherwise it
returns GraphQL `extensions.code: CONFLICT`. For CASH, paid=true settles the
outstanding balance as described below; receipt-backed paid=false still conflicts. Identical
payment retries do not change status or append audit records. Receipt insertion,
paid-state changes and audit history commit or roll back together. Writers use
Read Committed transactions with an entry-row lock and bounded retries for
transient write conflicts.

An entry with receipts cannot be deleted individually or via a raw event
cascade (RESTRICT foreign key). Event reset and event deletion are the explicit
exception: the organizer or admin may wipe all event data, so
`deleteAllEventData` removes the event's receipts before its entries. Linked
bank transactions belong to the bank connection and are kept with a null
`matchedEntryId`. Receipts are erased irreversibly; export the closing report
first (GDPR/retention: the ledger is gone once the event is deleted).
Operator ID is an immutable identity snapshot, retained even if the user account
is removed; it contains no contact details. Device IDs identify a reporting
desk, not an authorization credential. Currency must match the entry snapshot;
no foreign exchange conversion is performed.

## API and test plan

Schemas and OpenAPI live in the server entry module; the organizer UI consumes
the REST API directly (there is no GraphQL schema change). The entry detail
filters the event payment endpoint by `entryId`, shows immutable receipts and
records CASH/QR receipts. Add a Prisma model and additive migration.
Test amount and timestamp validation, JWT/owner/admin authorization, cross-event
rejection, retry conflicts (including uniqueness races), operator attribution
and reporting filters/order. Generate Prisma, validate the schema, run relevant
Vitest and server type checks. The opt-in `entry-payment.integration.test.ts`
suite verifies physical uniqueness, foreign keys, concurrent
receipts/retries/legacy updates/repricing and rollback on a disposable local
MariaDB database. See the [testing guide](../dev/testing.md).


## Mark a cash entry paid (2026-11-03)

Explicitly marking a CASH order paid now records its positive outstanding amount
as an immutable CASH receipt at the current server time. Preserve the existing
GraphQL mutation; add optional deviceId (1–191 nonblank characters). Old callers
use the explicit fallback device `server:entry-paid-update`; authenticated operator
identity is always required for a new receipt. A full/overpaid cash order is an
idempotent no-op, including concurrent repeats under the existing entry-row lock.
Partial receipts are retained and only the balance is collected. Zero-value orders
can be marked paid without a zero-value receipt. Receipt-backed unpaid toggles
remain rejected; refunds and receipt deletion are outside this change. Non-cash
manual flags retain their existing behavior. No historical receipts are backfilled.

The UI labels cash settlement explicitly, supplies its configured payment device
or browser device ID, and refreshes the receipt list after success. Both payment
insights and the extended entry report use the newly stored receipt. POS clients
may keep the old paid=true call for cash settlement, optionally adding deviceId.
For offline/exact amount/paidAt/clientPaymentId, continue using POST payments,
which already derives paid status. Do not submit both a paid=true settlement and
an explicit POST receipt for the same physical cash payment. No migration.
Tests cover cash amount/currency/operator/device/time, partial/full/zero balances,
repeated/concurrent settlement, rejected reversal, non-cash compatibility and
report inclusion. Shared receipt insertion/reconciliation remains transactional.


Cash settlement verification (2026-11-03): 250 relevant server tests passed,
including receipt/report inclusion, partial/full/free/legacy settlement, operator
and device validation, repeat suppression and reversal rejection. Twelve opt-in
database scenarios were skipped without disposable database URLs; the cash
concurrency regression is included in that suite. Full client suite passed 408
tests across 53 files. Isolated Chromium confirmed device forwarding and receipt
refresh in the entry detail using fixture API responses; no real cash receipts
were created. Client/server types (including GraphQL), focused lint and whitespace
checks passed. No new database migration.


## Entry-list and POS report synchronization (2026-11-04)

The entry-list paid action uses the same cash settlement mutation as entry detail,
with configured desk/browser device attribution and cash-specific wording. Both
GraphQL settlement and REST receipt insertion invalidate entry receipts and the
received-payment report cache. The payment report refreshes every 15 seconds only
while visible and on return to the tab, so external ofeed-desk writes appear too.
Keep all CASH/QR receipts in the same report; never derive income from flags.
Existing historical flags without receipts remain outside actual receipt totals.
Tests cover list action/device propagation, cache refresh across both write paths,
external POS refresh, and combined CASH/QR report totals. No schema migration.


Expose Entry.paymentCount in GraphQL. In the entry list, a legacy CASH paid flag
with zero receipts offers an explicit Record confirmed cash action, preserving
paid=true while recording the missing receipt at confirmation time. This is a
user action, not automatic historical backfill. Receipt-backed fully paid orders
no longer offer an invalid paid=false action. Mutation responses return the count
so the list removes settlement actions immediately after a successful receipt.
