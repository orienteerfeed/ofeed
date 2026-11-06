# Domain glossary (CZ ↔ EN)

Use the schema and contract identifiers below in code; do not create synonyms
for existing concepts. Translated UI labels belong in localization resources.

| Česky                            | English                 | Identifier / meaning                                                                |
| -------------------------------- | ----------------------- | ----------------------------------------------------------------------------------- |
| Závod / událost                  | Event                   | `Event`: event settings, organizer, date and timezone                               |
| Kategorie                        | Class                   | `Class`: event-scoped competition category; not a school class                      |
| Závodník                         | Competitor              | `Competitor`: participant in a class/start list                                     |
| Uživatel                         | User                    | `User`: application account; not every competitor has an account                    |
| Přihláška / objednávka přihlášek | Entry order             | `Entry`: contact, payment and status for a group of items                           |
| Položka přihlášky                | Entry item              | `EntryItem`: requested competitor entry or change; not yet necessarily a competitor |
| Registrační číslo                | Registration number     | `registration`: athlete identifier, not an entry-order ID                           |
| Registrace ve svazu              | Federation registration | `Registration`: cached federation record                                            |
| Oddíl                            | Club                    | `Club`: global federation directory cache                                           |
| Organizace v závodě              | Organisation            | `Organisation`: event-scoped snapshot, distinct from `Club`                         |
| Štafetový tým                    | Team                    | `Team`: team associated with a class                                                |
| Trať                             | Course                  | `Course`: ordered course controls, associated with classes                          |
| Kontrola                         | Control                 | `Control`: event control; `CourseControl` records its course position               |
| Mezičas                          | Split                   | `Split`: competitor split data                                                      |
| Mapa                             | Course map              | `CourseMap`: course map metadata; not the home-page event map                       |
| Volný startovní čas              | Start-slot vacancy      | `StartSlotVacancy`: selectable slot subject to occupied/reserved-time checks        |
| Startovní režim                  | Start mode              | `StartMode`: includes `FreeStart` and slot-based modes                              |
| Čip                              | Timing card             | `card`: timing-card number; unrelated to payment cards                              |
| Zapůjčení čipu                   | Card rental             | `cardRental`, `EventRentalCard`: request and event rental inventory                 |
| Startovné                        | Entry fee               | Class fee; the order item stores a price snapshot                                   |
| Příplatek po termínu             | Late-entry surcharge    | `lateEntryFeePercent`, subject to class settings                                    |
| Variabilní symbol                | Payment reference       | `paymentReference`: unique within an event                                          |
| Bankovní spojení                 | Bank connection         | `BankConnection`: organizer's own account polled by the desktop collector           |
| Bankovní pohyb                   | Bank transaction        | `BankTransaction`: client-reported incoming payment; matched by payment reference   |
| Protokol změn                    | Change protocol         | `Protocol`: event change records, not a network protocol                            |
| Výsledková tabule                | Event board             | Separate Vue app in `apps/board`                                                    |

Exact fields, enum values and relations:
[Prisma schema](../../apps/server/prisma/schema.prisma).
