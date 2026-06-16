/**
 * Pure parsing helpers for IOF CourseData XML payloads.
 *
 * No DB access and no side effects — the parser turns the xml2js-parsed object
 * (attrkey `ATTR`, `explicitArray: true`) into the structured intermediate
 * representation consumed by `course.import.service.ts`. This keeps the
 * transformation logic directly unit-testable without Prisma mocking.
 *
 * IOF raceNumber is intentionally ignored: we iterate every `RaceCourseData`
 * entry but never store or use the race number.
 */

import { ValidationError } from '../../exceptions/index.js';
import type {
  ControlType,
  CourseControlInstruction,
  MapPositionUnit,
} from '../../generated/prisma/enums.js';
import {
  getIofFloatValue,
  getIofIntegerValue,
  getIofTextValue,
} from '../upload/upload.iof.helpers.js';

export function mapControlType(value?: string): ControlType {
  switch (value) {
    case 'Start':
      return 'START';
    case 'Finish':
      return 'FINISH';
    case 'CrossingPoint':
      return 'CROSSING_POINT';
    case 'EndOfMarkedRoute':
      return 'END_OF_MARKED_ROUTE';
    case 'Control':
    default:
      return 'CONTROL';
  }
}

export function mapMapPositionUnit(value?: string): MapPositionUnit {
  switch (value) {
    case 'px':
      return 'PX';
    case 'mm':
    default:
      return 'MM';
  }
}

export function mapCourseControlInstruction(value?: string): CourseControlInstruction {
  switch (value) {
    case 'TapedRoute':
      return 'TAPED_ROUTE';
    case 'FunnelTapedRoute':
      return 'FUNNEL_TAPED_ROUTE';
    case 'MandatoryCrossingPoint':
      return 'MANDATORY_CROSSING_POINT';
    case 'MandatoryOutOfBoundsAreaPassage':
      return 'MANDATORY_OUT_OF_BOUNDS_AREA_PASSAGE';
    case 'None':
    default:
      return 'NONE';
  }
}

export type ParsedCourseMap = {
  externalId: string | null;
  scale: number | null;
  mapTopLeftX: number | null;
  mapTopLeftY: number | null;
  mapBottomRightX: number | null;
  mapBottomRightY: number | null;
  mapPositionUnit: MapPositionUnit;
};

export type ParsedControl = {
  code: string;
  type: ControlType;
  name: string | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  mapX: number | null;
  mapY: number | null;
  mapUnit: MapPositionUnit;
};

export type ParsedCourseControl = {
  sequence: number;
  controlCode: string;
  type: ControlType | null;
  mapText: string | null;
  mapTextX: number | null;
  mapTextY: number | null;
  mapTextUnit: MapPositionUnit | null;
  legLength: number | null;
  score: number | null;
  randomOrder: boolean;
  specialInstruction: CourseControlInstruction;
  tapedRouteLength: number | null;
};

export type ParsedCourse = {
  externalId: string | null;
  name: string;
  courseFamily: string | null;
  length: number | null;
  climb: number | null;
  controlsCount: number | null;
  externalMapId: string | null;
  courseControls: ParsedCourseControl[];
};

export type ParsedClassCourseAssignment = {
  className: string | null;
  courseName: string | null;
  courseFamily: string | null;
};

export type ParsedCourseData = {
  maps: ParsedCourseMap[];
  controls: ParsedControl[];
  courses: ParsedCourse[];
  assignments: ParsedClassCourseAssignment[];
};

type XmlNode = Record<string, unknown>;

