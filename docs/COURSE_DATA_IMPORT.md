# IOF CourseData import & radio-control administration

This document covers importing IOF XML **CourseData** (controls, courses, course
control order, and the Class ↔ Course assignment) and the manual administration
of radio / online controls.

It applies to the single-race domain model: one `Event` is one race, `Class` is
a race category, and a course belongs to an event. IOF `raceNumber` is
intentionally ignored — every `RaceCourseData` block is iterated, but the race
number is never stored or used.

## Data model

The import populates four course-data tables (see `apps/server/prisma/schema.prisma`):

| Model           | Purpose                                                                 |
| --------------- | ----------------------------------------------------------------------- |
| `CourseMap`     | Map extent / scale (`RaceCourseData/Map`).                              |
| `Control`       | A physical control, keyed by `(eventId, code)`.                        |
| `Course`        | A course, keyed by `(eventId, name)`; keeps `courseFamily`.            |
| `CourseControl` | One ordered leg of a course (`sequence` 1 = start, 2 = first control). |

`Class.courseId` links a class to its course.

### Coordinates

- IOF XML uses `Position@lat` / `Position@lng`; these map to `Control.latitude`
  / `Control.longitude`. Leaflet expects `[latitude, longitude]`.
- `Control.altitude` is nullable — not needed for rendering, kept for later use.
- `Control.mapX` / `mapY` (from `MapPosition`) are stored only as additional data
  for possible future rendering over a map image, not for geographic rendering.

### Radio controls

`Control.radio` flags a control as a radio / online control for which the UI
shows split times. It is **not** a control type — a control can have
`type = CONTROL` and `radio = true`. The flag is managed manually in
administration and is **preserved across reimports by default** (matched by
control code).

## Importing

```ts
import { importCourseDataXml } from '@/modules/course';

const result = await importCourseDataXml(eventId, xmlString, {
  // default: true — preserve manually set Control.radio flags by control code
  preserveManualRadioFlags: true,
});
```

Uploading an IOF `CourseData` XML through the existing `POST /rest/v1/upload/iof`
endpoint (root element auto-detected) runs this importer automatically, so the
event-settings **Files** tab and any external uploader share one code path.

The import:

- runs inside a single Prisma transaction;
- verifies the `Event` exists and that the XML root element is `CourseData`;
- replaces **only** course-data structures (`CourseControl`, `Course`,
  `Control`, `CourseMap`) and the `Class.courseId` assignment. It never deletes
  or modifies `Event`, `Class`, `Competitor`, `Split`, results, or split times;
- is **idempotent per `eventId`** — re-importing the same XML produces no
  duplicates;
- resolves each `CourseControl` to a `Control` by code. The original
  `controlCode` is always stored even when the relation cannot be resolved
  (`controlId` stays `null`); unresolved codes are returned in the result;
- assigns a class to a course by `ClassName` + `CourseName`, falling back to
  `CourseFamily` only when exactly one course matches that family for the event.
  Classes and courses are never created from assignments.

### Result

```ts
type ImportCourseDataResult = {
  mapsImported: number;
  controlsImported: number;
  coursesImported: number;
  courseControlsImported: number;
  classesAssigned: number;
  radioControlsPreserved: number;
  unresolvedControlCodes: string[];
  unresolvedClassAssignments: Array<{
    className: string;
    courseName?: string | null;
    courseFamily?: string | null;
  }>;
};
```

### Not supported (by design, for now)

- IOF `raceNumber`, `Course@numberOfCompetitors`, and `Course@modifyTime` are
  ignored and not stored.
- A `CourseControl` containing multiple `<Control>` values (alternative / forked
  controls) throws a validation error.
- `ControlPunchingUnit` and `CourseControlItem` are not implemented.

## Radio-control administration

Toggle the radio flag through the service or the GraphQL mutation. Both verify
the control belongs to the given event.

Service (`@/modules/course`):

```ts
await updateControlRadioFlag(prisma, { eventId, controlId, radio: true });
```

GraphQL mutation (requires event owner or admin):

```graphql
mutation ($eventId: String!, $controlId: Int!, $radio: Boolean!) {
  updateControlRadioFlag(eventId: $eventId, controlId: $controlId, radio: $radio) {
    id
    code
    radio
    type
  }
}
```

## Authorization

Course, control and map data is **sensitive** and must only be readable by the
event owner or a system admin. This is enforced on the **backend** at the
GraphQL boundary — never rely on the frontend to hide it:

- the `updateControlRadioFlag` mutation calls `requireEventOwnerOrAdmin`;
- the `courseLeafletPoints` / `courseRadioControls` queries call
  `assertClassCourseAccess`, which resolves the owning event from the class and
  delegates to `requireEventOwnerOrAdmin` (401 for unauthenticated callers, 403
  for non-owners).

The plain service helpers (`getLeafletCoursePointsByClassId`,
`getRadioControlsByClassId`, `getCourseByClassId`) are auth-agnostic data
accessors for trusted internal callers; any new network-facing entry point must
run `assertClassCourseAccess` (or an equivalent owner/admin check) first.

## Rendering helpers

```ts
// Network-facing callers must authorize first:
await assertClassCourseAccess(prisma, auth, classId);

// Course points in order, only those with coordinates (for Leaflet):
const points = await getLeafletCoursePointsByClassId(prisma, classId);
const latLngs = points.map((p) => [p.latitude, p.longitude] as [number, number]);

// Radio controls only, in course order:
const radios = await getRadioControlsByClassId(prisma, classId);
```

GraphQL queries `courseLeafletPoints(classId)` and `courseRadioControls(classId)`
expose the same data, gated by the owner/admin check above.

## Files-tab status

The event-settings **Files** tab (between *General* and *Classes*) manages the
event's core data files and surfaces a per-section availability indicator.
Availability is derived **only from persisted data**, never from upload history —
start lists and results can equally be created or synchronised by external
services (MeOS, IOF sync).

`eventFilesStatus(eventId)` (requires event owner or admin) returns:

```graphql
query ($eventId: String!) {
  eventFilesStatus(eventId: $eventId) {
    startList { available classesCount competitorsCount competitorsWithStartTimeCount source }
    courses   { available coursesCount controlsCount courseControlsCount source }
    results   { available competitorsCount competitorsWithResultDataCount source }
    radioControls { id code type radio }
  }
}
```

Availability rules (see `getEventFilesStatus` in `course.service.ts`):

- **startList** — has classes, competitors, and at least one competitor with a
  `startTime`;
- **courses** — has at least one `Course`, `Control`, and `CourseControl`;
- **results** — has competitors and at least one with `finishTime` / `time`, or a
  real result `status` (OK, Finished, MissingPunch, Disqualified, DidNotFinish,
  OverTime, SportingWithdrawal);
- **radioControls** — every event `Control` of type `CONTROL` (start/finish
  excluded), sorted naturally by code (`sortControlCodes`), each toggled via the
  `updateControlRadioFlag` mutation.
