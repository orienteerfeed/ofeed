# Cash settlement and exact start milestone

- Status: complete.
- Specs: ../../specs/entry-payments.md and ../../specs/event-insights.md.
- Decision: ../../architecture/adr/0009-cash-paid-settlement.md (proposed supersession
  of CASH legacy-flag behavior, based on explicit user requirement).
- Milestone: exact receipt-time cumulative curve, configured start timestamp
  including midnight, in-race shading, six locales. Before/after-start and
  same-instant grouping tests plus desktop/mobile/print fixture checks passed.
- Cash settlement: positive outstanding balance inserted as an immutable CASH
  receipt under the existing entry-row lock; authenticated operator and optional
  deviceId; repeated full settlement adds nothing, receipt-backed reversal denied.
- UI: explicit receive-cash label, configured desk/browser device, receipt refresh
  and receipt-recorded success message. Non-cash legacy flags retained.
- POS: old cash paid=true remains compatible, optional deviceId; POST receipts
  remains the exact-amount/offline path. Documented one-write-path-per-payment rule.
- Verification: 408 client tests, 250 relevant server tests; 12 database scenarios
  skipped without disposable URLs. Client/server/GraphQL types, focused lint and
  whitespace passed. Final cash UI regression re-run passed (2 tests).
- Browser: fake API only, device forwarded and receipt visible; no real receipt,
  historical backfill, POS repository mutation or deployment performed.
- Limitations: real-database concurrent settlement integration test not executed.
- Next action: deployment and ofeed-desk integration review through normal workflow.
