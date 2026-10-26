# Entry payment records (G5)

- Status: implemented
- Issue: G5 proposal supplied in the task; GitHub issue link pending
- Decision: [0004](../architecture/adr/0004-entry-payment-ledger.md)

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
receipt can change true to false. No historical receipts are fabricated. The
legacy manual paid mutation remains available only for entries without receipts;
otherwise it returns a conflict (GraphQL `extensions.code: CONFLICT`). Identical
payment retries do not change status or append audit records. Receipt insertion,
paid-state changes and audit history commit or roll back together. Writers use
Read Committed transactions with an entry-row lock and bounded retries for
transient write conflicts.

An entry with receipts cannot be deleted (including via event cascade),
preventing accidental loss of the cash ledger. Event reset/deletion reports 409
before destructive work; foreign keys also protect against competing inserts.
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
