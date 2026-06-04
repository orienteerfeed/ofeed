# Startovné na kategorii (entry fee) — návrh

**Datum:** 2026-06-01
**Stav:** Návrh schválen, čeká na implementační plán

## Cíl

Umožnit organizátorovi nastavit startovné (entry fee) na úrovni kategorie
(`Class`), evidovat ho účetně korektně včetně DPH a nabídnout globální
procentuální navýšení startovného po uplynutí termínu přihlášek.

Hlavní priorita: **co nejjednodušší zadávání pro organizátora.**

## Rozhodnutí (z brainstormingu)

| Téma | Rozhodnutí |
| --- | --- |
| Měna | Jedna měna na celý event, uložená na `Event`. |
| DPH | Podmíněné dle plátcovství eventu — rozpad se počítá jen když je event plátce. |
| Počet cen na kategorii | Jedna základní cena + jedna globální % přirážka. |
| Mechanika přirážky | Dopočítávaná (násobitel), základní cena se nemění. |
| Rozsah | Jen ceník na kategorii. Bez snímku ceny u závodníka, bez plateb. |
| Modelování | Decimal pole na `Class` (přístup A), ne samostatná tabulka `Fee`. |
| Reprezentace ceny | Gross (vč. DPH) — částka, kterou závodník platí. Net se dopočítává. |

**Proč ne tabulka `Fee`:** samostatná tabulka s `feeId` má smysl jen pro více
cen na kategorii nebo sdílení cen mezi kategoriemi — obojí bylo zamítnuto. Pro
jednu cenu je to join navíc, víc UI a režie bez přínosu (YAGNI). DPH a přirážka
nejsou vlastnost ceny, ale eventu, proto patří na `Event`.

## Datový model

### `Event` (nová pole)

```prisma
currency            String   @default("CZK") @db.Char(3)   // ISO 4217
vatPayer            Boolean  @default(false)
vatRate             Decimal? @db.Decimal(5, 2)             // např. 21.00; relevantní jen když vatPayer
lateEntryFeePercent Decimal? @db.Decimal(5, 2)            // globální přirážka po termínu, např. 50.00
```

- Spouštěč přirážky je **stávající `entriesCloseAt`** — žádné nové datum.
- `lateEntryFeePercent = null` → žádná přirážka.
- `vatRate` má smysl pouze když `vatPayer = true`.

### `Class` (nové pole)

```prisma
fee Decimal? @db.Decimal(10, 2)   // gross (vč. DPH), částka kterou závodník platí; null = nenastaveno
```

## Dopočet (čistá funkce, nic se neukládá)

Nový helper modul `apps/server/src/modules/class/class.fee.ts` (čistá funkce,
plně unit-testovatelná bez DB):

```
vstup:  baseFee (Decimal|null), now, entriesCloseAt, lateEntryFeePercent, vatPayer, vatRate

currentFee = (entriesCloseAt && now > entriesCloseAt && lateEntryFeePercent)
           ? baseFee × (1 + lateEntryFeePercent / 100)
           : baseFee

rozpad DPH (z currentFee jako gross):
  když vatPayer && vatRate:
    net = round(gross / (1 + vatRate/100), 2)
    vat = gross − net
  jinak:
    net = gross
    vat = 0
```

- Zaokrouhlení na 2 desetinná místa (měnové jednotky).
- Při `baseFee = null` vrací funkce `null` pro všechny dopočítané hodnoty.
- **Neplátce:** `feeNet = currentFee`, `feeVat = 0` (ne `null`) — jednodušší pro
  klienta, který nemusí řešit dva různé tvary odpovědi.

## API / expozice

### GraphQL (čtení)

`ClassRef` (`class.graphql.ts`) — nová pole, dopočítaná v resolverech přes
`Prisma.Decimal.toNumber()` (v projektu není Decimal scalar, peněžní částky jsou
malé → expozice jako `Float`):

- `fee: Float` — uložená základní cena (gross)
- `currentFee: Float` — cena po případné přirážce
- `feeNet: Float` — základ bez DPH
- `feeVat: Float` — částka DPH

Dopočítaná pole potřebují k výpočtu data z nadřazeného `Event`
(`entriesCloseAt`, `vatPayer`, `vatRate`, `lateEntryFeePercent`). Resolver je
načte přes relaci/parent, nebo se předají v selektoru.

`EventRef` (`event.graphql-types.ts`) — nová pole:

- `currency: String`
- `vatPayer: Boolean`
- `vatRate: Float` (nullable)
- `lateEntryFeePercent: Float` (nullable)

### Zápis

- **Event fee-konfigurace:** rozšířit zabezpečené event handlery
  (`event.secure.handlers.ts`) o nová pole, stejným vzorem jako stávající
  `entriesOpenAt`/`entriesCloseAt`.
- **Cena kategorie (`Class.fee`):** pro nastavení ceny organizátorem zatím
  neexistuje žádná class-edit mutace ani endpoint. Implementační plán musí
  navrhnout zápisovou cestu (REST endpoint nebo GraphQL mutace) podle
  existujících vzorů v modulu. Ověření vlastnictví eventu přes
  `ensureEventOwnerOrAdmin`.

### Shared Zod (`packages/shared/src/models`)

- `classSchema`: `fee` (number, nullable, optional).
- event schéma: `currency`, `vatPayer`, `vatRate`, `lateEntryFeePercent`.

## Migrace

Jedna nová migrace (`ADD COLUMN` na `Event` a `Class`):

- `Event.currency` s defaultem `CZK` (pokryje existující řádky).
- `Event.vatPayer` default `false`.
- `Event.vatRate`, `Event.lateEntryFeePercent`, `Class.fee` jako nullable.

Po změně schématu spustit `db:generate` (regeneruje Prisma Client a Pothos typy)
a aktualizovat GraphQL schema snapshot (`schema.test.ts`).

## Testy

- Unit testy čisté funkce dopočtu (`class.fee.ts`): základ bez přirážky, s
  přirážkou po termínu, před termínem, plátce vs. neplátce, zaokrouhlení,
  `baseFee = null`.
- Aktualizace `class.graphql` / event fixtures, kde se rozšiřuje tvar.
- GraphQL schema snapshot.

## Mimo rozsah

- Snímek účtované ceny u závodníka (`Competitor`) pro účetní podklady na úrovni
  jednotlivých přihlášek.
- Platby / úhrady / fakturace.
- Více cenových pásem s daty platnosti (IOF `Fee` styl).
- Automatické plnění `Class.fee` z IOF XML importu (`Fee` element má jinou
  strukturu).
