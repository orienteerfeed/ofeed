/**
 * Course / control read helpers and radio-control administration.
 *
 * `Control.radio` marks a radio / online control for which the UI shows split
 * times. It is managed manually here and preserved across IOF CourseData
 * reimports — see `course.import.service.ts`.
 */

import { ValidationError } from '../../exceptions/index.js';
import type { AppPrismaClient } from '../../db/prisma-client.js';
import type { Control, EventImportState } from '../../generated/prisma/client.js';
import type { ControlType, ResultStatus } from '../../generated/prisma/enums.js';
import { requireEventOwnerOrAdmin, type AuthzAuthContext } from '../../utils/authz.js';

export type LeafletCoursePoint = {
  sequence: number;
  code: string;
  type: ControlType;
  radio: boolean;
  latitude: number;
  longitude: number;
  legLength: number | null;
};

export type RadioCoursePoint = {
  sequence: number;
  code: string;
  latitude: number | null;
  longitude: number | null;
  legLength: number | null;
};

/**
 * Manually toggle the radio flag on a control. Verifies the control belongs to
 * the given event before updating.
 */
export async function updateControlRadioFlag(
  prisma: AppPrismaClient,
  params: { eventId: string; controlId: number; radio: boolean },
): Promise<Control> {
  const { eventId, controlId, radio } = params;

  const control = await prisma.control.findFirst({
    where: { id: controlId, eventId },
  });

  if (!control) {
    throw new ValidationError('Control not found');
  }

  return prisma.control.update({
    where: { id: control.id },
    data: { radio },
  });
}

/**
 * Authorization guard for course/control/map data, which is sensitive and must
 * only be readable by the event owner or a system admin. Resolves the owning
 * event from the class and delegates to `requireEventOwnerOrAdmin`, which throws
 * an `AuthzError` (401 unauthenticated / 403 forbidden) when access is denied.
 */
export async function assertClassCourseAccess(
  prisma: AppPrismaClient,
  auth: AuthzAuthContext | null | undefined,
  classId: number,
): Promise<void> {
  const cls = await prisma.class.findUnique({
    where: { id: classId },
    select: { eventId: true },
  });

  if (!cls) {
    throw new ValidationError('Class not found');
  }

  await requireEventOwnerOrAdmin(prisma, auth, cls.eventId);
}

/**
 * Loads a class together with its course and ordered course controls (each with
 * the resolved control). Returns null when the class does not exist.
 */
export function getCourseByClassId(prisma: AppPrismaClient, classId: number) {
  return prisma.class.findUnique({
    where: { id: classId },
    include: {
      course: {
        include: {
          courseControls: {
            orderBy: { sequence: 'asc' },
            include: { control: true },
          },
        },
      },
    },
  });
}

/**
 * Returns the course points renderable on a Leaflet map, in course order.
 *
 * IOF XML uses `lat`/`lng`; Leaflet expects `[latitude, longitude]`. Points
 * without coordinates are skipped because they cannot be drawn.
 */
export async function getLeafletCoursePointsByClassId(
  prisma: AppPrismaClient,
  classId: number,
): Promise<LeafletCoursePoint[]> {
  const cls = await getCourseByClassId(prisma, classId);
  if (!cls?.course) {
    return [];
  }

  const points: LeafletCoursePoint[] = [];
  for (const courseControl of cls.course.courseControls) {
    const control = courseControl.control;
    if (
      !control ||
      control.latitude === null ||
      control.latitude === undefined ||
      control.longitude === null ||
      control.longitude === undefined
    ) {
      continue;
    }

    points.push({
      sequence: courseControl.sequence,
      code: control.code,
      type: control.type,
      radio: control.radio,
      latitude: control.latitude,
      longitude: control.longitude,
      legLength: courseControl.legLength ?? null,
    });
  }

  return points;
}

/**
 * Returns only the radio controls on a class's course, in course order.
 */
export async function getRadioControlsByClassId(
  prisma: AppPrismaClient,
  classId: number,
): Promise<RadioCoursePoint[]> {
  const cls = await getCourseByClassId(prisma, classId);
  if (!cls?.course) {
    return [];
  }

  const points: RadioCoursePoint[] = [];
  for (const courseControl of cls.course.courseControls) {
    const control = courseControl.control;
    if (!control?.radio) {
      continue;
    }

    points.push({
      sequence: courseControl.sequence,
      code: control.code,
      latitude: control.latitude ?? null,
      longitude: control.longitude ?? null,
      legLength: courseControl.legLength ?? null,
    });
  }

  return points;
}

/**
 * Natural sort comparator for control codes: numeric codes ascend by value
 * (so 2 < 10 < 100), and any non-numeric codes are listed after the numeric
 * ones, ordered lexicographically among themselves.
 */
export function sortControlCodes(a: string, b: string): number {
  const aNumber = Number(a);
  const bNumber = Number(b);

  const aIsNumber = a.trim() !== '' && Number.isFinite(aNumber);
  const bIsNumber = b.trim() !== '' && Number.isFinite(bNumber);

  if (aIsNumber && bIsNumber) {
    return aNumber - bNumber;
  }
  if (aIsNumber) return -1;
  if (bIsNumber) return 1;

  return a.localeCompare(b);
}

