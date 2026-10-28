# Bank payment import (G24)

- Status: implemented (server)
- Issue: pending
- Owner: pending
- Related ADRs: [0004](../architecture/adr/0004-entry-payment-ledger.md),
  [0007](../architecture/adr/0007-bank-payment-import.md)

## Goal and non-goals

The desktop app polls the organizer's own Fio account with a read-only token
that stays on that computer, keeps incoming payments whose variable symbol (VS)
starts with a configured prefix and reports them. The server stores them,
matches them to entry orders and records receipts. The client only collects.

Non-goals: a server-side bank collector, refunds, payer data, push
notifications ([G25](bank-payment-notifications.md)), web UI.

## Current behavior and proposed behavior

Before: organizers record QR receipts by hand after reading their statement.
After: a reported transaction with VS `8200012345`, `1490.00 CZK`, matching
exactly one open order of the organizer with that payment reference and that
outstanding amount, writes a receipt and the order becomes paid.

## Acceptance criteria

- [ ] AC-01: An organizer can create, list, update and revoke bank connections.
      Owner comes from the JWT. Creating a connection for an account that
      already has one returns the existing connection (200), a new one 201.
- [ ] AC-02: A batch of 1 to 200 transactions is processed item by item, results
      in request order. An invalid item yields `INVALID` with issues and does
      not fail the batch. A malformed body or envelope is 422.
- [ ] AC-03: A reported item already stored for the connection yields
      `DUPLICATE` with the stored outcome and writes nothing.
- [ ] AC-04: An item whose VS lacks the connection prefix or whose
      `bookingDate` is before `prefixEffectiveFrom` is stored as `IGNORED`.
- [ ] AC-05: Matching follows the rules below; a matching VS without the right
      currency never writes a receipt.
- [ ] AC-06: A match writes exactly one `EntryPayment` (method `QR`, source
      `BANK_IMPORT`, `paidAt` = booking date, operator = connection owner,
      `deviceId` = reporting device) and recomputes paid status atomically.
- [ ] AC-07: TEST connections and SIMULATED items match demo events only.
      SIMULATED on a LIVE connection is `INVALID`.
- [ ] AC-08: UNMATCHED or AMBIGUOUS transactions can be matched manually to an
      owned order or ignored.
- [ ] AC-09: Creating an order or changing its total re-runs matching for
      UNMATCHED transactions with its payment reference.
- [ ] AC-10: Reports and sync reports on a PAUSED or REVOKED connection return
      409. Another owner's resources return 404.
- [ ] AC-11: Sync reports record counts and update the heartbeat; logs are
      deleted after 90 days.
- [ ] AC-12: Receipt reads expose `source`.

## Matching rules

Candidates: entry orders of events whose `authorId` is the connection owner,
with `paymentReference == VS` (string compare) and status not `CANCELLED` or
`REJECTED`. TEST connections and SIMULATED items add `event.demo = true`. No
admin override. At most two candidates are read.

| Situation                                        | Status           | Receipt |
| ------------------------------------------------ | ---------------- | ------- |
| No candidate, or currency differs                | `UNMATCHED`      | no      |
| More than one candidate                          | `AMBIGUOUS`      | no      |
| Amount equals outstanding                        | `MATCHED`        | yes     |
| Amount lower than outstanding                    | `PARTIALLY_PAID` | yes     |
| Amount higher than outstanding                   | `OVERPAID`       | yes     |
| Amount above the receipt limit (99 999 999.99)   | `UNMATCHED`      | no      |

Outstanding is `totalAmount - sum(receipts)`, read under the entry lock, so a
second transfer completing a partial payment matches exactly. The receipt keeps
the full received amount; the surplus of an overpayment is `sum - total` and is
left for a manual refund. `matchedAmount` is the receipt amount.

Deliberate differences from the original G24 note:

