# Event insights implementation

- Approved scope: [spec](../../specs/event-insights.md); GitHub issue link pending.
- Steps: shared contract/API; catalog/navigation; payment filters/export/print;
  tests and browser validation.
- Status: implemented.
- Open questions: none; use paidAt in event timezone, all receipts on first load.
- Checks: shared build, client/server types and lint; 211 client tests and 28
  focused payment/OpenAPI server tests passed. Initial unconstrained client run
  hit unrelated ClassStartTimesDialog timeouts; the complete two-worker run passed.
- Remaining manual check: mobile layout, direct navigation and print layout in a
  connected browser. Browser runtime reported no available browser.
- Next action: review changes; no new database migration for insights.
