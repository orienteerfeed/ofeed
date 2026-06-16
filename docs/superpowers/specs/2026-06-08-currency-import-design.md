# Currency Import from ORIS

**Date:** 2026-06-08
**Scope:** Wire the `Currency` field from ORIS event data through the import preview pipeline into the event creation form.

## Background

ORIS returns `"Currency":"CZK"` as a top-level string in the `Data` object of its `getEvent` response. The existing import pipeline (`extractCandidates` → `ExternalEventPreview` → `applyImportedDraft`) does not read or propagate this field, so the currency form field always defaults to `CZK` instead of being pre-filled from the source.

Eventor has no top-level currency field on the event object — currency appears only inside per-fee `amount.currency` nested under classes. Eventor support is out of scope for this change.

## Approach

Pass the raw currency string through the preview pipeline without additional validation. The secure create-event handler already performs a `prisma.currency.findUnique` lookup and throws a `ValidationError` for unknown codes, so no duplicate validation is needed in the preview step.

## Changes

### Server — `apps/server/src/modules/event/event.import.service.ts`

1. Add constant:
   ```ts
   const CURRENCY_KEYS = ['Currency', 'currency'];
   ```

2. Add field to `InternalCandidate`:
   ```ts
   currencyRaw?: string;
   ```

3. In `extractCandidates()`, read the field:
   ```ts
   currencyRaw: readString(record, CURRENCY_KEYS),
   ```

4. Add field to `ExternalEventPreview`:
   ```ts
   currency?: string;
   ```

5. In `loadExternalEventPreview()`, include in the returned object:
   ```ts
   currency: selected.currencyRaw?.toUpperCase(),
   ```
   Uppercased because ISO 4217 codes are uppercase and ORIS already sends them uppercase (`CZK`), but defensively normalising avoids any edge cases.

### Client — `apps/client/src/pages/Event/Settings/EventForm.tsx`

6. Add field to `ExternalEventPreviewDraft`:
   ```ts
   currency?: string;
   ```

7. In `applyImportedDraft()`, pre-fill the form field:
   ```ts
   if (draft.currency) {
     form.setFieldValue('currency', draft.currency);
   }
   ```

### Test — `apps/server/src/modules/event/__tests__/event.import.service.test.ts`

8. Add `Currency: 'CZK'` to the existing mock ORIS JSON payload.
9. Add `expect(preview.currency).toBe('CZK')` to the existing assertion block.

## Data Flow

```
ORIS API response
  └─ Data.Currency = "CZK"
       └─ extractCandidates()  →  InternalCandidate.currencyRaw
            └─ loadExternalEventPreview()  →  ExternalEventPreview.currency
                 └─ /import/preview response
                      └─ applyImportedDraft()  →  form field "currency"
                           └─ POST /  →  secure handler validates & resolves currencyId
```

## Out of Scope

- Eventor currency extraction (no top-level currency on the Eventor event object).
- Preview-time DB validation of the currency code (handled at create time).
- Any changes to the Currency DB table or GraphQL types.
