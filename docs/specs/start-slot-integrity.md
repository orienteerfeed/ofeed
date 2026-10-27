# Start slot integrity (G19)

- Status: implemented
- Source: G19 / B9 task supplied by the maintainer; GitHub issue URL not supplied.
- Related: [entry checkout](entry-checkout.md), G16 change items, G21 errors.

## Goal and acceptance criteria

Only effective `StartList` classes allocate exclusive start slots. Other modes
may share times. Do not add uniqueness constraints to Competitor or EntryItem.
Existing vacancy uniqueness remains unchanged.

A competitor or an unprocessed item of a RECEIVED/APPROVED order holds a time.
Validate and write under the database event lock, including requests without an
idempotency key. Order edits/status changes and processing use the same lock.
Processing transfers an item's own reservation and links its competitor atomically.
Cancelled/rejected orders no longer reserve time.

Preserve PUT payload semantics, including omitted times on class changes. Do not
automatically allocate a time. An unchanged own time in the same class is valid.
A changed StartList class/time must claim an existing free vacancy. Consume the
new vacancy and restore the old vacancy atomically; failures roll everything back.
Conflicts return HTTP 409 with additive `errorCode: SLOT_TAKEN`, preserving the
numeric legacy code. GraphQL uses extensions.code = SLOT_TAKEN.

Availability lists each free time once, excluding every competitor's time and
active reservation. Existing collisions are not automatically moved or deleted.
New G16 change APIs and general G21 error redesign are outside this change.

## Local cart slot selection

For effective `StartList` categories, hide slots already present in the current
browser's cart for the same event and class. Compare timestamps as instants so
equivalent ISO representations cannot bypass the check. Other events/classes
and non-exclusive start modes may share times. Removing an item immediately
makes its slot selectable again if the server still lists it as available.

Recheck against the latest cart state when adding an item. A stale selection or
repeated submission must not add a duplicate or show a successful add. Clear a
selection that becomes occupied while the form is open and require another
choice. Keep persisted cart items compatible; no storage migration or automatic
deletion of existing items. No API, database or reservation changes.

This is a local cart constraint, not a reservation or account-wide lock across
tabs/devices. Another entrant may take the slot before checkout; the server's
existing transactional `SLOT_TAKEN` check remains authoritative.

## Test plan

Cover unchanged PUT, unavailable/occupied/reserved target slots, atomic A-to-B
exchange, class moves, cancellation, reservation transfer, shared non-StartList
times and deduplicated availability. Use disposable MariaDB connections for races
between orders, competitor creation/moves and processing. Run focused Vitest,
OpenAPI and TypeScript checks. Never use shared/production data for race tests.

Cart regressions cover hidden slots, removal/reselection, restored cart items,
stale/repeated adds, equivalent timestamp formats and separation by event/class
and start mode. Verify the actual entry dialog's options and stale selection
behavior, client type-check and focused lint; rerun existing server duplicate
slot pricing tests without changing server behavior.


## Validation

- Complete server suite: 913 passed; opt-in database suites skipped by default.
- G19 disposable MariaDB suite: 14 passed, using separate connections.
- Complete client suite: 229 passed.
- Server, GraphQL and client TypeScript checks passed.
- No schema migration or new competitor/entry unique constraint.

Local-cart validation on 2026-10-27:

- All 290 client tests (34 files), client type-check and focused ESLint passed.
- All 56 existing entry-service tests passed, including duplicate slot claims
  within one order and shared times in non-exclusive start modes.
- Six Playwright checks passed across Chromium, Firefox and WebKit at 1280px
  and 390px using the real entry dialog and persisted cart. Covered successful
  add, page reload, hidden slot, removal/reselection and a selected slot becoming
  occupied while the dialog remains open.
- No backend, API or database behavior changed; database concurrency suites
  were not rerun for this client-only change.
