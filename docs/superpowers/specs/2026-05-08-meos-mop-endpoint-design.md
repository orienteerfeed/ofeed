# MeOS MOP Endpoint Design

**Date:** 2026-05-08
**Status:** Approved
**Author:** Martin Křivda

## Overview

Add a `POST /rest/v1/upload/meos` endpoint that receives live results from MeOS
(timing software) using the MeOS Online Protocol (MOP). MeOS pushes raw XML
payloads identified by an integer competition ID and a required event password. The
endpoint must always respond with MOP-compatible XML (never JSON) and always
return HTTP 200.

## Background

MeOS Online Protocol (MOP) uses the namespace `http://www.melin.nu/mop` and
sends either a `MOPComplete` (full snapshot) or `MOPDiff` (incremental diff)
document. MeOS identifies a competition by an integer sent in the `competition`
HTTP header. Our internal events use CUID strings, so a mapping table is
required.

---

## 1. Data Model

### 1.1 New model: `EventMeosBinding`

Maps a MeOS integer competition ID to an internal event.

```prisma
model EventMeosBinding {
  id                Int       @id @default(autoincrement()) @db.UnsignedInt
  event             Event     @relation(fields: [eventId], references: [id], onDelete: Cascade)
  eventId           String
  meosCompetitionId Int       @unique @db.UnsignedInt
  isActive          Boolean   @default(true)
  lastUploadAt      DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  @@index([eventId])
}
```

- `meosCompetitionId` is globally unique — one integer ID maps to exactly one
  event.
- `isActive` allows deactivating a binding without deleting it.
- **No `passwordHash` field.** Password protection reuses the existing
  `EventPassword` record for the event (see §3.1 step 5).

### 1.2 Enum addition: `ImportSourceType`

Add `MEOS` to the existing enum:

```prisma
enum ImportSourceType {
  IOF_XML
  MEOS
}
```

### 1.3 Reuse: `EventImportState`

No column changes. MeOS uploads are recorded using:

| Field | Value |
|---|---|
| `sourceType` | `MEOS` |
| `payloadType` | `MOPComplete` or `MOPDiff` |
| `rawHash` | SHA-256 hex of the raw request body |
| `rootElement` | `MOPComplete` or `MOPDiff` |
| `lastSuccessfulImportAt` | set on success |
| `successCount` | incremented on success |

The existing `upsertImportState` helper from `upload.import-state.ts` is reused
directly.

### 1.4 No changes to existing tables

Because `MOPComplete` performs a **full event reset** (see §3.1), there is no
need for an `importSource` column on `Competitor`, `Class`, `Organisation`, or
`Team`. All rows are deleted and re-inserted on each complete upload.

---

## 2. Module Structure

New module: `apps/server/src/modules/meos/`

```
modules/meos/
  index.ts                      // re-exports router
  meos.routes.ts                // createRouter() + registerMeosRoutes()
  meos.handlers.ts              // POST /meos handler
  meos.parser.ts                // MOP XML → typed objects
  meos.service.ts               // DB operations (reset, upsert, delete)
  meos.openapi.ts               // basePath + OpenAPI path item
  __tests__/
    meos.handlers.test.ts
    meos.parser.test.ts
    meos.service.test.ts
```

Registered in `routes/rest/registry.ts` and `routes/rest/paths.ts` using
`MEOS_OPENAPI.basePath` (`/rest/v1/upload/meos`).

**No JWT middleware.** The `meos.routes.ts` router does NOT call `requireAuth`.
Authentication is handled inside the handler via the `competition`/`pwd` headers.

---

## 3. Endpoint Behaviour

**Route:** `POST /rest/v1/upload/meos`
**Content-Type accepted:** `text/plain`
**Response Content-Type:** `text/xml` (always)
**HTTP status:** always `200`

### 3.1 Processing pipeline

Steps are executed in order; on any failure the appropriate MOP status is
returned immediately.

1. **Size guard** — reject bodies exceeding `MEOS_MAX_BODY_BYTES` (default
   10 MB) before reading. Respond `ERROR`.
