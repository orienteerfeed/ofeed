# Bank payment records (G24, G25)

Spec: [bank payment import](../specs/bank-payment-import.md). ADR:
[0007](../architecture/adr/0007-bank-payment-import.md). Issue: pending.

## Status

- [x] PR 1 (G24): schema and migration `20261028200000_bank_payment_import`,
      `modules/bank` (connections, batch ingest, matching, manual resolve,
      sync reports, 90-day log cleanup), rematch on order create and repricing,
      `EntryPayment.source`, docs, Postman folder `11b - Bank import`.
- [x] PR 2 (G25): migration `20261028210000_bank_payment_notifications`,
      `modules/devices` (push tokens, settings), outbox queued in the matching
      transaction, Expo delivery worker, optional `EXPO_ACCESS_TOKEN`.
- [ ] Verify the Expo push contract in `expo-push.ts` against current Expo docs.
- [ ] Add `EXPO_ACCESS_TOKEN=` to `apps/server/.env.example` (file is
      read-protected for the agent).
- [ ] Web follow-up: label `BANK_IMPORT` receipts "paid by bank import".

## Checks (PR 1)

- `pnpm --filter ./apps/server exec vitest run`: 1050 passed, 65 skipped.
- Bank and entry payment integration suites on a disposable MariaDB 11 with
  migrations deployed: 12 passed.
- Server `tsc --noEmit`, `type-check:graphql` and ESLint on touched files: clean.
- Client type-check: only pre-existing errors in `EntryClassCard.tsx`.
- Not run: Newman against a running server.

## Checks (PR 2)

- Bank, devices and entry unit tests: 202 passed; integration suites on
  MariaDB 11 with both migrations: 12 passed (one outbox row per retried batch).
- Server `tsc --noEmit` and ESLint on touched files: clean.

## Open questions

- GitHub issue numbers for G24 and G25.
- Retention period and erasure-on-request for `BankTransaction`.
- Per-organizer limits or a review queue for client-reported payments.

## Next action

Review and commit PR 1 and PR 2 separately; verify the Expo contract before production.
