# Entry availability — dostupnost startovních slotů, kapacity a ceníku

**Datum:** 2026-06-03
**Stav:** Návrh, čeká na revizi

## Cíl

Jeden **read-only** endpoint, který pro daný event vrátí pole všech kategorií
(`Class`) s informací o:

- **volné kapacitě** (počet i konkrétní volné startovní sloty),
- **aktuální ceně vkladu** (entry fee vč. late-entry přirážky a rozpadu DPH),
- a event-level metadatech o termínech přihlášek.

Endpoint slouží jako jednotný podklad pro více scénářů:

1. **nová přihláška** do kategorie,
2. **late entry** (přihláška po termínu, s přirážkou v ceně),
3. **změna startovního času** existujícího závodníka na jiný volný slot.

## Rozsah

**Mimo rozsah** (řeší samostatné mutace/endpointy):

- samotné vytvoření přihlášky (POST do slotu),
- samotný přesun existující přihlášky na vybraný slot,
- platby / rezervace slotu / držení slotu po dobu výběru.

Endpoint je čistě čtecí; vystavuje *co je dostupné a za kolik*, nikoli akci.

## Rozhodnutí (z brainstormingu)

| Téma | Rozhodnutí |
| --- | --- |
| Transport | **Obojí** — REST (public) + GraphQL query. |
| Filtr tříd | Vrací **všechny** třídy eventu, každá s polem kapacity. |
| FreeStart kapacita | `max − živý počet závodníků`; **`null` max → `0`** (bez volné kapacity). |
| Non-FreeStart kapacita | Striktně počet `StartSlotVacancy` řádků dané třídy. |
| Konkrétní sloty | Ano — `slots[]` (id, startTime, bibNumber) u StartList tříd; u FreeStart prázdné. |
| Název | `entry-availability` (REST cesta i základ GraphQL query). |
| Měna / DPH | Event-level (jedna měna a DPH na event — dle fee designu), neduplikovat do tříd. |
| Živý počet závodníků | Přes Prisma `_count`, **ne** cached sloupec `Class.competitorsCount` (nikde se neplní). |

## Endpointy

### REST (public)

```
GET /rest/v1/events/{eventId}/entry-availability
```

- Bez autentizace — registruje se v `event.public.handlers.ts` (před
  `requireAuth`), vedle `/:eventId/competitors`.
- Standardní `success(...)` envelope.
- REST odpověď převádí interní věkové hranice na ročníky narození:
  `birthYearFrom = currentYear - maxAge` a
  `birthYearTo = currentYear - minAge`. Pole `minAge` a `maxAge` nejsou v REST
  payloadu vystavena.
- `422` na neexistující event, `500` na chybu DB — dle vzoru ostatních public
  handlerů.
- OpenAPI spec v `event.openapi.ts` (`${eventsBase}/{eventId}/entry-availability`).
- Postman scénář: úspěšná odpověď (kontrola tvaru + typů) + invalid `eventId`.

### GraphQL

```graphql
query ($eventId: String!) {
  eventEntryAvailability(eventId: $eventId) { ... }
}
```

- **Dedikované objektové typy** (ne rozšíření `ClassRef`), aby query byla
  single-purpose:
  - `EntryAvailability` — event-level wrapper.
  - `EntryAvailabilityCurrency` — `{ code, name }`.
  - `EntryAvailabilityClass` — per-class data.
  - `EntryAvailabilitySlot` — `{ id, startTime, bibNumber }`.
- Resolver volá tutéž service `listEventEntryAvailability`. GraphQL zachovává
  interní pole `minAge` a `maxAge`; převod na `birthYearFrom` a `birthYearTo` je
  specifický pouze pro veřejný REST transport.
- Aktualizace GraphQL schema snapshotu (`schema.test.ts`).

## Tvar odpovědi

```jsonc
{
  "entriesOpenAt": "2026-05-01T00:00:00Z",
  "entriesCloseAt": "2026-05-20T23:59:59Z",
  "currency": { "code": "CZK", "name": "Czech koruna" },
  "vatPayer": true,
  "vatRate": 21,
  "defaultStartMode": "StartList",
  "classes": [
    {
      "id": 10,
      "name": "H21E",
      "sex": "M",
      "birthYearFrom": null,
      "birthYearTo": null,
      "maxNumberOfCompetitors": 120,
      "competitorCount": 87,            // živý _count
      "startMode": "StartList",         // efektivní: class.startMode ?? event.defaultStartMode
      "fee": 300,
      "currentFee": 450,                // po late-entry přirážce
      "feeNet": 371.9,                  // 450 / 1.21
      "feeVat": 78.1,
      "capacityMode": "StartSlot",
      "availableCount": 12,             // = počet StartSlotVacancy
      "isFull": false,
      "slots": [
        { "id": 501, "startTime": "2026-05-21T08:00:00Z", "bibNumber": 45 },
        { "id": 502, "startTime": "2026-05-21T08:02:00Z", "bibNumber": null }
      ]
    },
    {
      "id": 11,
      "name": "HDR",
      "sex": "B",
      "birthYearFrom": null,
      "birthYearTo": null,
      "maxNumberOfCompetitors": 50,
      "competitorCount": 17,
      "startMode": "FreeStart",
      "fee": 200,
      "currentFee": 200,
      "feeNet": 165.29,
      "feeVat": 34.71,
      "capacityMode": "FreeStart",
      "availableCount": 33,             // max - competitorCount; null max → 0
      "isFull": false,
      "slots": []                       // FreeStart nemá diskrétní sloty
    }
  ]
}
```

