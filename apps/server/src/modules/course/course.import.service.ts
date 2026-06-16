/**
 * IOF CourseData XML import.
 *
 * The import is idempotent per `eventId`: it replaces only course-data
 * structures (CourseMap, Control, Course, CourseControl) and the
 * `Class.courseId` assignment. It never touches Event, Class, Competitor,
 * Split, results, or split times.
 *
 * Manually managed `Control.radio` flags are preserved by default across
 * reimports (matched by control code).
 */

import { Parser } from 'xml2js';

import { ValidationError } from '../../exceptions/index.js';
import type { Prisma } from '../../generated/prisma/client.js';
import logger from '../../utils/logger.js';
import prisma from '../../utils/context.js';
import { parseCourseData, type ParsedCourseData } from './course.iof.parser.js';

const parser = new Parser({ attrkey: 'ATTR', trim: true });

export type ImportCourseDataOptions = {
  /**
   * Default: true. When true, reimport preserves manually set `Control.radio`
   * flags by control code.
   */
  preserveManualRadioFlags?: boolean;
};

export type ImportCourseDataResult = {
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

type TransactionClient = Prisma.TransactionClient;

async function resetCourseData(tx: TransactionClient, eventId: string): Promise<void> {
  // Detach classes first so the Course rows can be deleted without violating the
  // Class.courseId foreign key.
  await tx.class.updateMany({
    where: { eventId },
    data: { courseId: null },
  });

  const courses = await tx.course.findMany({
    where: { eventId },
    select: { id: true },
  });
  const courseIds = courses.map((course) => course.id);

  if (courseIds.length > 0) {
    await tx.courseControl.deleteMany({
      where: { courseId: { in: courseIds } },
    });
  }

  await tx.course.deleteMany({ where: { eventId } });
  await tx.control.deleteMany({ where: { eventId } });
  await tx.courseMap.deleteMany({ where: { eventId } });
}

async function importParsedCourseData(
  tx: TransactionClient,
  eventId: string,
  parsed: ParsedCourseData,
  preserveManualRadioFlags: boolean,
): Promise<ImportCourseDataResult> {
  const previousRadioControls = preserveManualRadioFlags
    ? await tx.control.findMany({
        where: { eventId, radio: true },
        select: { code: true },
      })
    : [];
  const previousRadioCodeSet = new Set(previousRadioControls.map((control) => control.code));

  await resetCourseData(tx, eventId);

  // CourseMaps — keep externalId → id so courses can resolve their map.
  const mapIdByExternalId = new Map<string, number>();
  let mapsImported = 0;
  for (const map of parsed.maps) {
    const created = await tx.courseMap.create({
      data: {
        eventId,
        externalId: map.externalId,
        scale: map.scale,
        mapTopLeftX: map.mapTopLeftX,
        mapTopLeftY: map.mapTopLeftY,
        mapBottomRightX: map.mapBottomRightX,
        mapBottomRightY: map.mapBottomRightY,
        mapPositionUnit: map.mapPositionUnit,
      },
    });
    mapsImported += 1;
    if (map.externalId) {
      mapIdByExternalId.set(map.externalId, created.id);
    }
  }

  // Controls — keep code → id so course controls can resolve their relation.
  const controlIdByCode = new Map<string, number>();
  let radioControlsPreserved = 0;
  for (const control of parsed.controls) {
    const radio = preserveManualRadioFlags && previousRadioCodeSet.has(control.code);
    if (radio) {
      radioControlsPreserved += 1;
    }
    const created = await tx.control.create({
      data: {
        eventId,
        code: control.code,
        type: control.type,
        radio,
        name: control.name,
        latitude: control.latitude,
        longitude: control.longitude,
        altitude: control.altitude,
        mapX: control.mapX,
        mapY: control.mapY,
        mapUnit: control.mapUnit,
      },
    });
    controlIdByCode.set(control.code, created.id);
  }

  // Courses + their CourseControls.
  const courseIdByName = new Map<string, number>();
  const unresolvedControlCodes = new Set<string>();
  let coursesImported = 0;
  let courseControlsImported = 0;
  for (const course of parsed.courses) {
    const mapId =
      course.externalMapId && mapIdByExternalId.has(course.externalMapId)
        ? mapIdByExternalId.get(course.externalMapId)!
        : null;

    const createdCourse = await tx.course.create({
      data: {
        eventId,
        externalId: course.externalId,
        name: course.name,
        courseFamily: course.courseFamily,
        length: course.length,
        climb: course.climb,
        controlsCount: course.controlsCount,
        externalMapId: course.externalMapId,
        mapId,
      },
    });
    coursesImported += 1;
    courseIdByName.set(course.name, createdCourse.id);

    for (const courseControl of course.courseControls) {
      const controlId = controlIdByCode.get(courseControl.controlCode) ?? null;
      if (controlId === null) {
        unresolvedControlCodes.add(courseControl.controlCode);
      }

      await tx.courseControl.create({
        data: {
          courseId: createdCourse.id,
          sequence: courseControl.sequence,
          controlId,
          controlCode: courseControl.controlCode,
          type: courseControl.type,
          mapText: courseControl.mapText,
          mapTextX: courseControl.mapTextX,
          mapTextY: courseControl.mapTextY,
          mapTextUnit: courseControl.mapTextUnit,
          legLength: courseControl.legLength,
          score: courseControl.score,
          randomOrder: courseControl.randomOrder,
          specialInstruction: courseControl.specialInstruction,
          tapedRouteLength: courseControl.tapedRouteLength,
        },
      });
      courseControlsImported += 1;
    }
  }

  // Class ↔ Course assignments.
  let classesAssigned = 0;
  const unresolvedClassAssignments: ImportCourseDataResult['unresolvedClassAssignments'] = [];
  for (const assignment of parsed.assignments) {
    const className = assignment.className;
    const cls = className
      ? await tx.class.findFirst({ where: { eventId, name: className } })
      : null;

    let courseId: number | null = null;
    if (assignment.courseName && courseIdByName.has(assignment.courseName)) {
      courseId = courseIdByName.get(assignment.courseName)!;
    } else if (!assignment.courseName && assignment.courseFamily) {
      // Resolve by family only when it is unambiguous for this event.
      const familyCourses = await tx.course.findMany({
        where: { eventId, courseFamily: assignment.courseFamily },
        select: { id: true },
      });
      if (familyCourses.length === 1) {
        courseId = familyCourses[0].id;
      }
    }

    if (cls && courseId !== null) {
      await tx.class.update({ where: { id: cls.id }, data: { courseId } });
      classesAssigned += 1;
    } else {
      unresolvedClassAssignments.push({
        className: className ?? '',
        courseName: assignment.courseName,
        courseFamily: assignment.courseFamily,
      });
    }
  }

  return {
    mapsImported,
    controlsImported: controlIdByCode.size,
    coursesImported,
    courseControlsImported,
    classesAssigned,
    radioControlsPreserved,
    unresolvedControlCodes: [...unresolvedControlCodes],
    unresolvedClassAssignments,
  };
}

export async function importCourseDataXml(
  eventId: string,
  xml: string,
  options?: ImportCourseDataOptions,
): Promise<ImportCourseDataResult> {
  const preserveManualRadioFlags = options?.preserveManualRadioFlags ?? true;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true },
  });
  if (!event) {
    throw new ValidationError(`IOF CourseData: event "${eventId}" not found.`);
  }

  const parsedXml = (await parser.parseStringPromise(xml.replace(/^﻿/, ''))) as Record<
    string,
    unknown
  >;

  const rootKey = Object.keys(parsedXml)[0];
  if (rootKey !== 'CourseData') {
    throw new ValidationError(
      `IOF CourseData: expected root element <CourseData>, received <${rootKey ?? 'unknown'}>.`,
    );
  }

  const parsed = parseCourseData(parsedXml);

  const result = await prisma.$transaction((tx) =>
    importParsedCourseData(tx, eventId, parsed, preserveManualRadioFlags),
  );

  logger.info('IOF CourseData import completed', {
    eventId,
    ...result,
    unresolvedControlCodeCount: result.unresolvedControlCodes.length,
    unresolvedClassAssignmentCount: result.unresolvedClassAssignments.length,
  });

  return result;
}
