# Entry API integration contract

The running server publishes its REST contract at `/doc` and its API reference
at `/reference`. This note describes the checkout and start-time rules used by
desktop and web integrations.

## Authentication and user fields

Signin requires `deviceId` (installation UUID) and `deviceName` (1–100 characters).
REST `/rest/v1/auth/signin` returns `results.data.accessToken`, `expiresIn: 900`,
`refreshToken` and user metadata. Use the access token as Bearer credentials.
`POST /rest/v1/auth/refresh` takes `{ refreshToken, deviceId }` and returns a new
pair in the same envelope; replace the stored refresh token after every success.
`POST /rest/v1/auth/logout` takes the same credentials and revokes the family,
even after access expiry. Never retry a consumed refresh token: replay revokes
its whole family. Refresh expires after 30 days without renewal, or 90 days from
signin. Legacy user JWTs are rejected; integrations must upgrade and sign in again.

The browser uses GraphQL signin with `X-Ofeed-Session: web`, JSON and an allowed
Origin; its refresh credential is a host-only HttpOnly cookie. Browser refresh
and logout send `{ deviceId }` with that cookie and the same header/Origin.
GraphQL `currentSessions` and `revokeDevice(deviceId)` manage the caller's devices.
Access-token revocation is bounded by its 15-minute expiry; account deletion
also retains the existing active-account rejection. Signup, email verification
and password reset return success/message and direct users to signin.

See [session specification](specs/session-longevity.md) and the
[operations runbook](ops/runbooks/device-sessions.md), including native secure
storage, outbox preservation and the strict-rotation lost-response exception.

GraphQL `signin` returns user identity, organisation, emergency contact, activation,
email verification and creation/update timestamps. Optional metadata can be null.
`User.password` is nullable and always returns null; password hashes are never API
output.

GraphQL `entryOrderPaidUpdate` requires authentication before it reads the order.
A missing token returns `extensions.code: UNAUTHENTICATED`, including when the
supplied order ID does not exist. Authenticated callers still need event owner or
admin access.

## Record received payments and prepare closing reports

Use `POST /rest/v1/events/{eventId}/entries/{entryId}/payments` for actual CASH/QR
receipts. Supply `clientPaymentId` (UUID), `method`, positive `amount`, matching
`currency`, timezone-qualified `paidAt` and `deviceId`. Both payment endpoints
require a user JWT and event owner/admin access. The server attributes the operator.

New receipts return 201 in `results.data`; identical retries return 200 with the
original receipt. Reusing a UUID with different content returns 409. Keep each
UUID stable across network retries. UUID uniqueness is per event across desks.
Receipt totals atomically determine paid status; partial payments and overpayments
are allowed. The first receipt replaces the historical Boolean interpretation;
a partial first payment can clear a manually set paid flag. Boolean paid updates
then return a GraphQL `CONFLICT`. Receipts are immutable; refunds are not supported.

Use `GET /rest/v1/events/{eventId}/payments` for a complete closing dataset, or
filter by `entryId`, `deviceId` and inclusive `since` (server `recordedAt`, not `paidAt`).
Responses include entry ID, method, amount, currency, device, operator and both
timestamps. Deduplicate overlapping incremental reads by receipt ID. Compute totals
by currency and method. A full query is authoritative for closing; incremental
queries are not a change-stream cursor and clients should overlap their reads.
Event deletion/reset also permanently deletes the event's receipts; download
the closing dataset first. See the
[payment spec](specs/entry-payments.md) and the running `/doc` for exact schemas.

## Received payment insights

The owner/admin Insights UI consumes `GET /rest/v1/events/{eventId}/insights/payments`.
It returns all receipts enriched with current entry `paymentReference`,
`contactFirstname` and `contactLastname` in `results.data`. It requires a user JWT
and event owner/admin access. UI filters use `paidAt` calendar dates in the event
timezone; they do not use the synchronization endpoint's `since` filter.

## Validate before collecting payment


For items in `POST /rest/v1/events/{eventId}/entries`:

- A resolved birth year from `birthYear` or `registration` is required only for
  age-restricted classes. Both may be supplied or omitted for unrestricted classes.
  Registration uses three letters followed by four digits, for example `ABC9501`.
- `card` and `cardRental` are optional. Omitting `cardRental` defaults it to false.
  When `cardRental` is true, card rental must be enabled for the event.
