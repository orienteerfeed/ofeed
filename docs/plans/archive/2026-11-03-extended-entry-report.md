# Extended entry report

- Spec: ../../specs/event-insights.md (Extended entry report).
- Status: completed.
- Delivered: additive shared/GraphQL order report, authoritative receipt balances,
  cent-exact promo allocations, stable original order timestamps; financial cards,
  order/competitor counts, intraday race chart, methods/category charts and tables,
  paginated personal rows, full CSV and chart-inclusive print; six locales.
- Defaults: whole matching orders for class financial scope, cutoff at race day
  or today with explicit after-race switch; no unanswered blocking questions.
- Verification: 404 client tests; 25 final focused client tests; nine server tests;
  shared build/types, client/server/GraphQL types, focused lint, whitespace passed.
- Browser: desktop/mobile fixtures with 94 competitors and 76 orders verified
  filters, pagination, all-row CSV, five printed charts, final list row. Six-page
  test PDF rendered and visually inspected. No real entries or receipts changed.
- Limitations: no production deployment or comparison against the source event's
  live database. No new schema migration needed. GitHub issue remains pending
  because environment policy previously rejected issue creation.
- Next action: none for local implementation; deploy through normal workflow.