Poznámky k polím:

- `currency`, `vatPayer`, `vatRate` jsou **event-level** (jedna měna a DPH na
  event dle fee designu), neduplikují se do tříd.
- `birthYearFrom` je nejstarší povolený ročník narození a vzniká jako
  `currentYear - maxAge`; `birthYearTo` je nejmladší povolený ročník a vzniká
  jako `currentYear - minAge`. Pokud příslušná věková hranice není nastavena,
  hodnota je `null`.
- Service a GraphQL používají `minAge`/`maxAge`; názvy `birthYearFrom` a
  `birthYearTo` patří pouze veřejnému REST kontraktu.
- `startMode` je **efektivní** start mode kategorie
  (`class.startMode ?? event.defaultStartMode`). Surový override se nevrací.
- `fee`/`currentFee`/`feeNet`/`feeVat` se počítají stávající čistou funkcí
  `computeClassFee` (gross uložená cena, late-entry přirážka po `entriesCloseAt`,
  rozpad DPH dle plátcovství).
- `slots[]` je seřazeno podle `startTime`; obsahuje jen StartList režim, u
  FreeStart je prázdné.

## Sdílené jádro

Architektura kopíruje vzor `computeClassFee` — čistá funkce + service, sdílené
oběma transporty.

### Čistá funkce `apps/server/src/modules/class/class.capacity.ts`

Plně unit-testovatelná, bez DB:

```
vstup:  { effectiveStartMode, maxNumberOfCompetitors, competitorCount, vacancyCount }
výstup: { availableCount, capacityMode, isFull }

když effectiveStartMode === 'FreeStart':
    capacityMode  = 'FreeStart'
    availableCount = (max != null) ? Math.max(0, max - competitorCount) : 0
jinak:
    capacityMode  = 'StartSlot'
    availableCount = vacancyCount        // striktně počet StartSlotVacancy řádků

isFull = availableCount === 0
```

### Service `listEventEntryAvailability(prisma, eventId)`

Umístění: `apps/server/src/modules/start-slot-vacancy/start-slot-vacancy.service.ts`
(už obsahuje eventní agregaci `listEventStartSlotVacanciesGroupedByClass`, takže
vacancy logika zůstává pohromadě).

Jeden Prisma dotaz na event s vnořenými třídami:

```ts
event.findUnique({
  where: { id: eventId },
  select: {
    entriesOpenAt: true,
    entriesCloseAt: true,
    defaultStartMode: true,
    vatPayer: true,
    vatRate: true,
    lateEntryFeePercent: true,
    currency: { select: { iso4217Alpha3: true, name: true } },
    classes: {
      select: {
        id: true, name: true, sex: true, minAge: true, maxAge: true,
        maxNumberOfCompetitors: true, startMode: true, fee: true,
        startSlotVacancies: {
          select: { id: true, startTime: true, bibNumber: true },
          orderBy: { startTime: 'asc' },
        },
        _count: { select: { competitors: true } },
      },
    },
  },
})
```

Pro každou třídu:

- `effectiveStartMode = resolveEffectiveStartMode(class.startMode, event.defaultStartMode)`
- `vacancyCount = class.startSlotVacancies.length`
- `competitorCount = class._count.competitors`
- `fee = computeClassFee({ baseFee: class.fee, now, entriesCloseAt, lateEntryFeePercent, vatPayer, vatRate })`
- `capacity = computeClassCapacity({ effectiveStartMode, max, competitorCount, vacancyCount })`
- `slots = effectiveStartMode === 'FreeStart' ? [] : class.startSlotVacancies` (id, startTime, bibNumber)

Vrací `null` při neexistujícím eventu (transport vrstva mapuje na 422 / GraphQL
chybu).

## Dotčené soubory

- **nový** `apps/server/src/modules/class/class.capacity.ts` — čistá funkce.
- `apps/server/src/modules/start-slot-vacancy/start-slot-vacancy.service.ts` —
  service `listEventEntryAvailability` (+ typy odpovědi).
- `apps/server/src/modules/event/event.public.handlers.ts` — REST handler.
- `apps/server/src/modules/event/event.openapi.ts` — OpenAPI spec.
- `apps/server/postman/collection.json` — Postman scénáře.
- GraphQL: dedikované typy + query (umístění dle existujícího vzoru, např.
  `class.graphql.ts` nebo nový `start-slot-vacancy.graphql.ts`; rozhodne se v
  plánu) — reuse `StartModeRef` z `event.graphql-types.ts`.
- `apps/server/src/graphql/__tests__/__snapshots__/schema.test.ts.snap` — snapshot.

## Testy

- **Unit** `computeClassCapacity`: FreeStart s `max`, FreeStart bez `max` (→ 0),
  StartSlot = `vacancyCount`, hranice `isFull`.
- **Service** `listEventEntryAvailability` s Prisma mockem: mix FreeStart /
  StartList tříd, `_count.competitors`, vacancy řádky, `slots[]` jen u StartList,
  prázdné `slots[]` u FreeStart, neexistující event → `null`.
- **REST** handler: `200` s tvarem + typy, `422` na invalid `eventId`.
- **GraphQL**: schema snapshot + resolver/service test.
- Postman: úspěch + invalid `eventId`.

## Mimo rozsah

- Mutace pro vytvoření / přesun přihlášky a uvolnění slotu.
- Rezervace / dočasné držení slotu během výběru.
- Platby, fakturace, snímek účtované ceny u závodníka.
- Filtrování / stránkování tříd (vrací se vždy všechny).
