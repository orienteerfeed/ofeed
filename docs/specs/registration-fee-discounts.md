# Registration fee discounts

Status: implemented. Source: direct user request. No issue linked: GitHub issue
search for the configured origin is unavailable (repository access).

## Goal

Allow event owners/admins to configure registration patterns and percentage
entry-fee discounts in Settings → Services. A 100% discount means free entry.

## Acceptance criteria

- Add, edit and remove event-scoped rules; validate both client and server.
- Patterns are case-insensitive whole-registration wildcard patterns: `ABC*`
  matches registrations starting with ABC, `?` matches one character. Literal
  letters, digits, spaces, underscores and hyphens are supported. No arbitrary
  executable regular expressions. Empty registrations never qualify.
- Percentage is 0–100 with up to two decimals; 100 means free. Maximum 30 rules
  and 100 characters per pattern. Highest matching discount wins. Promo stacking is separately configurable per rule (default false); tied winning rules must all permit it.
- Apply discounts to gross class fee after the configured surcharge, round to
  two decimals. Apply the same discount to card rental; 100% makes both free.
  Server remains authoritative.
- Show matching price while entering a registration, and store discounted cart
  estimates. Creation uses current rules. Orders created with pricing snapshots preserve the applied registration percentage and promo-combination setting for identified existing items on edit; new items use current rules. Saving rules
  does not retroactively modify existing orders or payment receipts.
- Persist rules across reloads, restrict mutation to owner/admin, and expose
  rules through existing entry availability for consistent public price
  estimates.

## API and data

Add nullable Event.registrationFeeDiscounts JSON (null means no rules), additive
GraphQL settings field/mutation and registrationFeeDiscounts on entry
availability. Shared Zod contracts own rule validation and shared pure pricing
helpers. Existing REST create and GraphQL edit inputs continue to accept
registration, never a client-selected discount or final fee. No architecture
replacement.

## Test plan

Test wildcard boundaries, normalization, overlap, missing registrations, invalid
patterns/percentages, rounding, free entry, surcharges, discounted rentals,
authorization, persistence, availability and UI save/validation. Generate
Prisma, validate migration on a local database if available, rebuild shared
contracts, and run affected server/client tests and type checks. Verify settings
and price preview in a browser when the local API and authenticated event are
available.

## Verification

Prisma generation and shared build/type checks passed. The migration was applied
successfully to the local orienteerfeed database (localhost:3306). The local
REST and GraphQL availability endpoints return the new field without changing
event rules. Owner/admin validation, persistence, free/percentage discounts,
overlap, surcharges and entry/cart price parity have automated regressions.
Public price estimates and rental amounts use the same shared helper as server
order pricing. Browser validation could not run because no browser is available
in this session. Database concurrency integration suites remain opt-in and
require disposable fixtures; this change does not reprice saved orders.
