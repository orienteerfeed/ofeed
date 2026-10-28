# Product vision

## Problem and audience

Orienteering event information arrives from timing software, federation systems
and organizer workflows. OFeed brings event, entry, start-list and result data
together for organizers, competitors, spectators and integration developers.

## Scope

- Publish and manage events, classes, competitors, courses, splits and results.
- Support entry orders, current fees, payment instructions and start-slot
  choices.
- Import event data and receive live timing updates.
- Offer a React application, a separate Vue event board and REST/GraphQL APIs.
- Support localized interfaces and configurable publication of event data.

## Non-goals for the current documentation baseline

- Replacing timing hardware or promising offline timing capability.
- Treating generated QR payment instructions as proof that money was received.
- Replacing federation systems as the authoritative registration registry.
- Promising an SLA or GDPR compliance merely because a policy page exists.

New scope needs a feature spec and, when it changes architecture, an ADR. See
[requirements](requirements.md) and [domain terminology](glossary.md).