- `DUPLICATE` and `INVALID` are response statuses only; they are never stored.
- `Idempotency-Key` is validated (1-255 visible ASCII, else 422) but responses
  are not stored: batches span events, and the unique
  `(connectionId, providerTransactionId)` already makes replays safe.
- Rematching after order creation or repricing runs inside the order write
  transaction, so the receipt and the order commit together.

## Edge cases

- Leading zeros in VS are significant; VS is a string of 1-10 digits.
- A payment for a cancelled or expired order is `UNMATCHED`; resolve it
  manually against another order or ignore it.
- Concurrent identical reports: the unique constraint admits one row; the loser
  returns `DUPLICATE`.
- An order cancelled between candidate lookup and the locked write becomes
  `UNMATCHED`.
- An already paid order receiving another transfer becomes `OVERPAID`.
- Changing the prefix is never retroactive: `prefixEffectiveFrom` must not be
  before today (UTC).

## API and data changes

All endpoints require a user JWT. Money is a decimal string with two places,
dates are `YYYY-MM-DD`, timestamps ISO 8601. OpenAPI: `/reference`.

| Method | Path                                             |
| ------ | ------------------------------------------------ |
| POST   | `/rest/v1/bank-connections`                      |
| GET    | `/rest/v1/bank-connections`                      |
| PATCH  | `/rest/v1/bank-connections/{id}`                 |
| DELETE | `/rest/v1/bank-connections/{id}` (revoke)        |
| POST   | `/rest/v1/bank-connections/{id}/transactions`    |
| POST   | `/rest/v1/bank-connections/{id}/sync-reports`    |
| GET    | `/rest/v1/bank-connections/{id}/transactions`    |
| GET    | `/rest/v1/events/{eventId}/bank-transactions`    |
| POST   | `/rest/v1/bank-transactions/{id}/match`          |
| POST   | `/rest/v1/bank-transactions/{id}/ignore`         |

Connection transaction listing returns `results: { data, nextCursor }`, where
`data` is the transaction array and `nextCursor` is a string or null at the end.
OpenAPI must expose both fields in the response object.

New tables `BankConnection`, `BankTransaction`, `BankSyncLog`; `EntryPayment`
gains `source` (default `MANUAL`) and a unique nullable `bankTransactionId`.

Personal data: transactions hold no payer name, account or message, only VS,
amount, currency, booking date and the provider transaction id. They link to
entry orders, which are personal data. The connection stores the organizer's
own IBAN. Never log batch bodies.

## Test plan

| AC                | Check                                                          |
| ----------------- | -------------------------------------------------------------- |
| AC-01, AC-10      | `bank.routes.test.ts`, `bank-connection.service.test.ts`       |
| AC-02, AC-03      | `bank.routes.test.ts`, `bank-matching.test.ts`                 |
| AC-04 to AC-09    | `bank-matching.test.ts`                                        |
| AC-11             | `bank-connection.service.test.ts`, `bank-sync-log-cleanup.test.ts` |
| AC-12             | `bank-matching.test.ts` (receipt `source`), shared `entryPaymentRecordSchema` |
| AC-03, AC-06 (DB) | `bank.integration.test.ts` (concurrent duplicate, partial then full) |

Commands: `pnpm --filter ./apps/server test`, `pnpm --filter ./apps/server
type-check`, `pnpm --filter ./apps/server lint`. Database suite: set
`PAYMENT_TEST_DATABASE_URL` as in [testing](../dev/testing.md) and run
`src/modules/bank/__tests__/bank.integration.test.ts`.

## Rollout and open questions

- Migration is additive. Rollback: drop the three tables and the two
  `EntryPayment` columns only while no bank receipt exists.
- Open: retention period of `BankTransaction` (tied to the event's accounting
  records) and erasure on request. Today DELETE only revokes; sync logs expire
  after 90 days.
- Open: per-organizer limits or a review queue above a threshold; server-side
  collector.
- The web client should label bank receipts "paid by bank import".