- On creation, `license` is resolved server-side from the cached ORIS registration
  for OB and the current year, using the normalized `registration` number. The
  submitted `license` value is ignored. Missing matches or licenses produce null;
  processing the order copies the stored license to the competitor. The same
  behavior applies to GraphQL order creation.

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

If the final server-calculated order total is zero, creation immediately stores
`paid: true` with an initial paid-state audit entry, regardless of the selected
available payment method. The order remains `RECEIVED` for organizer processing.
No zero-value receipt is recorded, no payment deadline is set, and the create
response omits `qrPayment` and `paymentUrl`. GraphQL detail returns null QR
instructions for zero-total orders. Confirmation emails and the web UI state
that no payment is needed. Positive totals retain normal payment handling.
Existing historical paid flags are not automatically changed.

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

Only effective `StartList` requires an exclusive free slot. A changed class/time
must match a listed free slot in the target class. Arbitrary unlisted, occupied
or pending-entry-reserved times return HTTP 409 with the existing numeric `code`
and additive `errorCode: "SLOT_TAKEN"`. GraphQL uses `extensions.code: SLOT_TAKEN`.
Keeping the competitor's own class/time is allowed without a vacancy.
`MassStart`, `WaveStart`, `PursuitStart` and `FreeStart` permit shared times without
exclusive slot selection; creating a free-start competitor without a timestamp
continues to use the event date-time.

PUT retains its payload and response semantics. A class-only update preserves
the existing time: it must be a free slot if the target is StartList. The server
does not auto-select another time. A successful move consumes the target vacancy
and restores the previous StartList class/time in the same transaction. A failure
leaves both the competitor and vacancies unchanged. A slot still occupied by
another competitor is not released.

