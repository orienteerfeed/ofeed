# Class Settings Tab — Design

- **Date:** 2026-06-04
- **Status:** Approved (design phase)
- **Area:** `apps/client` (Event Settings), `apps/server` (class module), `packages/shared`

## Summary

Restructure the Event Settings page into tabs and add a new **Classes /
Kategorie** tab for editing per-class configuration. The current settings
content moves unchanged into a **General / Obecné** tab. The new tab presents the
event's classes in the existing `AppDataTable` with **hybrid save-on-blur**
inline editing, plus a read-only dialog showing the free start slots for a
selected class.

Scope is **update-only**: classes originate from imports (start lists / IOF
XML), `name` is not editable, and no manual create/delete is provided.

## Decisions (resolved during brainstorming)

| Topic | Decision |
| --- | --- |
| Edit UX | **Hybrid save-on-blur** — independent fields persist immediately on blur/change; paired fields commit together after pair validation |
| CRUD scope | **Update only** — no manual create/delete |
| Free start times | **Read-only** list (time + optional bib), sorted by time |
| `minTeamMembers` / `maxTeamMembers` | Both editable, as a pair, only when `event.relay`; validate `minTeamMembers ≤ maxTeamMembers` when both set |

## Editable fields

| Field | DB type | Editing | Validation |
| --- | --- | --- | --- |
| `name` | `VarChar` | **read-only (displayed)** | — |
| `maxNumberOfCompetitors` | `Int?` | number input, save on blur | integer `≥ 0` or null |
| `minAge` | `Int?` | **paired with maxAge**, save on pair commit. Entered/displayed in the UI as a **birth year** ("Birth year to" / "Ročník do"), stored as age; client converts `age = currentYear − birthYear` | integer `≥ 0` or null; `minAge ≤ maxAge` when both set |
| `maxAge` | `Int?` | **paired with minAge**. Entered/displayed as a **birth year** ("Birth year from" / "Ročník od"); `from → maxAge`, `to → minAge` | integer `≥ 0` or null |
| `minTeamMembers` | `Int?` | **paired with maxTeamMembers**, save on pair commit; **columns shown only when `event.relay`** | integer `≥ 1` or null; `minTeamMembers ≤ maxTeamMembers` when both set |
| `maxTeamMembers` | `Int?` | **paired with minTeamMembers** | integer `≥ 1` or null |
| `sex` | `Sex` enum (`B`/`M`/`F`) | select, save on change | one of `B`, `M`, `F` |
| `resultListMode` | `ResultListMode?` enum | select (incl. "—" / null), save on change | `Default` \| `Unordered` \| `UnorderedNoTimes` \| null |
| `fee` | `Decimal(10,2)?` | decimal input, save on blur | `≥ 0`, at most 2 decimal places, or null (reuse existing `validateClassFee`) |
| `startMode` | `StartMode?` enum | select (incl. "—" / null = inherit event default), save on change | one of `StartList`, `MassStart`, `PursuitStart`, `WaveStart`, `FreeStart`, or null |

Rows are **sorted by `name`** (server `orderBy: { name: 'asc' }`).

## Architecture

### 1. Settings layout (tabs)

`apps/client/src/pages/Event/Settings/EventSettingsPage.tsx` wraps its content in
the existing `Tabs` molecule (`src/components/molecules/Tabs.tsx`):

- **General / Obecné** — current settings content moved 1:1 into the tab body.
  Extracted into a `GeneralSettingsTab` component (or kept inline) so the page
  file stays focused.
- **Classes / Kategorie** — new `ClassesSettingsTab` component.

The active tab is reflected in the URL via `?tab=` query param, mirroring the
existing `EventDetailTabs` pattern (`navigate({ search, replace: true })`).
Authorization gating (`hasEventOwnerAccess`) stays at the page level and wraps
both tabs.

### 2. `ClassesSettingsTab`

- Fetches classes via the existing GraphQL `eventClasses(eventId)` query
  (Apollo, per client rule "GraphQL → Apollo"). Server returns classes ordered
  by `name`.
- Renders `AppDataTable` with the columns above. The `minTeamMembers` and
  `maxTeamMembers` columns are conditionally included based on `event.relay`.
