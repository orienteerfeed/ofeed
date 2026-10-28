# Entry payment reference prefix

- Status: implemented
- Issue: no linked GitHub issue supplied; no matching issue found in repository search.

## Goal

Let event organizers distinguish OFeed entry-order payments with an event-wide
numeric prefix configured under Settings → Services → Payment methods.

## Acceptance criteria

- Optional prefix contains one or two ASCII digits, including leading zeroes.
  Empty input clears the prefix. Other characters and longer input are rejected.
- The existing generator uses a two-digit year and eight random digits, already
  filling the Czech variable-symbol limit of 10 digits. A configured prefix
  replaces the year; the eight random digits remain unchanged. Without a prefix,
  generation preserves the current year-based format.
- Configuration applies to every payment method for newly created orders,
  including QR SPAYD X-VS, custom links and email instructions.
- Existing orders retain their stored payment references after changes or clearing.
- Event owner/admin authorization and atomic payment-settings save are preserved.
- The UI explains the two-digit limit, year fallback and new-order-only scope.

## Edge cases and API

Store nullable Event.paymentReferencePrefix as VARCHAR(2). Expose it on
EventPaymentMethodSettings and accept optional nullable paymentReferencePrefix
in UpdateEventPaymentMethodsInput. Omission preserves the saved value; null or
empty string clears it. Use a shared Zod schema on client and server. Maintain
existing event-scoped uniqueness and collision retries, including prefixes that
match old year prefixes. Store references as strings to preserve leading zeros.
No changes to existing entry references, QR contracts or payment ledger.

## Test plan

Test numeric/length boundaries, leading zeros, fallback, save/load/clear/omission,
authorization, generation for CASH and QR and QR X-VS consistency. Run focused
server/client tests, shared build, Prisma generation/validation, GraphQL snapshot
and type checks. Browser verification if local authenticated services are available.

## Verification

Shared build, Prisma generation/schema validation, client/server TypeScript and
GraphQL type checks passed. Focused server tests cover settings validation,
checkout CASH/QR references, collision retries, emails, OpenAPI and GraphQL
schema. Client component tests cover loading/saving/clearing leading-zero
prefixes and rejection of invalid input. No browser backend was available for
visual verification. The additive SQL migration is prepared and has not been
applied to the running local database.
