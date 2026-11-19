# 0009: Record a receipt when explicitly settling a cash entry

- Status: proposed; implementation requested by the repository user on 2026-11-03
- Supersedes: the CASH portion of the legacy paid-flag behavior in [0004](0004-entry-payment-ledger.md)

## Context

Cash entries marked paid through the legacy GraphQL mutation do not appear in
receipt-based payment reports. The user explicitly requests that this action
record the actual cash payment, including for POS callers.

## Decision

Treat paid=true for a CASH order as a cash settlement command. Record the positive
outstanding balance with the authenticated operator, current server time and
supplied device (or a clearly named server fallback). Use the existing entry-row
lock and immutable ledger; repeated full settlement is a no-op. Receipt-backed
paid=false remains a conflict. Non-cash legacy flags remain unchanged. Never
backfill historical flags as fictitious receipts.

Keep the mutation signature backward compatible with optional deviceId. Preserve
POST payments for exact-amount/offline POS receipts; callers must use one write
path per physical payment. No new ledger, migration or permission system.

## Consequences

Cash settlement appears in existing receipt reports automatically. Once a cash
receipt exists, clearing a flag cannot undo it; refunds require a separate feature.
POS clients using only the legacy cash paid toggle continue to work, while clients
that independently submit the same cash receipt must avoid double submission.