2. **ZIP check** — if the raw body starts with `PK`, respond `NOZIP` and write
   an `EventImportState` skip record if a valid binding was already found
   (otherwise just respond).
3. **`competition` header** — must be present and parseable as a positive
   integer. Absent or invalid → `BADCMP`.
4. **Binding lookup** — find `EventMeosBinding` where
   `meosCompetitionId = competition AND isActive = true`. Not found → `BADCMP`.
5. **Password check** — look up `EventPassword` for the binding's `eventId`.
   A non-expired record must exist. If no `EventPassword` exists or it has
   expired, respond `BADPWD`. Otherwise, decrypt the stored password with
   `decrypt(decodeBase64(password))` and compare it to the `pwd` header
   (plaintext equality). Missing or mismatched `pwd` → `BADPWD`.
6. **XML parse** — use `@xmldom/xmldom` `DOMParser`. Invalid XML → log error,
   respond `ERROR`.
7. **Root element check** — accept only `MOPComplete` or `MOPDiff`. Any other
   root → `ERROR`.
8. **Process in Prisma transaction** — see §3.2 and §3.3.
9. **`EventImportState` upsert** — call `upsertImportState` with
   `sourceType = MEOS`.
10. **`EventMeosBinding.lastUploadAt`** — update to `now()`.
11. **Respond `OK`.**

### 3.2 `MOPComplete` — full event reset

Inside a single `prisma.$transaction`:

1. `deleteMany` Split where `competitor.class.eventId = eventId`
2. `deleteMany` Protocol where `competitor.class.eventId = eventId`
3. `deleteMany` Competitor where `class.eventId = eventId`
4. `deleteMany` Team where `class.eventId = eventId`
5. `deleteMany` Class where `eventId = eventId`
6. `deleteMany` Organisation where `eventId = eventId`
7. Process all elements from the payload using the same upsert logic as
   MOPDiff (orgs → classes → competitors → teams).

### 3.3 `MOPDiff` — incremental update

Elements are processed in dependency order within the transaction:

| Element | Unique key | Action |
|---|---|---|
| `<competition>` | — | Read-only for now (zero-time, date noted in log) |
| `<org id="X">` | `(eventId, externalId)` | Upsert `Organisation` |
| `<cls id="X">` | `(eventId, externalId)` | Upsert `Class` |
| `<ctrl id="X">` | — | Not persisted; control codes used only via `<radio>` splits |
| `<cmp id="X">` | `(classId, externalId)` | Upsert `Competitor` + replace `Split` rows |
| `<tm id="X">` | `(classId, externalId)` | Upsert `Team` |

Delete operations (`delete="true"` attribute) find the row by `externalId`
scoped to the event and delete it. Because the Prisma schema has no
`onDelete: Cascade` on `Split → Competitor`, `Split` rows must be deleted
explicitly before the `Competitor` row (same order as the full reset in §3.2).

---

## 4. XML Processing

### 4.1 Parser

`@xmldom/xmldom` `DOMParser` is used for all MOP XML parsing. It does not load
external entities in Node.js — XXE attacks are not possible. MOP namespace
(`http://www.melin.nu/mop`) is parsed but not enforced.

Parsed elements are converted to typed objects in `meos.parser.ts` before being
handed to the service layer.

### 4.2 Competitor field mapping

| MOP source | DB field | Conversion |
|---|---|---|
| `<cmp id>` | `Competitor.externalId` | String |
| `<cmp card>` | `Competitor.card` | Integer |
| `<base>` text | `firstname` + `lastname` | Split on first space |
| `<base org>` | `Competitor.organisationId` | Resolved from `Organisation.externalId` |
| `<base cls>` | `Competitor.classId` | Resolved from `Class.externalId` |
| `<base stat>` | `Competitor.status` | Mapped via stat table (see §4.3) |
| `<base st>` ÷ 10 | `Competitor.startTime` | Tenths-of-second from midnight → DateTime using event date + timezone |
| `<base rt>` ÷ 10 | `Competitor.time` | Tenths-of-second → seconds |
| `<radio>` pairs | `Split[]` | `code,tenths` → `{ controlCode, time: tenths ÷ 10 }` |
| `<input tstat>` | `Competitor.status` | Overrides `stat` when present |
| derived | `Competitor.finishTime` | Not stored — `finishTime` is not derived or persisted in this iteration |

