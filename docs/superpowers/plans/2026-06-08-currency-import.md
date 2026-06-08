# Currency Import from ORIS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the `Currency` field from ORIS `getEvent` responses through the import preview pipeline so the currency form field is pre-filled when importing an event.

**Architecture:** A key array constant is added to the generic extraction layer; `currencyRaw` threads through `InternalCandidate` → `ExternalEventPreview`; the client `applyImportedDraft` reads it and sets the form field. No DB queries, no validation — the existing create-event handler validates the code at submit time.

**Tech Stack:** TypeScript, Vitest (server tests), TanStack Form (client).

---

## Files

| File | Change |
|------|--------|
| `apps/server/src/modules/event/event.import.service.ts` | Add `CURRENCY_KEYS`, `currencyRaw` on `InternalCandidate`, extraction in `extractCandidates()`, `currency` on `ExternalEventPreview`, inclusion in `loadExternalEventPreview()` return |
| `apps/server/src/modules/event/__tests__/event.import.service.test.ts` | Add `Currency` to mock payload and assert `preview.currency` |
| `apps/client/src/pages/Event/Settings/EventForm.tsx` | Add `currency` to `ExternalEventPreviewDraft`, set field in `applyImportedDraft()` |

---

## Task 1: Server — add currency extraction and propagation (TDD)

**Files:**
- Modify: `apps/server/src/modules/event/__tests__/event.import.service.test.ts:38-87`
- Modify: `apps/server/src/modules/event/event.import.service.ts`

- [ ] **Step 1.1: Add `Currency` to the mock payload and assert it on the preview**

In `apps/server/src/modules/event/__tests__/event.import.service.test.ts`, inside the existing test `'maps nested ORIS discipline short names to internal event discipline values'`, add `Currency: 'CZK'` to the `Data` object and add one assertion at the end of the assertion block.

The `Data` object (currently ends at `StartTime: '10:00'`) becomes:

```ts
Data: {
  ID: '8835',
  Name: 'Oblastni zebricek',
  Date: '2025-10-11',
  Place: 'Dvorisko',
  Org1: {
    ID: '47',
    Abbr: 'CHC',
    Name: 'K.O.B. Chocen',
  },
  Sport: {
    ID: '1',
    NameCZ: 'OB',
    NameEN: 'Foot O',
  },
  Discipline: {
    ID: '2',
    ShortName: 'MD',
    NameCZ: 'Stredni trat',
    NameEN: 'Middle distance',
  },
  Ranking: '1',
  RankingKoef: '1,00',
  RankingKS: '0',
  StartTime: '10:00',
  Currency: 'CZK',
},
```

After the existing assertions (currently ends with `expect(preview.discipline).toBe('MIDDLE')`), add:

```ts
expect(preview.currency).toBe('CZK');
```

- [ ] **Step 1.2: Run the test to confirm it fails**

```bash
cd apps/server && pnpm test -- --reporter=verbose event.import.service
```

Expected: the test named `'maps nested ORIS discipline short names...'` fails with something like `TypeError: Cannot read properties of undefined` or `expected undefined to be 'CZK'`. Any failure is correct — the field does not exist yet.

- [ ] **Step 1.3: Add `CURRENCY_KEYS` constant**

In `apps/server/src/modules/event/event.import.service.ts`, after the `DISCIPLINE_KEYS` block (currently ends around line 210), add:

```ts
const CURRENCY_KEYS = ['Currency', 'currency'];
```

- [ ] **Step 1.4: Add `currencyRaw` to `InternalCandidate`**

In `apps/server/src/modules/event/event.import.service.ts`, in the `InternalCandidate` type (lines 52–69), add `currencyRaw` after `disciplineRaw`:

```ts
type InternalCandidate = {
  externalEventId: string;
  name: string;
  date?: string;
  organizer?: string;
  location?: string;
  countryRaw?: string;
  timezoneRaw?: string;
  sportRaw?: string;
  zeroTimeRaw?: string;
  latitude?: number;
  longitude?: number;
  ranking?: boolean;
  coefRanking?: number;
  relay?: boolean;
  disciplineRaw?: string;
  currencyRaw?: string;
  score: number;
};
```

- [ ] **Step 1.5: Read `currencyRaw` in `extractCandidates()`**

In `apps/server/src/modules/event/event.import.service.ts`, in the `candidate` object literal inside `extractCandidates()` (currently the last field before `score` is `disciplineRaw`), add `currencyRaw` after `disciplineRaw`:

```ts
const candidate: InternalCandidate = {
  externalEventId,
  name,
  date: normalizeDate(readString(record, DATE_KEYS)),
  organizer: readOrganizer(record),
  location: readString(record, LOCATION_KEYS),
  countryRaw: readString(record, COUNTRY_KEYS),
  timezoneRaw: readString(record, TIMEZONE_KEYS),
  sportRaw: readString(record, SPORT_KEYS),
  zeroTimeRaw: readString(record, ZERO_TIME_KEYS),
  latitude: readNumber(record, LATITUDE_KEYS),
  longitude: readNumber(record, LONGITUDE_KEYS),
  ranking: readBoolean(record, RANKING_KEYS),
  coefRanking: readNumber(record, COEF_RANKING_KEYS),
  relay: readBoolean(record, RELAY_KEYS),
  disciplineRaw: readString(record, DISCIPLINE_KEYS),
  currencyRaw: readString(record, CURRENCY_KEYS),
  score: scoreCandidate(record),
};
```