function firstNode(value: unknown): XmlNode | undefined {
  if (Array.isArray(value)) {
    const candidate = value[0];
    return candidate && typeof candidate === 'object' ? (candidate as XmlNode) : undefined;
  }
  return value && typeof value === 'object' ? (value as XmlNode) : undefined;
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function getAttr(node: XmlNode | undefined): Record<string, string | undefined> {
  if (!node) return {};
  const attr = node.ATTR;
  return attr && typeof attr === 'object' ? (attr as Record<string, string | undefined>) : {};
}

function parseMap(raceCourseData: XmlNode): ParsedCourseMap | null {
  const map = firstNode(raceCourseData.Map);
  if (!map) return null;

  const topLeft = getAttr(firstNode(map.MapPositionTopLeft));
  const bottomRight = getAttr(firstNode(map.MapPositionBottomRight));
  const unit = topLeft.unit ?? bottomRight.unit;

  return {
    externalId: getIofTextValue(map.Id) ?? null,
    scale: getIofFloatValue(map.Scale),
    mapTopLeftX: getIofFloatValue(topLeft.x),
    mapTopLeftY: getIofFloatValue(topLeft.y),
    mapBottomRightX: getIofFloatValue(bottomRight.x),
    mapBottomRightY: getIofFloatValue(bottomRight.y),
    mapPositionUnit: mapMapPositionUnit(unit),
  };
}

function parseControl(node: XmlNode): ParsedControl {
  const code = getIofTextValue(node.Id);
  if (!code) {
    throw new ValidationError('IOF CourseData: <Control> is missing required <Id>.');
  }

  const attr = getAttr(node);
  /*
   * Prepared for future development of control position handling.
   * Keep the data structures in place, but do not persist IOF control
   * coordinates or map positions until the feature is ready.
   *
   * const { latitude, longitude, altitude } = parsePosition(node);
   *
   * const position = getAttr(firstNode(node.Position));
   * const mapPosition = getAttr(firstNode(node.MapPosition));
   */

  return {
    code,
    type: mapControlType(attr.type),
    name: getIofTextValue(node.Name) ?? null,
    latitude: null,
    longitude: null,
    altitude: null,
    mapX: null,
    mapY: null,
    mapUnit: 'MM',
  };
}

function parseCourseControl(
  node: XmlNode,
  sequence: number,
  courseName: string,
): ParsedCourseControl {
  const controlNodes = asArray(node.Control);
  if (controlNodes.length === 0) {
    throw new ValidationError(
      `IOF CourseData: CourseControl #${sequence} in course "${courseName}" has no <Control>.`,
    );
  }
  if (controlNodes.length > 1) {
    // Alternative / forked controls are not supported in the simplified model.
    throw new ValidationError(
      `IOF CourseData: CourseControl #${sequence} in course "${courseName}" lists multiple ` +
        '<Control> values. Alternative controls are not supported.',
    );
  }

  const controlCode = getIofTextValue(controlNodes[0]);
  if (!controlCode) {
    throw new ValidationError(
      `IOF CourseData: CourseControl #${sequence} in course "${courseName}" has an empty <Control>.`,
    );
  }

  const attr = getAttr(node);
  const mapTextPosition = getAttr(firstNode(node.MapTextPosition));

  return {
    sequence,
    controlCode,
    type: attr.type ? mapControlType(attr.type) : null,
    mapText: getIofTextValue(node.MapText) ?? null,
    mapTextX: getIofFloatValue(mapTextPosition.x),
    mapTextY: getIofFloatValue(mapTextPosition.y),
    mapTextUnit: mapTextPosition.unit ? mapMapPositionUnit(mapTextPosition.unit) : null,
    legLength: getIofFloatValue(node.LegLength),
    score: getIofFloatValue(node.Score),
    randomOrder: attr.randomOrder === 'true',
    specialInstruction: mapCourseControlInstruction(attr.specialInstruction),
    tapedRouteLength: getIofFloatValue(attr.tapedRouteLength),
  };
}

function parseCourse(node: XmlNode): ParsedCourse {
  const name = getIofTextValue(node.Name);
  if (!name) {
    throw new ValidationError('IOF CourseData: <Course> is missing required <Name>.');
  }

  const courseControls = asArray(node.CourseControl).map((cc, index) =>
    parseCourseControl(cc as XmlNode, index + 1, name),
  );

  return {
    externalId: getIofTextValue(node.Id) ?? null,
    name,
    courseFamily: getIofTextValue(node.CourseFamily) ?? null,
    length: getIofFloatValue(node.Length),
    climb: getIofFloatValue(node.Climb),
    controlsCount: getIofIntegerValue(node.NumberOfControls),
    externalMapId: getIofTextValue(node.MapId) ?? null,
    courseControls,
  };
}

function parseAssignment(node: XmlNode): ParsedClassCourseAssignment {
  return {
    className: getIofTextValue(node.ClassName) ?? null,
    courseName: getIofTextValue(node.CourseName) ?? null,
    courseFamily: getIofTextValue(node.CourseFamily) ?? null,
  };
}

/**
 * Transforms a parsed IOF CourseData document into the structured intermediate
 * representation. Aggregates across every `RaceCourseData` block while ignoring
 * raceNumber. Controls are de-duplicated by code (first occurrence wins) so the
 * per-event unique `(eventId, code)` constraint cannot be violated when the same
 * control appears in multiple races.
 */
export function parseCourseData(parsedXml: unknown): ParsedCourseData {
  const root = parsedXml && typeof parsedXml === 'object' ? (parsedXml as XmlNode) : {};
  const courseData = firstNode(root.CourseData);
  if (!courseData) {
    throw new ValidationError('IOF CourseData: root element <CourseData> not found.');
  }

  const maps: ParsedCourseMap[] = [];
  const controls: ParsedControl[] = [];
  const seenControlCodes = new Set<string>();
  const courses: ParsedCourse[] = [];
  const assignments: ParsedClassCourseAssignment[] = [];

  for (const raceRaw of asArray(courseData.RaceCourseData)) {
    const race = raceRaw as XmlNode;

    const map = parseMap(race);
    if (map) {
      maps.push(map);
    }

    for (const controlRaw of asArray(race.Control)) {
      const control = parseControl(controlRaw as XmlNode);
      if (!seenControlCodes.has(control.code)) {
        seenControlCodes.add(control.code);
        controls.push(control);
      }
    }

    for (const courseRaw of asArray(race.Course)) {
      courses.push(parseCourse(courseRaw as XmlNode));
    }

    for (const assignmentRaw of asArray(race.ClassCourseAssignment)) {
      assignments.push(parseAssignment(assignmentRaw as XmlNode));
    }
  }

  return { maps, controls, courses, assignments };
}