### 4.3 MOP `stat` → `ResultStatus` mapping

| MOP stat | ResultStatus |
|---|---|
| 0 | `Inactive` |
| 1 | `OK` |
| 2 | `MissingPunch` |
| 3 | `DidNotFinish` |
| 4 | `Disqualified` |
| 5 | `DidNotStart` |
| 9 | `NotCompeting` |
| 10 | `Active` |
| 20 | `Finished` |
| 99 | `Cancelled` |
| other | `Inactive` (safe default) |

---

## 5. Error Handling

**Rule:** always return HTTP 200 with a MOP XML body. Never return JSON. Never
expose internal error details in the response.

| Scenario | MOP status |
|---|---|
| Body starts with `PK` | `NOZIP` |
| `competition` header absent or non-integer | `BADCMP` |
| No active binding found | `BADCMP` |
| Password mismatch | `BADPWD` |
| Body exceeds size limit | `ERROR` |
| Malformed XML | `ERROR` |
| Unsupported root element | `ERROR` |
| Transaction / DB error | `ERROR` |
| Success | `OK` |

**Pino logging** — structured log at each stage. Fields: `meosCompetitionId`,
`eventId` (if resolved), `rootElement` (if parsed), `status`, `payloadSizeBytes`,
`stage`, `reason` (errors only). Passwords and raw body content are never logged.

**MOP response strings:**

```
<?xml version="1.0"?><MOPStatus status="OK"></MOPStatus>
<?xml version="1.0"?><MOPStatus status="BADCMP"></MOPStatus>
<?xml version="1.0"?><MOPStatus status="BADPWD"></MOPStatus>
<?xml version="1.0"?><MOPStatus status="NOZIP"></MOPStatus>
<?xml version="1.0"?><MOPStatus status="ERROR"></MOPStatus>
```

---

## 6. Testing

Tests in `modules/meos/__tests__/`. Vitest, Prisma mocked via
`vi.mock('@/utils/context.js')`.

| Test | Assertion |
|---|---|
| Successful `MOPComplete` | Full reset executed; `EventImportState` upserted; response `OK` |
| Successful `MOPDiff` | Incremental upsert applied; response `OK` |
| Missing `competition` header | Response `BADCMP` |
| Unknown competition ID | Response `BADCMP` |
| Wrong password | Response `BADPWD` |
| No password configured or password expired | Response `BADPWD` |
| ZIP payload (`PK…`) | Response `NOZIP` |
| Invalid XML | Response `ERROR` |
| Delete operation (`delete="true"`) | Competitor / org removed |
| UTF-8 names (Swedish/Czech) | `Åsa Björk`, `Štěpán Novák` round-trip correctly |
| Repeated `MOPComplete` | Idempotent — second upload produces same DB state |
| Oversized body | Response `ERROR` before XML parsing |

---

## 7. Constraints and Non-Goals

- **HTTPS only** — the `pwd` header is sent in plaintext by MeOS; the deployment
  must enforce TLS (handled at Traefik/ingress level, not in this endpoint).
- **No admin UI** — creating/managing `EventMeosBinding` rows is out of scope
  for this spec; rows can be inserted directly via DB or a future admin endpoint.
- **`<competition>` element** — event name / zero-time from MeOS is logged but
  not written back to the `Event` table in this iteration.
- **`finishTime`** — not derived or stored; MeOS does not send a dedicated
  finish timestamp.
- **`Team.bibNumber`** — the DB column is non-nullable; defaults to `0` when the
  MOP `<tm>` element carries no bib number.
- **`<ctrl>` elements** — control definitions are not persisted; control codes
  appear only as split keys in `<radio>` data.
