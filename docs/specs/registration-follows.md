# Registration-based athlete following

- Status: implemented
- Issue: [#293](https://github.com/orienteerfeed/orienteerfeed/issues/293)
- Related ADR: [0013](../architecture/adr/0013-registration-follows.md)
- Implementation checks: [completed plan](../plans/archive/2026-11-13-registration-follows.md)

## Goal and acceptance criteria

Persist an account's athlete selection across events by normalized registration
and issuer (ORIS, EVENTOR or LOCAL when the event has no declared issuer). Show
one row per identity in a Following tab on `/profile`, with name, registration,
issuer and active/paused state. Provide pause, resume and confirmed cancellation.

- Private GraphQL operations derive the user from JWT; no access to another
  account's preferences and no event-password access.
- Paused selections stay saved and visible in event favorites but generate no
  new notifications. Resume does not backfill activity from the pause interval.
- Cancel removes the identity and corresponding explicit event selections.
- Existing registered event favorites are backfilled by the additive migration.
  Unregistered competitors remain event-only favorites; guest storage is unchanged.
- A star for a registered competitor follows that registration across matching
  events. Selecting an already paused identity resumes it. Removing its star
  cancels that identity across events. UI explains this scope.
- Follow records survive competitor/event deletion. Existing public-event and
  radio publication boundaries still apply. Missing or undeclared issuers never
  silently merge with known issuers. First observed state is a baseline, not
  historical replay.
- Keep existing inbox history readable while paused. Cancellation hides messages
  whose corresponding selection no longer exists. Account erasure deletes follows.

## Contracts and rollout

Add `AthleteFollow`, unique by user/issuer/registration, with name snapshot,
`pausedAt` and timestamps. Add a nullable follow reference to inbox messages.
`myAthleteFollows` lists preferences; `setAthleteFollowPaused` and
`removeAthleteFollow` mutate only the caller's records. The selected-competitor
query is bounded to 1000 IDs to accommodate repeated starts/relay legs matching
the same followed registration; guest and explicit per-event limits remain 100.

Use indexed SQL joins to resolve notification audiences from explicit favorites
and active registration follows; recheck after acquiring recipient locks so a
completed pause or cancellation cannot race a new delivery. No history backfill.

Migration: `20261113130000_registration_follows`, after the existing inbox and
event-favorite migrations. Existing registered favorites are grouped by user,
normalized registration and source; existing competitor messages are linked to
the resulting preference and redundant registered event selections are removed.
This prevents a later registration change on an event row from silently changing
the followed identity. Registered follows are limited to 100 saved identities
per user, including paused records; backfill preserves larger legacy selections.
No new secrets or runtime configuration are required.

## Validation

Test migration backfill, source separation, account isolation, pause/resume/cancel,
cross-event matching, no replay and source writes against disposable MariaDB.
Verify profile interactions/errors and account cache isolation with component and
desktop/mobile browser checks. Run shared build, Prisma generation/validation,
relevant server/client tests, GraphQL/type checks, lint and formatting.
