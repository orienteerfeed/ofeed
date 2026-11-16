# Competitor favorites and inbox updates

- Status: implemented
- Issue: [#293](https://github.com/orienteerfeed/orienteerfeed/issues/293)
- Related ADR: [0012](../architecture/adr/0012-competitor-favorite-notifications.md)

## Goal

Let spectators mark competitors with a star and find them together in an event's
Favorites tab. Logged-in users persist their event-scoped selection in SQL and
receive changes in the existing personal inbox. Guest selections remain local to
the browser and do not create a server inbox. [Registration follows](registration-follows.md)
extend registered account selections across events and add pause/cancel controls
in the profile. Unregistered selections remain event-scoped.

## Acceptance criteria

- Star/unstar from result lists and the Favorites tab; accessible labels and
  pressed state, six-language localization, desktop and mobile layouts.
- Account favorites survive reload and device changes; users can only manage
  their own selection with user JWT. Event passwords do not identify a spectator.
  Guest storage is separate from account state and is not silently merged.
- Changes are captured inside the existing serialized event write transaction,
  including IOF, MeOS, direct updates and punch projection. Failed transactions
  create no messages; repeated unchanged uploads create none. Favoriting an
  existing result does not replay its history.
- Observe actual starts, public radio split changes, finish, chip readout, and
  status/time corrections. A scheduled start alone is not an observed start;
  final IOF status alone does not prove chip readout. Multiple changes committed
  together describe the resulting state, without inventing intermediate states.
- Emit only radio splits explicitly published by the organizer; never disclose
  hidden course splits through the inbox. Unpublished events and removed
  favorites are excluded from spectator inbox access.
- Respect `UnorderedNoTimes` in the Favorites view and newly generated messages:
  suppress radio notifications and stored result times for those classes.
- Existing owner/order/payment notifications retain their authorization rules,
  read state and 90-day retention. Competitor messages link to the event's
  Favorites tab. Account erasure removes favorites and messages.

## Interface and persistence

`myEventFavoriteCompetitorIds(eventId)` and `setCompetitorFavorite(eventId,
competitorId, favorite)` require user JWT. `eventFavoriteCompetitors(eventId,
competitorIds)` accepts up to 1000 selected IDs and returns only competitors in
that public event; the owner can also inspect their unpublished event. Selection
is limited to 100 favorites per user/event, with idempotent additions/removals.
Guest storage validates IDs and permits clearing unavailable selections.

Store unique user/competitor favorites with
cascading deletion. Extend notification kinds and nullable competitor payloads;
order ID becomes nullable for non-order messages. Consumers must branch on kind;
deploy the compatible frontend with the API before enabling favorite selections.
Existing order operations/data retain their semantics. Record source changes in SQL before publishing existing
invalidation hints; no separate broker or push provider.

Migration: `20261113100000_competitor_favorites`, following the initial inbox
migration. Favorites remain until removed or the competitor/account is deleted;
messages retain the existing 90-day expiry. Registered follow records survive
event/competitor deletion as described in the registration-follow extension.
No new runtime variables or secrets.
Transactional snapshots cover the event's watched competitors; large import
workloads should profile this additional read cost before expanding scope.

## Validation

Cover guest/account isolation, authorization, duplicate mutations, same-event
membership, initial selection without replay, idempotent snapshots, observed
versus scheduled starts/readouts, radio publication, rollback and multi-recipient
delivery. Test the actual transaction wrapper and source writers against disposable
MariaDB. Add client tests for star state, errors and the favorites list, plus
desktop/mobile browser coverage. Run shared build, Prisma generation/validation,
focused client/server tests and type checks, lint and formatting.

Results: [archived implementation record](../plans/archive/2026-11-13-competitor-favorites.md).
