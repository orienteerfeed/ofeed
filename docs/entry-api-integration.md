# Entry API integration contract

The running server publishes its REST contract at `/doc` and its API reference
at `/reference`. This note describes the checkout and start-time rules used by
desktop and web integrations.

## Authentication and user fields

GraphQL `signin` returns user identity, organisation, emergency contact, activation,
email verification and creation/update timestamps. Optional metadata can be null.
`User.password` is nullable and always returns null; password hashes are never API
output.

GraphQL `entryOrderPaidUpdate` requires authentication before it reads the order.
A missing token returns `extensions.code: UNAUTHENTICATED`, including when the
supplied order ID does not exist. Authenticated callers still need event owner or
admin access.

## Validate before collecting payment

For items in `POST /rest/v1/events/{eventId}/entries`:

- A resolved birth year from `birthYear` or `registration` is required only for
  age-restricted classes. Both may be supplied or omitted for unrestricted classes.
  Registration uses three letters followed by four digits, for example `ABC9501`.
- `card` and `cardRental` are optional. Omitting `cardRental` defaults it to false.
  When `cardRental` is true, card rental must be enabled for the event.

Normal field validation and class age, capacity, start-slot and rental availability
checks still apply. Invalid input returns 422.

Read the public event's GraphQL `statusSummary.entriesConfigured` before checkout;
it remains available without a token. It is true when at least one of
`entriesOpenAt` or `entriesCloseAt` is set. When both are unset, creation returns
409 with `Entries are not configured for this event.` An unavailable payment
method returns 422 during payment-method validation; null class fees are treated
as zero. Other 409 cases include a
closed entry window, a full class or an unavailable start slot. Availability is a
snapshot; creation can still reject a slot that another request has since taken.

## Fees and the late-entry surcharge

| Surface | Field | Shape and meaning |
| --- | --- | --- |
| REST entry availability | `classes[].fee` | `null` or `{ amount, net, vat }`; `amount` is the current gross price, `net` excludes VAT, `vat` is its VAT component |
| GraphQL `eventClasses` | `fee` | Nullable Float containing the base gross price |
| GraphQL `eventClasses` | `currentFee` | Nullable Float containing the current gross price |
| GraphQL `eventClasses` | `feeNet`, `feeVat` | Nullable Float fields for the current net price and VAT component |

The late-entry surcharge is `event.lateEntryFeePercent`. It applies after
`entriesCloseAt` unless the class has `lateEntryFeeDisabled: true`. A base fee of
100 with a 50 percent surcharge yields a current gross amount of 150. REST
availability already includes that surcharge; do not apply it again. For an event
that is not a VAT payer, `net` equals `amount` and `vat` is zero.

The OpenAPI entry-availability response types the fee object and the immediate
entry-creation response types numeric item fees and optional payment instructions.
GraphQL exposes its numeric fee fields through schema introspection.

## QR payment personal data

For `QR_PAYMENT`, the immediate creation response includes `qrPayment.payload`.
The SPAYD `MSG` value contains `OFeed QR payment - <contactLastname> <contactFirstname>`.
These are the order contact's names; the contact may differ from the competitor.
Displaying, printing, logging or retaining that string includes those personal
data. The QR image encodes the same payload.

## Competitor notes and start times

`PUT /rest/v1/events/{eventId}/competitors/{competitorId}` treats `note: ""` and
whitespace-only notes as null. Omitting `note` leaves it unchanged. The external-ID
update and GraphQL competitor update use the same normalization.

For start-list modes (any effective start mode other than `FreeStart`), a changed
class/time must match a listed free slot in the target class. Arbitrary unlisted,
occupied or pending-entry-reserved times return 409. Keeping the competitor's own
class/time is allowed without a vacancy. `FreeStart` accepts arbitrary timestamps
without slot selection; creating a free-start competitor without a timestamp uses
the event date-time.

A move consumes the target vacancy and releases the previous class/time in the
same transaction. Moving back consumes the restored slot. Changing only the class
performs the same transfer. A slot still occupied by another competitor is not
released. Public entry availability excludes confirmed competitors and active
pending entries, deduplicates class/time pairs and computes capacity from the
remaining slots. Entry creation also excludes confirmed competitors' times.

The database schema already has a unique constraint on `(classId, startTime)` for
vacancies. These changes require no new migration. Apply all existing migrations
to each deployed database; application filtering does not repair historical rows.

## Desktop CORS

The CORS allowlist is unchanged. Electron integrations using localhost or file
origins continue to use their existing main-process HTTP workaround.
