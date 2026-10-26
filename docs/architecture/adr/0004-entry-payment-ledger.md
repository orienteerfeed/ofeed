# 0004: Store immutable entry receipts and derive paid status

- Status: accepted
- Date: 2026-10-25
- Decider: repository owner, by approving the G5 implementation plan

## Context

A Boolean entry payment flag cannot support cash closing across devices.
Existing records do not identify a monetary amount, receipt method, payment time
or operator.

## Decision

Add immutable, event-scoped payment receipts owned by the entry module, exposed
through authenticated REST service adapters. Store exact decimal money and both
client payment time and server recording time. Enforce event/client-payment UUID
uniqueness in the database. Retrying identical content returns the original
record; reusing an identity with changed content conflicts, including under
concurrent inserts. Scope the entry foreign key by event to prevent mismatched
records.

Derive paid status from receipt totals once an entry has receipts. Keep the
legacy manual mutation only for entries without receipts. First receipts
recalculate historical flags without inventing payments. Receipt creation,
repricing and manual updates acquire a common entry-row lock; monetary changes
and paid-state audit records commit atomically. Receipt-backed entry currency
changes are rejected. Retain the authenticated operator's numeric identity as a
snapshot. Restrict entry deletion when receipts exist. Do not introduce a new
cashier permission system.

## Alternatives and consequences

Extending the Boolean cannot represent partial or multiple receipts. Replacing
it would break existing GraphQL clients and require a migration policy for
historical flags. The additive ledger preserves manual workflows for entries
without receipts, but receipt-backed entries reject manual paid overrides.
Callers must handle that explicit conflict and historical flags changing on
first receipt. Refunds, financial retention, accounting exports and cashier
permissions need separate product decisions.