Entry submission reserves the time immediately, even before processing/payment.
Both subsequent entries and direct competitor creates respect that reservation.
Checks and writes use the database event lock, with or without Idempotency-Key.
RECEIVED/APPROVED unprocessed items reserve slots; CANCELLED/REJECTED orders do
not. Processing atomically transfers an item's own reservation to its competitor.
Availability lists each free slot once and excludes all competitors' times
(including the caller's own) and active reservations. Non-StartList classes
return an empty slot list and use competitor limits for capacity.

The existing vacancy unique constraint remains. No unique constraint is added
to Competitor or EntryItem, and no new migration is required. Existing historical
collisions are hidden from availability, not automatically repaired. New G16
change-item APIs and the broader G21 error redesign remain separate work.

## Desktop CORS

The CORS allowlist is unchanged. Electron integrations using localhost or file
origins continue to use their existing main-process HTTP workaround.


## Retrying creates

Send a fresh unpredictable `Idempotency-Key` (for example a UUID) with each new
entry order, competitor create or competitor status change. Keep the same key
and body for every retry of that operation. The server replays the successful
HTTP status and JSON body for 24 hours, including the original entry detail
access token and payment instructions. A changed body with the same live key
returns 409. Keys are scoped to caller, event and endpoint; stay in the same
authentication context when retrying. Failed requests can be corrected and
retried; requests without the header can create duplicates. See the
[specification](specs/create-idempotency.md) for expiry and concurrency details.

## Registration-based entry fee discounts

Entry availability includes `registrationFeeDiscounts`: rules with `pattern` and
`discountPercent` (0–100, up to two decimals). Patterns match the entire trimmed
registration case-insensitively; `*` matches any sequence and `?` one character.
`ABC*` matches registrations beginning with ABC. Empty registrations never
qualify. When multiple rules match, use the highest percentage without stacking.
Apply it to the current gross class fee after surcharges and round to two
decimals. Apply the same discount to the separate card rental fee. A 100%
discount makes both entry and rental free.

Clients can use the shared pricing helper for estimates; the server recalculates
on creation and explicit order edits. Saving event rules does not reprice
existing orders or payment receipts. Event owners/admins manage up to 30 rules
via `eventServiceSettings.registrationFeeDiscounts` and the
`updateRegistrationFeeDiscounts(eventId, rules)` GraphQL mutation.

## Promo codes

Create accepts optional `promoCode`, normalized case-insensitively within the event.
Only the server selects the percentage and price. Invalid/revoked codes or no
eligible positive subtotal fail validation; orders are never silently created
without the requested discount. Responses include nullable `promoCode`,
`promoPercent`, `promoEligibleAmount` and `promoDiscountAmount`; `totalAmount`
is the payable amount after discount. Item fees remain before the order promo
adjustment, so their sum can exceed `totalAmount`.

GraphQL `entryPromoQuote(eventId, code, items)` returns server-priced subtotal,
eligible amount, discount, final total, currency and excluded-item count. Owner/admin
operations `eventPromoCodes`, `createEventPromoCode` and `revokeEventPromoCode`
manage immutable event codes. Revocation affects future submissions only.
GraphQL order edits accept optional `entryItemId` to preserve pricing snapshots
of existing items whose registration is unchanged; a changed registration or an
omitted ID uses the current rules. No expiry or usage limit.

## Manual price adjustment (event staff)

Create accepts optional `priceAdjustment` (signed, two decimals,
|value| ≤ 99999999.99; negative = discount, positive = extra charge) and
`priceAdjustmentReason` (trimmed, 1–191 characters, required when the adjustment is
non-zero). The adjustment is added after the promo discount:
`totalAmount = round2(promoTotal + priceAdjustment)`. Sending `priceAdjustment` on the
otherwise public create endpoint requires a bearer token of the event owner or an
admin; anonymous and other users get 403. A negative total returns 422 with
`errors: "PRICE_ADJUSTMENT_NEGATIVE_TOTAL"`. Zero is stored as no adjustment.

GraphQL `entryOrderUpdate(entryId, input: EntryOrderUpdateInput)` accepts
`priceAdjustment: Float` and `priceAdjustmentReason: String`: omit the field to keep
the stored adjustment (reapplied to the recomputed total), send `null` to clear it, or
a number to replace it. Orders expose nullable `priceAdjustment` and
`priceAdjustmentReason` (GraphQL `Entry`, REST create response). Marking a CASH order
paid writes a receipt for the adjusted balance. Item fees stay unadjusted; report line
prices distribute the adjustment so they sum to `totalAmount`. See the
[specification](specs/entry-price-adjustment.md).

```graphql
mutation AdjustEntryPrice($entryId: String!, $input: EntryOrderUpdateInput!) {
  entryOrderUpdate(entryId: $entryId, input: $input) {
    id
    totalAmount
    priceAdjustment
    priceAdjustmentReason
  }
}
```

## Cash settlement from web / ofeed-desk

`entryOrderPaidUpdate(entryId: String!, paid: Boolean!, deviceId: String)` remains
backward compatible. For a CASH order, `paid: true` now inserts a CASH receipt for
the remaining balance, then derives paid status from the ledger in one locked
transaction. Repeating settlement of a fully paid cash order adds no receipt.
An optional nonblank deviceId (max 191 characters) identifies the POS/browser;
omitting it uses `server:entry-paid-update`. Operator comes from the authenticated
owner/admin and payment time is the current server time. CASH receipts are visible
in GET payment reports immediately. No historical flags are bulk-converted.

POS clients needing an offline time, explicit amount or retry identity should
continue to use POST `/rest/v1/events/{eventId}/entries/{entryId}/payments` with
`clientPaymentId`, `method: CASH`, amount, currency, paidAt and deviceId; this
already sets paid status. Use one write path per physical payment: marking paid
first and then independently posting that same receipt would count it twice.
A POST receipt followed by the old cash paid=true call is harmless once the
balance is fully covered. Clearing paid=false after any receipt is still 409 /
GraphQL CONFLICT; no refund or receipt deletion is implied.


```graphql
mutation SettleCashEntry($entryId: String!, $deviceId: String) {
  entryOrderPaidUpdate(entryId: $entryId, paid: true, deviceId: $deviceId) {
    id
    paid
  }
}
```

If an order selected QR but the customer actually pays cash, use the existing
POST receipt endpoint with `method: CASH`; changing a non-cash paid flag does not
assert a cash transaction. Existing history is never rewritten as a side effect.

The entry list and order detail pass the configured payment device ID (or browser
installation ID) when settling cash. GraphQL `Entry.paymentCount` lets clients
distinguish a legacy paid flag from an actual receipt. The list offers an explicit
record-confirmed-cash action for positive CASH orders marked paid without receipts;
viewing an order never creates a receipt.

The web report invalidates its receipt and report caches after successful web
writes. While visible, the received-payments report also reloads every 15 seconds
and on window focus to pick up external ofeed-desk writes. The POS payment payload
and REST endpoint remain unchanged.
