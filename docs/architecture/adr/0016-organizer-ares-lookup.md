# 0016: Verify organizer details through a server-owned ARES adapter

- Status: proposed
- Date: 2026-11-17
- Context: requested organizer name/IČO autocomplete and verified badge.

## Decision

Use event-owner/admin GraphQL queries and an event module service to call the
fixed official ARES REST API. Bound results and request duration. On save verify
exact normalized billing fields against a fresh detail; store a server-generated
verification timestamp inside organizer JSON. Ignore client verification claims.
Manual input remains available and outages do not block saves. No extra persistence
or new dependency is required. Country choices reuse the existing directory;
new selections store directory ISO codes with localized labels; legacy names remain readable.

## Consequences

Registry availability affects lookup and fresh verification. Editing removes the
badge until verified again. A timestamp records a past match, not a guarantee that
registry data never changes. Bank accounts remain controlled by payment settings.

## Source

Official schema: https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/v3/api-docs
