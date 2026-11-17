# Entry settlement PDF

- Status: implemented
- Issue: pending; repository permissions deny GitHub tools in this workspace.
- Decisions: [0015](../architecture/adr/0015-entry-settlement-pdf.md),
  [0016](../architecture/adr/0016-organizer-ares-lookup.md)

## Goal and acceptance

Event owners configure organizer company details and enable settlement PDFs.
Entrants optionally supply payer details in checkout; staff may correct them.
Only processed orders with settlement enabled support protected PDF download.
The processed confirmation email includes a PDF generated after commit.
PDF downloads reflect current organizer, payer, prices and actual receipt ledger.
Legacy paid flags do not fabricate receipts. Include entry fees, rentals, add-ons,
discounts, corrections, transfers/QR, cash and balance in the order currency.
Use Czech A4 layout and embedded Unicode fonts. No tax invoices or invoice sequence.
Existing orders remain compatible; settings default disabled. Old emails are not resent.

## API and tests

Shared Zod company and payer contracts; nullable JSON persistence and additive
GraphQL settings/payer APIs. Binary REST settlement endpoint uses existing owner/admin
or single-entry signed-link authorization and private no-store responses.
Test money, validation, authorization, attachments, generation failure, long text,
multipage layout and checkout/edit/download UI. Do not send live email in tests.

## User workflow and compatibility

Open event settings, General, Organizer details (Údaje organizátora). Supply the legal
name, full address and company ID, then save. Saving complete organizer details
automatically enables settlement PDFs and processed-email attachments; there is
no separate enablement checkbox. Incomplete details cannot be saved. The bank account
comes from event payment settings. VAT ID is optional. Club codes are not part of organizer settings or PDFs. Existing
events start disabled; apply the additive migration before deploying the new server.

Checkout has optional payer details shared by orders in that checkout. Without
billing details the settlement uses the contact name. Staff can correct or clear
payer details in the entry detail even after processing, without repricing.
Processed entries expose the PDF button both to staff and to the signed-link holder.
Enabling settlements also makes old processed entries downloadable; old emails
are not resent. The existing API enablement flag remains for compatibility;
organizer settings always submit it as enabled after validating complete details.

The processed confirmation attaches the PDF after commit. Generation errors are
logged and the confirmation still goes out with the protected detail link and a
missing-attachment message. Delivery retains the existing error logging behavior;
no durable email retry queue is introduced. No live mail was sent during validation.

The document is a current Czech settlement, without invoice numbering or a VAT
breakdown. It includes stored fees/rental amounts, add-on quantities/prices with
current service names (the existing model has no name snapshots), promo discount,
price correction, ledger QR/transfers and cash. A legacy paid flag without receipts
is explicitly undocumented. Overpayment is an amount to return, not evidence of a
refund. The PDF attachment can differ from later downloads.

## Validation completed

- Prisma generation and all 81 migrations applied to isolated MariaDB 11.4.
- Production server build, shared build, client/server TypeScript and GraphQL
  strict profile, focused ESLint, formatting and whitespace checks.
- Entry/OpenAPI/GraphQL suites: 278 passed, 15 opt-in payment/promo integration
  scenarios skipped without their dedicated database URLs. The subsequently added
  payer-creation regression passed in the 78-test entry-service suite.
- Full client suite: 474 passed; subsequent focused billing regressions: 7 passed,
  including nullable optional GraphQL fields.
- Real production-build/database smoke: disabled defaults, organizer JSON,
  processed-order payer update/clear, PDF generation and receipt-backed refresh.
- Visual PDF QA: Czech sample on one A4 page and a six-page long-services case,
  with embedded fonts, intact diacritics and aligned amounts.
- Browser flow QA unavailable: Browser runtime reported no available browsers.
  New form/download behavior is covered by component tests. Actual mailbox
  delivery remains a deployment acceptance check.

## Organizer lookup refinement (2026-11-17)

Place the organizer card immediately after event parameters. Remove the bank-account
hint and club code. Label the country field “Země” in Czech and use the existing
country directory for a select, preserving legacy stored names/codes.

Owners/admins can search ARES by name (at least three characters, debounced) or
an eight-digit IČO. Selecting a result fetches its current detail and fills legal
name, street/house number, city, postcode, country and available VAT ID. Missing
fields remain editable; do not invent a VAT ID. Reject stale async responses.
Registry errors and no matches are visible and manual entry remains available.

Add event-scoped GraphQL search/detail queries backed by fixed ARES URLs, bounded
results and a request timeout. On save, the server compares all organizer fields
with ARES and stores an optional server-generated verification timestamp in the
existing JSON. Never accept client-supplied verification metadata. Editing any
field clears the badge; saving matching ARES data and reopening preserves it.
Outages must not block saving manual settings. Existing JSON needs no migration.

Test lookup mapping (including villages without a street), authentication,
timeouts/errors, no results, verification spoofing/invalidation, stale requests,
country select, removed controls and the PDF omission. No live ARES in unit tests.
Issue remains pending because repository policy denies GitHub tools.

### Refinement validation

- Official ARES OpenAPI inspected for search/detail payloads and address mapping.
- Server: 23 relevant tests passed (lookup, authorization, mapping, outage handling,
  verification, billing, PDF data, download routes and GraphQL schema snapshot).
- Client: full 63-file suite passed, 480 tests with `--maxWorkers=2`; subsequent
  focused billing/settings run passed all 13 tests, including the new save-time
  badge invalidation regression. The first unrestricted run was interrupted after
  timeouts under heavy parallel load; the limited run resolved these failures.
- Shared build/type-check, client TypeScript, strict GraphQL TypeScript and focused
  client/server lint passed. Standard server TypeScript checked separately.
- Browser runtime reported no available browsers. Live lookup interaction and
  visual acceptance remain to be checked in a running application; service tests
  use mocked ARES responses, not live registry calls.

## Form control refinements

Remove the PDF enablement checkbox. Saving validated organizer details enables
PDFs automatically through the existing API flag. Use the same `Field` with
`type="select"` as event parameters for the country directory, connected to the
owning form. Place organizer name/autocomplete first, followed by IČO, address,
country and VAT ID so both registry lookup paths are immediately available. Country changes still
invalidate ARES verification; selected/imported values stay synchronized.

Validation of form refinements: full client suite passed (63 files, 481 tests,
two workers); the subsequent focused settings/payer run passed all 13 tests,
including country selection persistence and ARES badge invalidation. Client
TypeScript, focused lint, formatting and whitespace checks passed.

Country labels and alphabetical ordering in event parameters and organizer/payer
details use the same shared localization helper and the active application
language. Directory ISO codes remain the stored values; directory names are the
fallback if no localized name is available.
