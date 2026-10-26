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