- [ ] **Step 1.6: Add `currency` to `ExternalEventPreview`**

In `apps/server/src/modules/event/event.import.service.ts`, in the `ExternalEventPreview` type (lines 32–50), add `currency` after `hundredthPrecision`:

```ts
export type ExternalEventPreview = {
  provider: ExternalEventProvider;
  externalEventId: string;
  name: string;
  sportId?: number;
  date?: string;
  timezone?: string;
  organizer?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  countryCode?: string;
  zeroTime?: string;
  ranking?: boolean;
  coefRanking?: number;
  discipline?: EventDiscipline;
  published?: boolean;
  hundredthPrecision?: boolean;
  currency?: string;
};
```

- [ ] **Step 1.7: Include `currency` in `loadExternalEventPreview()` return value**

In `apps/server/src/modules/event/event.import.service.ts`, in the `return` block of `loadExternalEventPreview()` (currently ends with `hundredthPrecision: false`), add `currency` as the last field:

```ts
return {
  provider: body.provider,
  externalEventId: selected.externalEventId,
  name: selected.name,
  sportId,
  date,
  timezone,
  organizer: selected.organizer,
  location: selected.location,
  latitude: selected.latitude,
  longitude: selected.longitude,
  countryCode,
  zeroTime: normalizeTime(selected.zeroTimeRaw, date),
  ranking: selected.ranking ?? false,
  coefRanking: selected.coefRanking,
  discipline:
    resolveImportedEventDiscipline(body.provider, selected.disciplineRaw) ??
    (selected.relay ? 'RELAY' : undefined),
  published: false,
  hundredthPrecision: false,
  currency: selected.currencyRaw?.toUpperCase(),
};
```

- [ ] **Step 1.8: Run the test to confirm it passes**

```bash
cd apps/server && pnpm test -- --reporter=verbose event.import.service
```

Expected output: all tests in `event.import.service` pass, including `'maps nested ORIS discipline short names...'`.

- [ ] **Step 1.9: Run the full server test suite**

```bash
cd apps/server && pnpm test
```

Expected: all tests pass. No regressions.

- [ ] **Step 1.10: Commit**

```bash
git add apps/server/src/modules/event/event.import.service.ts \
        apps/server/src/modules/event/__tests__/event.import.service.test.ts
git commit -m "feat(import): propagate Currency field from ORIS through event preview pipeline"
```

---

## Task 2: Client — pre-fill currency form field from import preview

**Files:**
- Modify: `apps/client/src/pages/Event/Settings/EventForm.tsx:85-103` (type)
- Modify: `apps/client/src/pages/Event/Settings/EventForm.tsx:843-907` (applyImportedDraft)

- [ ] **Step 2.1: Add `currency` to `ExternalEventPreviewDraft`**

In `apps/client/src/pages/Event/Settings/EventForm.tsx`, in the `ExternalEventPreviewDraft` type (lines 85–103), add `currency` after `hundredthPrecision`:

```ts
type ExternalEventPreviewDraft = {
  provider: ExternalProvider;
  externalEventId: string;
  name: string;
  sportId?: number;
  date?: string;
  timezone?: string;
  organizer?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  countryCode?: string;
  zeroTime?: string;
  discipline?: EventFormData['discipline'];
  ranking?: boolean;
  coefRanking?: number;
  published?: boolean;
  hundredthPrecision?: boolean;
  currency?: string;
};
```

- [ ] **Step 2.2: Pre-fill the currency field in `applyImportedDraft()`**

In `apps/client/src/pages/Event/Settings/EventForm.tsx`, inside `applyImportedDraft()`, after the `hundredthPrecision` block (which currently ends the function body), add:

```ts
if (draft.currency) {
  form.setFieldValue('currency', draft.currency);
}
```

The end of the function should look like:

```ts
    if (typeof draft.hundredthPrecision === 'boolean') {
      form.setFieldValue('hundredthPrecision', draft.hundredthPrecision);
    }

    if (draft.currency) {
      form.setFieldValue('currency', draft.currency);
    }
  };
```

- [ ] **Step 2.3: Type-check the client**

```bash
cd apps/client && pnpm type-check
```

Expected: exits with no errors.

- [ ] **Step 2.4: Run client tests**

```bash
cd apps/client && pnpm test
```

Expected: all tests pass.

- [ ] **Step 2.5: Commit**

```bash
git add apps/client/src/pages/Event/Settings/EventForm.tsx
git commit -m "feat(import): pre-fill currency form field from ORIS import preview"
```
