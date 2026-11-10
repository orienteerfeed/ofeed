# Entry-list cash payments in received-payment reports

- Status: complete.
- Spec: ../specs/entry-payments.md; existing ledger ADRs retained.
- Observed local event: six CASH orders, one legacy paid flag without receipt,
  zero actual receipts. No financial records changed during diagnosis.
- Changes: list cash/device action and explicit legacy confirmation; paymentCount
  in GraphQL; shared receipt/report invalidation for GraphQL and REST; visible-tab
  report polling every 15 seconds and focus refresh for external POS writes.
- Checks: 20 focused client tests and 24 server tests passed; client TypeScript,
  strict server GraphQL TypeScript, targeted ESLint and Prettier passed.
- Browser: actual list action, device attribution, receipt-backed action state,
  payment report and automatic external POS refresh passed with mocked writes.
- One initial client test timed out while type checks ran concurrently; the
  unchanged targeted suite passed on rerun with checks no longer competing.
- Historical flags are never automatically backfilled. The explicit action
  records a current confirmation. No real local financial data was modified.
- No new issue was created: external issue creation was not approved earlier
  in the session. No issue number has been invented.
- Remaining work: none for this repository. A POS using the existing receipt
  POST endpoint needs no contract change.