/**
 * Competitor result statuses that, on their own, indicate a real finished /
 * adjudicated result even when `finishTime` / `time` are absent (e.g. a manual
 * DidNotFinish). Pre-start states such as Inactive / Active / DidNotStart are
 * intentionally excluded so an empty start list is never reported as results.
 */
const RESULT_BEARING_STATUSES: ResultStatus[] = [
  'OK',
  'Finished',
  'MissingPunch',
  'Disqualified',
  'DidNotFinish',
  'OverTime',
  'SportingWithdrawal',
];

export type EventFilesSectionSource = 'data' | 'upload' | 'external' | null;

export type EventFilesStartListStatus = {
  available: boolean;
  classesCount: number;
  competitorsCount: number;
  competitorsWithStartTimeCount: number;
  source: EventFilesSectionSource;
};

export type EventFilesCoursesStatus = {
  available: boolean;
  coursesCount: number;
  controlsCount: number;
  courseControlsCount: number;
  source: EventFilesSectionSource;
};

export type EventFilesResultsStatus = {
  available: boolean;
  competitorsCount: number;
  competitorsWithResultDataCount: number;
  source: EventFilesSectionSource;
};

export type EventFilesRadioControl = {
  id: number;
  code: string;
  type: ControlType;
  radio: boolean;
};

export type EventFilesStatus = {
  startList: EventFilesStartListStatus;
  courses: EventFilesCoursesStatus;
  results: EventFilesResultsStatus;
  radioControls: EventFilesRadioControl[];
};

/**
 * Derives the Files-tab status for an event entirely from persisted data.
 *
 * Availability is never inferred from upload history: start lists and results
 * can equally be created or synchronised by external services (MeOS, IOF sync),
 * so each section is considered available only when the underlying rows exist.
 */
export async function getEventFilesStatus(
  prisma: AppPrismaClient,
  eventId: string,
): Promise<EventFilesStatus> {
  // Resolve owning class / course ids first so competitor and course-control
  // counts can use simple `in` filters (no relation-filter dependency).
  const [classes, courses] = await Promise.all([
    prisma.class.findMany({ where: { eventId }, select: { id: true } }),
    prisma.course.findMany({ where: { eventId }, select: { id: true } }),
  ]);
  const classIds = classes.map((cls) => cls.id);
  const courseIds = courses.map((course) => course.id);

  const [
    competitorsCount,
    competitorsWithStartTimeCount,
    competitorsWithResultDataCount,
    controlsCount,
    courseControlsCount,
    controls,
  ] = await Promise.all([
    classIds.length ? prisma.competitor.count({ where: { classId: { in: classIds } } }) : 0,
    classIds.length
      ? prisma.competitor.count({
          where: { classId: { in: classIds }, startTime: { not: null } },
        })
      : 0,
    classIds.length
      ? prisma.competitor.count({
          where: {
            classId: { in: classIds },
            OR: [
              { finishTime: { not: null } },
              { time: { not: null } },
              { status: { in: RESULT_BEARING_STATUSES } },
            ],
          },
        })
      : 0,
    prisma.control.count({ where: { eventId } }),
    courseIds.length
      ? prisma.courseControl.count({ where: { courseId: { in: courseIds } } })
      : 0,
    prisma.control.findMany({
      where: { eventId, type: 'CONTROL' },
      select: { id: true, code: true, type: true, radio: true },
    }),
  ]);

  const classesCount = classIds.length;
  const coursesCount = courseIds.length;

  const startListAvailable =
    classesCount > 0 && competitorsCount > 0 && competitorsWithStartTimeCount > 0;
  const coursesAvailable = coursesCount > 0 && controlsCount > 0 && courseControlsCount > 0;
  const resultsAvailable = competitorsCount > 0 && competitorsWithResultDataCount > 0;

  const radioControls: EventFilesRadioControl[] = controls
    .map((control) => ({
      id: control.id,
      code: control.code,
      type: control.type,
      radio: control.radio,
    }))
    .sort((a, b) => sortControlCodes(a.code, b.code));

  return {
    startList: {
      available: startListAvailable,
      classesCount,
      competitorsCount,
      competitorsWithStartTimeCount,
      source: startListAvailable ? 'data' : null,
    },
    courses: {
      available: coursesAvailable,
      coursesCount,
      controlsCount,
      courseControlsCount,
      source: coursesAvailable ? 'data' : null,
    },
    results: {
      available: resultsAvailable,
      competitorsCount,
      competitorsWithResultDataCount,
      source: resultsAvailable ? 'data' : null,
    },
    radioControls,
  };
}

export async function getEventImportStates(
  prisma: AppPrismaClient,
  eventId: string,
): Promise<EventImportState[]> {
  return prisma.eventImportState.findMany({ where: { eventId } });
}