- **Hybrid save-on-blur behaviour:**
  - Independent fields (`maxNumberOfCompetitors`, `fee`, `sex`,
    `resultListMode`, `startMode`) persist immediately — text/number on `blur`,
    selects on `change`.
  - Paired fields (`minAge`/`maxAge`, and `minTeamMembers`/`maxTeamMembers`) are
    validated together and committed once the pair is valid.
  - Each save runs an **optimistic update**; on mutation error the cell **reverts**
    to the previous value and an error toast is shown.
  - Client-side validation mirrors the server using the shared
    `classUpdateInputSchema`; invalid input shows an inline error and is not sent.
- An **actions** column has a button opening the free-start-times dialog for that
  class.

### 3. Free start times dialog

- Read-only `Dialog` listing the class's vacant start slots (`startTime` +
  optional `bibNumber`), sorted by time, with an empty state when none.
- Data from a new read-only GraphQL query `classStartSlotVacancies(classId)`.

## Backend

### Mutation: `classUpdate`

- New Pothos mutation in `apps/server/src/modules/class/class.graphql.ts`:
  `classUpdate(input: UpdateClassInput): ResponseMessage`, where
  `UpdateClassInput` carries `classId` plus **only the changed fields** (all
  optional). Returns the standard `ResponseMessage`.
- New service `updateClassForGraphQL(prisma, auth, input)` in
  `class.service.ts`:
  - Authorize with `requireEventOwnerOrAdmin` against the owning event (same as
    `classFeeUpdate`).
  - Validate every provided field server-side (authoritative):
    `maxNumberOfCompetitors ≥ 0`, `minAge ≥ 0`, `maxAge ≥ 0`,
    `minAge ≤ maxAge` (when both present), `minTeamMembers ≥ 1`,
    `maxTeamMembers ≥ 1`, `minTeamMembers ≤ maxTeamMembers` (when both present),
    `sex ∈ {B,M,F}`,
    `resultListMode` enum|null, `startMode` enum|null, and `fee` via the existing
    `validateClassFee`.
  - Persist only the provided fields via `prisma.class.update`.
- `classFeeUpdate` stays as-is (no removal) to avoid breaking current callers.

### Query: `classStartSlotVacancies`

- New read-only Pothos query exposing `{ id, startTime, bibNumber }` for a class,
  backed by the existing `listStartSlotVacanciesByClass` service.

## Shared contracts

- Add `classUpdateInputSchema` to `packages/shared/src/models/class.ts` — a Zod
  schema picking the editable fields, all optional, with the cross-field refines
  (`minAge ≤ maxAge`, `minTeamMembers ≤ maxTeamMembers`). Exported from the
  package index and reused by both client (inline validation) and server
  (`z.infer` input type).
- Rebuild `@repo/shared` and confirm both client and server type-check.

## i18n

Add keys in **all six locales** (`en`, `cs`, `es`, `de`, `sv`, `fr`):

- Tab labels: General → "Obecné", Classes → "Kategorie".
- Column headers, select option labels (sex / resultListMode / startMode), the
  "inherit default" / null option label, validation messages, the dialog title,
  and the empty state.

## Testing

- **Server (Vitest):** unit tests for `updateClassForGraphQL` — per-field
  validation (including cross-field `minAge ≤ maxAge`,
  `minTeamMembers ≤ maxTeamMembers`, fee decimals) and authorization failure for
  non-owner.
- **Client (Vitest + jsdom):** component test for `ClassesSettingsTab` covering
  save-on-blur of an independent field, revert-on-error, and paired
  `minAge`/`maxAge` validation. Conditional `minTeamMembers`/`maxTeamMembers`
  column visibility driven by `event.relay`.

## Out of scope

- Manual create / delete of classes.
- Editing `name`, `startName`, course metadata
  (`length`/`climb`/`controlsCount`).
- Manual management (add/remove) of start slot vacancies.
- Bulk "edit all rows at once" mode.

## Affected files (anticipated)

- `apps/client/src/pages/Event/Settings/EventSettingsPage.tsx` (tab wrapper)
- `apps/client/src/pages/Event/Settings/ClassesSettingsTab.tsx` (new)
- `apps/client/src/pages/Event/Settings/ClassStartTimesDialog.tsx` (new)
- `apps/server/src/modules/class/class.graphql.ts` (mutation + query)
- `apps/server/src/modules/class/class.service.ts` (update service)
- `apps/server/src/modules/start-slot-vacancy/start-slot-vacancy.graphql.ts` (per-class vacancy query — or co-located in class module)
- `packages/shared/src/models/class.ts` (+ index)
- `apps/client/src/i18n/locales/*/**` (6 locales)
- Test files under `apps/server/.../__tests__/` and client `__tests__`/`tests`
