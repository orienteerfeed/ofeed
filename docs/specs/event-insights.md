# Event insights

- Status: implemented
- Issue: approved in the implementation conversation; GitHub issue link pending.
- Related decision: [entry payment ledger](../architecture/adr/0004-entry-payment-ledger.md).

## Goal and acceptance criteria

Give event owners and administrators an extensible Insights (Přehledy) catalog
at `/events/{eventId}/insights`. The received-payments card opens
`/events/{eventId}/insights/payments`. Existing `/report` and payment APIs remain
unchanged. The catalog also offers the timing-card check described below and
[anomaly analysis](anomaly-analysis.md) for suspicious split and start times
(issue [#164](https://github.com/orienteerfeed/ofeed/issues/164)).

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
failed loads do not show a zero-money report. Received payments refresh explicitly,
on focus and every 15 seconds while visible to include external POS writes.

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

## Entries-over-time insight

Status: implemented. Issue: pending.

Shows how competitors were entered from the opening of entries through the
deadline to the race, so the organiser sees the entry curve, last-minute entries
and late entries.

- Unit is the competitor: `EntryItem` with `actionKey = NEW_ENTRY`. Change
  requests are not entries. Items of orders currently `CANCELLED` or `REJECTED`
  are excluded entirely (also retroactively, from the day they were created).
- Days are calendar days in the event timezone, including DST transitions.
  A late entry belongs to an order originally received after `entriesCloseAt`.
- JWT owner/admin GraphQL `eventEntryTimeline(eventId: String!)` returns the
  timezone, local dates `entriesOpenOn`, `entriesCloseOn` (nullable) and
  `eventOn`, and `days` rows `{ date, classId, className, entries, lateEntries }`.
  The service groups daily counts and provides owner/admin-only extended order rows (including personal data). Shared
  Zod schema: `eventEntryTimelineSchema`.
- The client sums the selected class (or all) and fills every day from the
  opening (or first entry when unset) to the race day, cut at today, so the time
  axis is linear. Rows after the earlier of race day and today are excluded from
  the displayed series, totals, summary and exports, including when all entries
  fall after that cutoff.
- Summary: entered competitors, share of on-time entries made in the last 3 days
  up to the deadline, late entries and the busiest day.
- Charts: cumulative total as a monotone cubic spline area with dashed markers for opening,
  deadline and race day, and daily new entries as bars on the same time axis.
  Add a dashed linear-regression trend to the cumulative chart with a localized
  legend and tooltip. Fit the visible cumulative receipt-time points, recomputing for the selected class; no future extrapolation.
  Clamp negative fitted counts to zero and omit the trend for fewer than two days.
  Actual counts, summaries, daily bars and exports remain unchanged.
  The late-entry period after the deadline is shaded. Two charts rather than one
  with two y-axes. A daily table, CSV export and print give the same data.
- Loading, empty and error states are distinct; a failed load never shows zeros.

Tests: `entry-insight.service.test.ts` (authorization, local-day grouping across
DST, late flag, status and action filter), `entry-timeline.utils.test.ts`
(series, filters, summary, post-race and future rows beyond the cutoff) and
`EntryInsight.test.tsx` (states and summary).


### Spline and trend verification (2026-11-03)

Cumulative chart now uses monotone cubic interpolation and a dashed least-squares
trend, with localized legend/tooltips in all six languages. Seventeen focused
entry timeline and page tests passed, together with client type checking and
focused ESLint. Regression tests cover exact fits, zero-clamping, constant and
insufficient data, category filtering and the existing time cutoff. Isolated
Chromium checks verified a cubic SVG curve, dashed trend and no horizontal
overflow at 1280px and 390px using fixture API responses; screenshots inspected.
No API or database changes.


## Extended entry report (reference PDF, 2026-11-03)

Status: implemented. Reference: user-supplied report_cmvrzq1k8000007qwzfbiuq99.pdf.
Issue: pending; environment policy previously rejected issue creation.

Extend the existing entry insight with competitor/order counts, actual receipts,
outstanding balances, paid/unpaid and cancelled/rejected order counts, checkout
payment-method breakdown, race-day cumulative detail, daily and category counts
of competitors and distinct orders, and a paginated entry list (received time,
name, class, club, card, payment method, discounted item price and order paid state).
Keep spline/trend, existing summaries, timezone handling and owner/admin JWT access.

Receipt amounts are authoritative, partial receipts reduce balances, overpayments
remain visible in received totals, and mixed currencies stay separate. Legacy paid
flags without receipts are shown separately, never fabricated as receipts. Allocate
order promo discount to eligible line items proportionally in cents with stable
largest-remainder rounding. Financial totals always use stored order totals.
Cancelled/rejected orders are excluded from counts/money/charts/list and counted
separately. Receipt history and database records remain unchanged.

All views/CSV/print use the same period and category selection. Default cutoff is
race day or today, without an option to include later entries; explain hidden
records. Financial scope for category selection is explicitly labelled. Use order
creation time as received time (editing items must not move the original order).
Print includes all rows and chart snapshots, metadata, filters and generation time;
CSV includes all matching rows regardless of page. Escape all exports. All six locales.
No migrations. Shared additive payload and GraphQL types must remain aligned.
Tests cover receipt/legacy/partial/promo/mixed-currency math, exclusions, timezone,
race-day series, distinct-order counts, filters, pagination-independent export,
access control and render/browser checks on mobile and desktop.


### Extended report verification (2026-11-03)

Full client suite passed: 404 tests in 52 files with one worker. After final print
layout changes, all 25 focused timeline/report/page tests passed again. Nine
server report/pricing/schema tests passed. Shared build/types, client/server
TypeScript (including strict GraphQL profile), focused ESLint and whitespace
checks passed. GraphQL schema snapshot regenerated through tests.

Isolated Chromium checks at 1280px and 390px used synthetic data matching the
reference counts (94 competitors, 76 valid orders, two excluded orders). Verified
category filtering and whole-order finance scope, pagination, full CSV export,
all five charts in print and the final competitor beyond the visible page.
Rendered and visually reviewed all six pages of the test print PDF; repeating
headers, complete rows and chart colours were verified. Test currencies/prices
were synthetic; no real entries, receipts or source PDF were changed.

Defaults: whole matching orders for category financial summaries; period ends
at race day/today; the after-race switch was removed at the user’s request. No new migration or runtime
configuration. Existing pending promo-code schema changes remain separate.


### Exact start milestone on the cumulative chart

Use a numeric timestamp axis and actual order receipt instants for the cumulative
curve, grouping simultaneous orders and retaining category/period exclusions.
Mark the configured event start instant with its localized date and time, and
shade the in-race portion so entries after midnight/start remain distinguishable.
The visible range still ends on race day or today. Preserve the smooth curve,
linear trend, daily bars, summaries and exports. Tests cover same-day entries
before/after start, simultaneous orders, timezone boundaries and end-of-day cutoff.


Exact-start verification: numeric receipt-time series preserves before/after
midnight entries and simultaneous order counts; two new regression tests pass.
Isolated Chromium confirmed a 00:00 start marker on the cumulative chart in
both desktop/mobile layouts and in the print output. The report still excludes
entries after race day; daily summaries and exports are unchanged.
