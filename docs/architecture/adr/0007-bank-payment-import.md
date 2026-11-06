# 0007: Import client-reported bank payments into the entry receipt ledger

- Status: proposed
- Date: 2026-10-28
- Deciders: pending
- Issue / spec: [bank payment import](../../specs/bank-payment-import.md) (G24)

## Context

Organizers receive entry fees on their own bank accounts and pair them by the
order payment reference (variable symbol). The desktop app can poll the
organizer's Fio account with a read-only token. Storing that token on the
server would make OFeed a holder of bank credentials, which is a separate
product and regulatory decision. [ADR 0004](0004-entry-payment-ledger.md)
already defines immutable receipts and receipt-derived paid status, including
partial and excess payments.

## Considered options

1. Desktop collects with a local token; the server stores reported
   transactions, matches them and writes ordinary ledger receipts.
2. Server-side collector holding the bank token.
3. Keep manual QR receipts only.

## Decision

Option 1. The token never leaves the organizer's computer. The server stores
bank connections and reported transactions without payer data, matches them by
exact payment reference, currency and outstanding amount, and records a match
as an `EntryPayment` with method `QR`, `source = BANK_IMPORT` and a unique
`bankTransactionId`. Paid status keeps coming only from
`reconcileEntryPaymentState`; there is no second paid path. Receipt writes keep
the entry-row lock of ADR 0004.

Reported transactions are stored as `trust = CLIENT_REPORTED`: the server
cannot prove the bank booked them. Mitigations are server-issued payment
references, exact amount and currency, matching limited to the connection
owner's events, and test connections limited to demo events.

Idempotency comes from the unique `(connectionId, providerTransactionId)`
constraint. Batches span events, so the event-bound create-response storage of
[ADR 0005](0005-create-idempotency.md) is not used; a replay returns
`DUPLICATE` per item.

Push notifications (G25) use a transactional outbox: the row that changes a
transaction's matching status also queues one `BankPaymentNotification` per
(transaction, status). An in-process worker on every replica claims rows with a
conditional update and calls the Expo push API without an SDK. No push is sent
for a client claim that was not stored, and retries cannot push twice.

## Consequences

- Positive: no bank credentials on the server; cash, QR and bank receipts share
  one ledger, closing report and paid derivation.
- Negative: a compromised organizer account or desktop can assert payments for
  that organizer's own orders. Bank-import receipts are immutable like every
  receipt; corrections need the refund decision deferred by ADR 0004.
- Follow-up: retention and erasure of bank transactions, per-organizer limits or
  a review queue, and an opt-in server-side collector need separate decisions.

## References

- [Entry payment records](../../specs/entry-payments.md)
- [Create idempotency](../../specs/create-idempotency.md)
- [Bank payment notifications](../../specs/bank-payment-notifications.md)
