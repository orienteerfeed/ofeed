# Delete an event class and dependent competition data

- Status: implemented
- Issue: not created; external issue creation is restricted in this workspace.
- Related ADRs: 0002 (service boundaries), 0004 (immutable entry receipts).

## Goal and acceptance criteria

Provide a destructive Delete action in an icon-button context menu in event
settings, Classes, Actions column. Keep the action cell and each category row on
one line. Require explicit confirmation naming the category and explaining
dependent data loss. Allow only the owning event organiser or admin.

Delete the class, its EntryItems, competitors, teams, protocols, splits, linked
Punch observations and their receipts, and start-slot vacancies in one
transaction. Unassigned event-level punches have no class ownership and remain.
Preserve other categories, shared courses/controls/organisations, and parent
Entry orders, financial snapshots and payment receipts. Deleting a category is
not a refund or an order repricing operation. Cross-class references to deleted
teams are detached.

## API and implementation

Add GraphQL classDelete(eventId: String!, classId: Int!): ResponseMessage.
Require a positive integer ID, authenticate/authorise before class lookup, scope
the lookup and every delete to the event/category, and use the existing event
write transaction lock. Acquire the class row lock before reading dependencies.
Publish classesUpdated only after commit. Missing or mismatched categories fail.
No database schema or migration changes.

The confirmation and icon-button menu label are localized in all six languages.
Disable deletion while a request is pending; close the category's start-times
dialog on success, remove the row, and refresh the category query. Failures
leave the category visible and show an error. Viewing the page or cancelling
never deletes data.

## Edge cases and test plan

Test empty and populated classes, missing class, invalid IDs, foreign event,
owner/admin access, denial before writes, ordered transactional cleanup and
rollback, and publication after commit. UI tests cover the icon-only action
menu, its delete item, cancel, successful confirmation and failed deletion, and
verify the actions cell does not wrap. Update GraphQL snapshot and run strict
server and client types, focused Vitest tests, formatting and browser UI
verification with mocked data. Do not delete any real local event as a test.

## Validation

- 14 focused ClassesSettingsTab tests passed, including cancellation, successful
  deletion and server failure.
- 31 focused class service/schema tests passed; GraphQL snapshot is updated.
- Real local MariaDB foreign keys were exercised with synthetic fixtures in a
  transaction that was rolled back, confirming dependent cleanup and
  preservation of another class, shared course/organisation, parent order totals
  and receipts.
- The durable class-delete.integration.test.ts suite is opt-in via
  CLASS_DELETE_TEST_DATABASE_URL pointing at a local ofeed_class_delete_test DB.
  It is skipped in the default run when no disposable test URL is supplied.
- Client and strict server GraphQL TypeScript, targeted ESLint, formatting and
  mocked browser confirmation/cancel/delete flow passed.
- No migration or historical data changes are required. No existing local class
  was deleted during verification.

## Mobile class settings layout

The event settings page, navbar and all four tabs stay within the mobile
viewport. The class table retains usable input/select widths and scrolls
horizontally within its own table container; scrolling it must not move the
page or tab bar. Grid and tab content may shrink below the table's intrinsic
minimum width. Preserve inline editing and category actions. No API changes.
Verify full EventSettingsPage with deterministic Apollo data, real navbar/tabs
and class editor at 320/390/402px and desktop, before and after horizontal
scrolling, including reaching the last action column. Run focused class editor
Vitest, TypeScript, lint and browser checks across Chromium/Firefox/WebKit.
