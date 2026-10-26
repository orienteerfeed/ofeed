# Data model

The authoritative schema is
[apps/server/prisma/schema.prisma](../../apps/server/prisma/schema.prisma). It
uses the `mysql` provider with the MariaDB adapter. This overview is a domain
map; consult the schema for exact nullability, indexes, cascades and enum
values.

```mermaid
erDiagram
  User o|--o{ Event : authors
  Event ||--o{ Class : contains
  Event ||--o{ Entry : receives
  Class ||--o{ Competitor : includes
  Class ||--o{ StartSlotVacancy : offers
  Class ||--o{ EntryItem : selected_by
  Entry ||--o{ EntryItem : contains
  EntryItem o{--o| Competitor : processed_into
  Competitor ||--o{ Split : records
  Event ||--o{ Course : defines
  Course o|--o{ Class : assigned_to
  Course ||--o{ CourseControl : orders
  Control o|--o{ CourseControl : resolves
```

## Entity groups and invariants

| Group               | Models / rules                                                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Identity            | `User`, `UserCard`, `DeviceSession`, `SessionRefreshToken`, OAuth clients/tokens and password-reset tokens; never expose stored password hashes                           |
| Event setup         | `Event`, `Sport`, `Country`, `Currency`, `Class`; event datetime has an explicit timezone setting                                 |
| Participation       | `Competitor`, `Team`, `Organisation`, `Split`; user accounts and competitors are separate concepts                                |
| Checkout            | `Entry`, `EntryItem`, `EntryAddOnItem`, `EntryStatusHistory`; item prices are snapshots, payment reference is unique per event    |
| Availability        | `StartSlotVacancy` plus occupied competitor times and pending entry reservations; a vacancy row alone does not prove availability |
| Payments and rental | `EventPaymentMethod`, `EventService`, `EventRentalCard`; timing-card rental is separate from payment-method selection             |
| Courses             | `Course`, `Control`, `CourseControl`, `CourseMap`; imports preserve unresolved control codes                                      |
| Federation cache    | `Registration`, `Club`, sync-state and Czech ranking models; cache provenance must be preserved                                   |
| Integration history | `Protocol`, `EventImportState`, `EventExternalResultsSyncState`, `EventMeosBinding`, `EventPassword`                              |

## Punch observations

`Punch` identifies a physical event/card/control/UTC-millisecond observation;
`PunchReceipt` retains device retry identity, source, station, client receipt time,
server storage time and author. Punches may remain unassigned. Matched observations
project into existing splits and competitor timings. Snapshot imports supersede
previous observations, and competitor deletion retains them without replay.
Deleting an event cascades its punch ledger. See the
[punch ingestion spec](../specs/punch-ingestion.md).

## Device sessions

`DeviceSession` owns a device-bound refresh family, sliding/absolute deadlines and
revocation state. `SessionRefreshToken` stores generation hashes and consumption
metadata; consumed generations remain for replay detection until the family’s
absolute expiry. A user-row lock serializes session issuance/rotation with
credential changes and account deletion. Access JWTs remain stateless with respect
to refresh families. See [session longevity](../specs/session-longevity.md).

## Schema changes

Create migrations in [prisma/migrations](../../apps/server/prisma/migrations/),
regenerate with `pnpm db:generate`, and run affected tests. Do not hand-edit
`apps/server/src/generated/**`. Use expand/contract-compatible changes for
rolling deployments; an application rollback does not reverse a database
migration.

See [glossary](../product/glossary.md),
[checkout spec](../specs/entry-checkout.md) and
[data protection](../security/data-protection.md) before changing identities,
fees, publication rules or deletion behavior.
