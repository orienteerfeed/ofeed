# Event insights

- Status: implemented
- Issue: approved in the implementation conversation; GitHub issue link pending.
- Related decision: [entry payment ledger](../architecture/adr/0004-entry-payment-ledger.md).

## Goal and acceptance criteria

Give event owners and administrators an extensible Insights (Přehledy) catalog
at `/events/{eventId}/insights`. The first card opens received payments at
`/events/{eventId}/insights/payments`. Existing `/report` and payment APIs remain
unchanged. No future data checks are displayed yet.

The read-only payment view lists receipt time, entry reference/contact, method,
amount/currency, device, operator ID and server recording time. Links open the
entry detail. Default order is descending paidAt with ID as a stable tie-breaker.
Filters cover inclusive local dates in the event timezone, method, device and
reference/contact search. All dates and timezone labels use the event timezone.
Summaries count receipts and sum cash/QR/all receipts separately per currency,
using integer minor units over the full filtered set, independently of pagination.
Historical manual paid flags do not fabricate receipts.

CSV and print include all filtered rows in their displayed order, summaries,
event name, active filters, timezone and generation time. Escape CSV text and
neutralize spreadsheet formulas. Loading, empty and error states are distinct;
failed loads do not show a zero-money report. Refresh is explicit.

## API

Add owner/admin JWT-only `GET /rest/v1/events/{eventId}/insights/payments` in the
entry module. Return `results.data` containing all receipt fields plus
`paymentReference`, `contactFirstname` and `contactLastname` from the linked
entry. Use a shared Zod response contract and a batched relation read. The client
filters a complete dataset; `since` is not used. No migrations are required.

## Test plan

Test server authorization, event scoping, enrichment and empty responses. Test
combined filters, DST/local day boundaries, cents, multiple currencies, stable
ordering and CSV formula escaping. Verify pagination-independent exports and
printing, navigation, mobile layout, deep links and failure/retry in a browser.
Run shared build, affected client/server types, lint and focused tests.

## Verification

Client suite: 211 tests passed with two workers. Focused payment/server OpenAPI
suite: 28 tests passed. Shared build, client/server types and lint passed.
Interactive browser verification remains pending: no connected browser was
available. Component tests cover catalog links, entry links, pagination,
filtering, CSV/print output and failure/retry states.
