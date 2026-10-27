# Event insights

- Status: implemented
- Issue: approved in the implementation conversation; GitHub issue link pending.
- Related decision: [entry payment ledger](../architecture/adr/0004-entry-payment-ledger.md).

## Goal and acceptance criteria

Give event owners and administrators an extensible Insights (Přehledy) catalog
at `/events/{eventId}/insights`. The first card opens received payments at
`/events/{eventId}/insights/payments`. Existing `/report` and payment APIs remain
unchanged. The catalog also offers the timing-card check described below.

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

## Timing-card insight

- Status: implemented; approved in the implementation conversation.
- Issue: no matching GitHub issue found for `card insight`; link pending.

At `/events/{eventId}/insights/cards`, owners and administrators can inspect
missing and duplicate timing cards. Include every Competitor in the event,
regardless of result status, excluding unprocessed EntryItems. NULL and zero are
missing; only positive numbers participate in duplicates across all classes.
This is a read-only report, with no database changes.

Add JWT owner/admin GraphQL `eventCardInsight(eventId: String!)` returning
`missingCards` and `duplicateCards` (card number plus competitors). Each row
contains ID, first/last name, registration, bib number, class ID/name,
organisation and nullable card. Shared Zod schemas own the payload types.
Authorize before a single event-scoped competitor selection; services own
grouping.

Display missing count, duplicate-number count and affected-competitor count.
Search name, registration, bib, organisation and card, combined with class
filtering. Filter missing rows individually; select duplicate groups when one
member matches all filters and retain every member. Sort rows by class, surname,
first name and ID; groups by numeric card. Paginate missing rows and whole
groups separately in pages of 25. Counts and exports cover all filtered results.

CSV and print include both sections, summaries, event, filters and generation
time in the event timezone. Escape HTML and CSV; neutralize spreadsheet
formulas. Distinguish loading, error/retry, no issues and no filter matches. On
refresh failure, retained data is explicitly stale and export/print stay
disabled until recovery. Provide explicit refresh, accessible responsive tables
and all six locales. Class links open the existing event results tab with the
class name selected.

Acceptance tests cover JWT/owner/admin access and denied reads, event isolation,
NULL/zero, unique cards, cross-class and 3+ duplicates, all statuses, empty
data, combined filters retaining full groups, ordering, both paginations, full
exports, escaping, refresh failure and recovery. Verify catalog/deep links and
mobile, CSV and print in a browser where practical; run shared build/types and
affected client/server tests, types (including GraphQL), lint and formatting.


### Timing-card verification

Client suite: 302 tests passed across 37 files with two workers. Competitor
module and GraphQL schema tests: 11 passed across four files, including live
schema execution and denied reads. The Apollo lifecycle regression verifies
retained reports across repeated refresh errors and recovery. Shared build/types,
client/server types, strict GraphQL types and client/server lint passed.

Browser verification (navigation, responsive layout and native print/download)
could not run because the Browser runtime reported no available browsers. These
interactions are covered by component tests, including full filtered exports,
print escaping, pagination, category links and refresh/retry states. No matching
GitHub issue was found and no issue was created; the issue link remains pending.
