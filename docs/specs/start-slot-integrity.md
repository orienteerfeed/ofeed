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

## Test plan

Cover unchanged PUT, unavailable/occupied/reserved target slots, atomic A-to-B
exchange, class moves, cancellation, reservation transfer, shared non-StartList
times and deduplicated availability. Use disposable MariaDB connections for races
between orders, competitor creation/moves and processing. Run focused Vitest,
OpenAPI and TypeScript checks. Never use shared/production data for race tests.


## Validation

- Complete server suite: 913 passed; opt-in database suites skipped by default.
- G19 disposable MariaDB suite: 14 passed, using separate connections.
- Complete client suite: 229 passed.
- Server, GraphQL and client TypeScript checks passed.
- No schema migration or new competitor/entry unique constraint.
