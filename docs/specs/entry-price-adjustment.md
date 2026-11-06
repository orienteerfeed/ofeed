# Entry order price adjustment

- Status: implemented (server); database rollout pending
- Issue: none linked (request from the ofeed-desk race-office client; no issue number provided)
- Owner: pending
- Related ADRs: none; builds on [promo codes](entry-promo-codes.md) and
  [registration fee discounts](registration-fee-discounts.md)

## Goal and non-goals

At the race office the operator (event owner/admin) must be able to correct the
price of an on-site order — entry fees, rental and other charges — so the CASH
receipt written when the order is marked paid matches the money actually taken.
Non-goals: per-item manual prices, client-chosen prices for public users, refunds,
changing existing payment receipts.

## Current behavior and proposed behavior

Before: the server computes `totalAmount` (fees + rental − promo) and never accepts a
client price. After: an order carries an optional signed `priceAdjustment`
(negative = discount, positive = extra charge) with a mandatory reason, added after
promo: `totalAmount = round2(promoTotal + priceAdjustment)`. Example: 150 CZK order,
adjustment −30.50 "Club volunteer" → total 119.50; marking it paid writes a 119.50
CASH receipt.

## Acceptance criteria

- [x] AC-01: REST create (`POST /rest/v1/events/{eventId}/entries`) accepts optional
  `priceAdjustment` (multiple of 0.01, |value| ≤ 99 999 999.99) and
  `priceAdjustmentReason` (trimmed, 1–191 chars, required when the adjustment is
  non-zero; otherwise 422).
- [x] AC-02: sending `priceAdjustment` (including 0) requires a bearer token of the
  event owner or an admin; anonymous or other users get 403 in the existing error
  envelope. Orders without the field stay public.
- [x] AC-03: a negative resulting total is rejected with 422
  `PRICE_ADJUSTMENT_NEGATIVE_TOTAL` (REST `errors`, GraphQL error message).
- [x] AC-04: GraphQL `entryOrderUpdate` input `EntryOrderUpdateInput` accepts
  `priceAdjustment: Float` and `priceAdjustmentReason: String`. Omitted → keep the
  stored adjustment and reapply it to the recomputed total; `null` → clear; number →
  replace (reason required when non-zero). Same negative-total rule.
- [x] AC-05: `priceAdjustment` / `priceAdjustmentReason` (nullable) are exposed on
  GraphQL `Entry`, the REST create response and the shared `entryOrderSchema`.
- [x] AC-06: `entryOrderPaidUpdate` settles the adjusted total (the existing logic
  uses `totalAmount`).
- [x] AC-07: entry report line prices (`eventEntryTimeline` items) allocate the
  adjustment proportionally, cent-exact, so lines sum to the order total and never go
  below zero.
- [x] AC-08 (bug fix): on edit, a stored registration-discount snapshot is reused for
  an identified item only when its registration is unchanged (trim + uppercase,
  null-safe); otherwise the item is repriced with the current rules.

## Edge cases

- `priceAdjustment: 0` is stored as no adjustment (all three columns null); the reason
  is ignored.
- A reason sent on edit without `priceAdjustment` is ignored (the stored reason stays).
- Clearing sets `priceAdjustedById` to null as well; there is no separate history row
  (see audit below).
- Edits of orders with receipts follow the existing reconciliation: a lower total can
  mark the order paid, a higher one unpaid.
- E-mails show only `totalAmount`, which already includes the adjustment.

## API and data changes

- Migration `20261105120000_entry_price_adjustment`: `Entry.priceAdjustment
  DECIMAL(10,2) NULL`, `priceAdjustmentReason VARCHAR(191) NULL`, `priceAdjustedById
  INT UNSIGNED NULL` (plain user ID like `PromoCode.createdById`, no FK). Additive and
  backward compatible.
- Audit: `EntryStatusHistory` only models status and payment-state changes and order
  edits have no history today, so no history row is written; `priceAdjustedById` plus
  `Entry.updatedAt` identify the last author. A full edit history needs a separate
  decision.
- Personal data: the reason is free text visible to event staff; operators must not
  enter personal data beyond what the order already holds. It follows the Entry
  retention.
- OpenAPI: create body, 403 response and the availability `registrationFeeDiscounts`
  description updated in `apps/server/src/modules/event/event.openapi.ts`.

## Test plan

- `apps/server/src/modules/entry/__tests__/price-adjustment.test.ts`: REST create
  (owner/admin 201, anonymous/non-owner 403, missing reason 422, negative total 422),
  edit keep/set/clear, mark-paid receipt equals the adjusted total, snapshot reuse vs
  changed registration, report allocation.
- `apps/server/src/config/__tests__/openapi-doc.test.ts`, GraphQL schema snapshot.
- Commands: `pnpm --filter @repo/shared build`, `pnpm --filter ./apps/server
  type-check`, `pnpm --filter ./apps/server type-check:graphql`, `pnpm --filter
  ./apps/client type-check`, server Vitest on `src/modules/entry src/graphql src/config
  src/modules/event src/modules/start-slot-vacancy`.

## Rollout and open questions

Apply the migration before deploying the server. The web client does not yet show or
edit the adjustment (desk client first). Open: whether a full price-change history is
needed for accounting.
