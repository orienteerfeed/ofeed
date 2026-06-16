# Files Tab — Import State Metadata Display

**Date:** 2026-06-11  
**Status:** Approved

## Summary

Add small import-state metadata to each `FileSection` card in the Files settings tab. The metadata comes from `EventImportState` DB records and shows: creator, externalStatus, lastSuccessfulImport, successCount, skippedCount, and a click-to-copy rawHash.

## Context

`EventImportState` is populated on every IOF XML upload. It is keyed by `(eventId, sourceType, payloadType)`. The three payload types map to the three existing file sections:

| `payloadType` | FileSection card |
|---|---|
| `StartList` | Start List |
| `CourseData` | Courses |
| `ResultList` | Results |

The existing `eventFilesStatus` query is not modified. Import state is fetched via a new, independent query.

## Architecture

### Server

**New GraphQL query** added alongside `eventFilesStatus` in `apps/server/src/modules/course/course.graphql.ts`:

```graphql
eventImportStates(eventId: String!): [EventImportState!]!
```

Auth guard: same `requireEventOwnerOrAdmin` as `eventFilesStatus`.

Resolver: `prisma.eventImportState.findMany({ where: { eventId } })` — returns all records for the event.

**New Pothos object type** `EventImportState` (defined in `course.graphql.ts`):

| Field | Type | Notes |
|---|---|---|
| `sourceType` | `String` | `IOF_XML` / `MEOS` |
| `payloadType` | `String` | `StartList` / `CourseData` / `ResultList` |
| `rawHash` | `String` | SHA-256 hex, 64 chars |
| `creator` | `String?` | nullable |
| `externalStatus` | `String?` | nullable |
| `lastSuccessfulImportAt` | `DateTime?` | nullable, uses existing DateTime scalar |
| `successCount` | `Int` | |
| `skippedCount` | `Int` | |

The type is backed by the Prisma `EventImportState` model. `lastSuccessfulImportAt` uses the existing server-side `DateTime` scalar (ISO 8601, serialised via `formatUtcDateTimeRfc3339`).

### Client

**Location:** `apps/client/src/pages/Event/Settings/FilesSettingsTab.tsx`

**New Apollo query** `GET_EVENT_IMPORT_STATES` fetches in parallel with the existing `GET_EVENT_FILES_STATUS` using two `useQuery` calls at the top of `FilesSettingsTab`.

**Mapping** (constant object):

```ts
const PAYLOAD_TYPE_TO_SECTION = {
  StartList: 'startList',
  CourseData: 'courses',
  ResultList: 'results',
} as const;
```

Only `sourceType === 'IOF_XML'` records are considered. MEOS records are filtered out on the client.

**`FileSection` prop change:** adds optional `importState?: ImportStateInfo | null`. When `null` or `undefined`, the metadata block is not rendered.

**New inline sub-component `ImportStateMeta`** rendered in `CardContent` below `DragDropFile`:

```
┌─────────────────────────────────────────────────────┐
│  [DragDropFile]                                     │
│                                                     │
│  ─────────────────────────────────────────────────  │
│  Creator: Condes 8.5          Status: Complete      │
│  Poslední import: 11. 6. 2026 14:32                 │
│  Importováno: 3×    Přeskočeno: 1×                  │
│  Hash: a3f9c1b2…  [copy icon]                       │
└─────────────────────────────────────────────────────┘
```

- All text uses `text-xs text-muted-foreground`.
- A `<Separator />` (shadcn, `@radix-ui/react-separator`) divides the upload zone from the metadata block.
- Hash display: first 8 chars + `…`, `font-mono`. The entire hash row (label + truncated value + copy icon) is a `<button>` with `cursor-pointer`. On click: copy full 64-char hash via `navigator.clipboard.writeText` + show toast using `t('Pages.Event.Settings.Files.ImportState.HashCopied')`.
- Null fields (`creator`, `externalStatus`) are omitted from the layout rather than showing empty labels.

### i18n

New keys added to all 6 locale files (`en`, `cs`, `de`, `es`, `fr`, `sv`) under `Pages.Event.Settings.Files.ImportState`:

| Key | EN |
|---|---|
| `Creator` | `Creator` |
| `Status` | `Status` |
| `LastImport` | `Last import` |
| `SuccessCount` | `Imported` |
| `SkippedCount` | `Skipped` |
| `HashCopied` | `Hash copied to clipboard` |
| `TimesCount` | `{{count}}×` |

Date formatting uses `date-fns` (existing dependency), consistent with patterns elsewhere in the client.

## Data Flow

```
FilesSettingsTab
  ├── useQuery(GET_EVENT_FILES_STATUS)   → existing, unchanged
  └── useQuery(GET_EVENT_IMPORT_STATES) → new, parallel
        ↓ maps by payloadType (IOF_XML only)
  FileSection (startList)
    └── ImportStateMeta (if importState present)
  FileSection (courses)
    └── ImportStateMeta (if importState present)
  FileSection (results)
    └── ImportStateMeta (if importState present)
```

## Error Handling

- If `GET_EVENT_IMPORT_STATES` fails, import metadata is simply not shown. The upload functionality (driven by `GET_EVENT_FILES_STATUS`) is unaffected.
- If `navigator.clipboard` is unavailable (non-secure context), the copy operation fails silently — no toast, no error.

## Testing

- Server: unit test for the new resolver in `course.service.test.ts` (or a new `import-state.service.test.ts`) verifying the Prisma query is called with the correct `eventId`.
- Client: Vitest test in `tests/pages/Event/Settings/FilesSettingsTab.test.tsx` covering:
  - Metadata is rendered when `importState` is present.
  - Metadata block is hidden when `importState` is absent.
  - Hash copy calls `navigator.clipboard.writeText` with the full hash and shows toast.

## Out of Scope

- MEOS import state display (ignored in this iteration).
- Displaying `lastSkippedAt` or `formatVersion` (not requested).
- Editing or resetting import state from the UI.
