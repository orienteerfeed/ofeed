# Entry checkout

- Status: implemented baseline of current service behavior
- Scope: non-relay entry-order creation; not a new checkout redesign
- Source: [entry service](../../apps/server/src/modules/entry/entry.service.ts)
- API detail: [integration contract](../entry-api-integration.md)

## Goal and non-goals

Let a contact submit competitor entries with server-calculated prices and a
supported payment method. Creating an order or returning QR payment instructions
does not itself mean payment was received or competitors were processed.

## Acceptance criteria

- Entry class cards display localized occupancy and remaining places in all six
  supported locales. Remaining places use locale-specific plurals, including
  zero; negative availability displays zero. Translation keys must pass the
  client type check. No API changes are required. Verify with the card component
  tests using real locale resources and the workspace type check.
- AC-01: `POST /rest/v1/events/{eventId}/entries` accepts schema-valid items.
  Registration/birth year is required only when a birth year must be resolved
  for an age-restricted class. `card` and `cardRental` may both be omitted.
- AC-02: rental requests require the event rental service to be enabled.
- AC-03: checkout validates the entry window, class capacity and start-slot
  availability, including existing reservations and competing items in the
  order.
- AC-04: fees are computed server-side and stored as order-item snapshots; null
  base class fees are treated as zero.
- AC-05: `entriesConfigured` is true if at least one entry-window timestamp is
  set. Both unset produces 409; an unavailable payment method produces 422 at
  payment-method validation, provided earlier checks have passed.
- AC-06: generated SPAYD messages disclose the contact name; callers account for
  that when displaying, printing or storing QR payloads.
- AC-07: the Czech public entry tab is labelled “Dohlášky a změny”; its closed
  state reads “Dohlášky a změny jsou uzavřeny.” Its closing-date notice reads
  “Dohlášky se uzavírají {{date}}”. Verify the existing translation keys in the
  Czech locale resource; these copy changes have no API impact.
- AC-08: home-grid cards for non-relay events with configured, open entries
  replace the detail action with a localized “Dohlásit se” action. It opens
  `?tab=info#entries` and scrolls to the entries section after event data loads.
  Closed, not-yet-open, unconfigured and relay events keep the detail action;
  the results action stays available. No API changes are required.
- AC-09: QR payment emails link to the existing token-protected HTTPS entry
  detail with the label “Zobrazit platební údaje”, never to `spayd://`.
  Checkout and entry detail offer local PNG download and file sharing through
  Web Share where supported. Generate the PNG synchronously on the user's
  click to preserve mobile user activation. Unsupported file sharing downloads
  the QR with instructions; cancellation is silent, other failures are visible.
  Bank-app import support depends on the installed app; the UI does not promise
  direct launch or payment completion. All six locales stay in sync. API and
  payment payloads remain unchanged.
- AC-10: QR payment confirmation emails embed the PNG as an inline attachment
  with a Content-ID matched by the HTML image's `cid:` source. Do not use data
  URLs, which mail clients may strip. Attach the QR only to the entrant's QR
  payment confirmation. Generation failure still sends the confirmation with
  bank details and the protected entry-detail link, without a broken image.
  Existing mail types and API/configuration contracts remain unchanged.
- AC-11: All email logos (entry notifications, account verification and password
  reset) use an absolute asset URL under the configured `CLIENT_APP_URL`,
  including its base path. Dev, production and local instances use their own
  frontend host; API hosts and request Host headers do not determine asset URLs.
  No additional environment variable is required.

## Edge cases and API

Class eligibility, unavailable rental, closed/not-yet-open entries, missing
class, full capacity and a concurrently taken start slot require explicit
errors. Treat availability as a snapshot and handle conflicts at creation. See
the integration contract for response shapes and fee details, and the code-owned
[API sources](../api/README.md) for exact fields.

## Test plan

Run existing entry validation, service and OpenAPI contract suites:

```bash
pnpm --filter ./apps/server exec vitest run src/modules/entry/__tests__/entry.validation.test.ts src/modules/entry/__tests__/entry.service.test.ts src/config/__tests__/openapi-doc.test.ts
```

For changes to processing or start-slot mutation, also run affected entry-status
and start-slot-vacancy tests. UI changes need relevant client tests and checkout
browser checks with a test event. Add regressions for changed behavior rather
than treating this baseline as exhaustive test coverage.
For home-grid entry navigation, test the open/closed/unconfigured/relay card
actions and delayed mounting of the entries anchor. Verify scrolling in a
browser when a local API and test event are available.
For QR payment actions, test PNG file sharing, download, unsupported sharing,
cancellation and errors, plus rendered email links and both UI placements.
Device acceptance: iPhone Chrome, share to a compatible banking app, and save
then import the PNG when the banking app does not appear in the share sheet.
For email QR delivery, verify the rendered CID matches the PNG attachment,
that the email transport forwards attachment content/type/Content-ID, and that
owner, non-QR and processed notifications have no QR attachment. Cover QR
generation failure. Delivery in an actual mailbox requires a deployed server
and a newly submitted QR entry; tests must not send real mail.
Logo regressions render all three templates and cover dev/production/local
frontend URLs, trailing slashes and a deployment under a base path.

Inline QR validation on 2026-10-27: 23 focused email/template/transport/auth
tests passed, along with server type-check (including Prisma generation),
focused ESLint and formatting checks. The email regression generates a real
208×208 PNG and checks its signature, dimensions, CID reference and attachment
metadata. No real email was sent and mailbox rendering remains a deployment
acceptance check. Resend's documented inline-image format is the reference:
https://resend.com/docs/dashboard/emails/embed-inline-images.

Instance-logo validation on 2026-10-27: 29 tests across email assets, rendered
templates, entry notifications, transport and authentication passed. Server
type-check, focused ESLint and formatting passed. Rendered templates cover
development, production, localhost and a frontend base path; notification tests
also verify that logo URLs reach the entry, verification and reset templates.
No live email was sent.
