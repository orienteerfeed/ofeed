import { describe, expect, it } from 'vitest';
import { Parser } from 'xml2js';

import { readFileSync } from 'node:fs';

import {
  mapControlType,
  mapCourseControlInstruction,
  mapMapPositionUnit,
  parseCourseData,
} from '../course.iof.parser.js';

const parser = new Parser({ attrkey: 'ATTR', trim: true });

const fixtureXml = readFileSync(new URL('./fixtures/course-data.xml', import.meta.url), 'utf-8');

async function parseFixture() {
  const parsed = await parser.parseStringPromise(fixtureXml);
  return parseCourseData(parsed);
}

describe('IOF value mappers', () => {
  it('maps control types from IOF to Prisma enum', () => {
    expect(mapControlType('Start')).toBe('START');
    expect(mapControlType('Finish')).toBe('FINISH');
    expect(mapControlType('CrossingPoint')).toBe('CROSSING_POINT');
    expect(mapControlType('EndOfMarkedRoute')).toBe('END_OF_MARKED_ROUTE');
    expect(mapControlType('Control')).toBe('CONTROL');
    expect(mapControlType(undefined)).toBe('CONTROL');
    expect(mapControlType('Whatever')).toBe('CONTROL');
  });

  it('maps map position units, defaulting to MM', () => {
    expect(mapMapPositionUnit('px')).toBe('PX');
    expect(mapMapPositionUnit('mm')).toBe('MM');
    expect(mapMapPositionUnit(undefined)).toBe('MM');
  });

  it('maps course control instructions, defaulting to NONE', () => {
    expect(mapCourseControlInstruction('TapedRoute')).toBe('TAPED_ROUTE');
    expect(mapCourseControlInstruction('FunnelTapedRoute')).toBe('FUNNEL_TAPED_ROUTE');
    expect(mapCourseControlInstruction('MandatoryCrossingPoint')).toBe('MANDATORY_CROSSING_POINT');
    expect(mapCourseControlInstruction('MandatoryOutOfBoundsAreaPassage')).toBe(
      'MANDATORY_OUT_OF_BOUNDS_AREA_PASSAGE',
    );
    expect(mapCourseControlInstruction('None')).toBe('NONE');
    expect(mapCourseControlInstruction(undefined)).toBe('NONE');
  });
});

describe('parseCourseData', () => {
  it('parses the map extent and unit', async () => {
    const parsed = await parseFixture();
    expect(parsed.maps).toHaveLength(1);
    expect(parsed.maps[0]).toMatchObject({
      scale: 10000,
      mapTopLeftX: -229.3,
      mapTopLeftY: 13.4,
      mapBottomRightX: 12,
      mapBottomRightY: -163.3,
      mapPositionUnit: 'MM',
    });
  });

  it('parses controls including start and finish without storing positions', async () => {
    const parsed = await parseFixture();
    const byCode = Object.fromEntries(parsed.controls.map((c) => [c.code, c]));

    expect(parsed.controls.map((c) => c.code)).toEqual(['S1', '100', '101', 'F1']);
    expect(byCode.S1.type).toBe('START');
    expect(byCode.F1.type).toBe('FINISH');
    expect(byCode.S1.longitude).toBeNull();
    expect(byCode.S1.latitude).toBeNull();
    expect(byCode.S1.altitude).toBeNull();
    expect(byCode.S1.mapX).toBeNull();
    expect(byCode.S1.mapY).toBeNull();
    expect(byCode.S1.mapUnit).toBe('MM');
  });

  it('imports a control while ignoring IOF position data', async () => {
    const parsed = await parseFixture();
    const control100 = parsed.controls.find((c) => c.code === '100');
    expect(control100).toBeDefined();
    expect(control100).toMatchObject({
      latitude: null,
      longitude: null,
      altitude: null,
      mapX: null,
      mapY: null,
    });
  });

  it('keeps CourseControl XML order in sequence and records control codes', async () => {
    const parsed = await parseFixture();
    const courseA = parsed.courses.find((c) => c.name === 'A');
    expect(courseA).toBeDefined();
    expect(courseA?.courseControls.map((cc) => cc.sequence)).toEqual([1, 2, 3, 4]);
    expect(courseA?.courseControls.map((cc) => cc.controlCode)).toEqual(['S1', '100', '101', 'F1']);
    expect(courseA?.courseControls.map((cc) => cc.type)).toEqual([
      'START',
      'CONTROL',
      'CONTROL',
      'FINISH',
    ]);
    expect(courseA?.courseControls[1].legLength).toBe(360);
  });

  it('parses class course assignments', async () => {
    const parsed = await parseFixture();
    expect(parsed.assignments).toEqual([
      { className: 'A', courseName: 'A', courseFamily: null },
      { className: 'B', courseName: 'B', courseFamily: null },
    ]);
  });

  it('throws when the root element is not CourseData', async () => {
    const parsed = await parser.parseStringPromise('<ResultList></ResultList>');
    expect(() => parseCourseData(parsed)).toThrow(/CourseData/);
  });

  it('throws when a CourseControl lists multiple controls', async () => {
    const xml = `<?xml version="1.0"?>
      <CourseData>
        <RaceCourseData>
          <Course>
            <Name>X</Name>
            <CourseControl type="Control">
              <Control>101</Control>
              <Control>102</Control>
            </CourseControl>
          </Course>
        </RaceCourseData>
      </CourseData>`;
    const parsed = await parser.parseStringPromise(xml);
    expect(() => parseCourseData(parsed)).toThrow(/multiple/i);
  });

  it('throws when a Control has no Id', async () => {
    const xml = `<?xml version="1.0"?>
      <CourseData>
        <RaceCourseData>
          <Control type="Control">
            <Position lng="16.2" lat="49.9" />
          </Control>
        </RaceCourseData>
      </CourseData>`;
    const parsed = await parser.parseStringPromise(xml);
    expect(() => parseCourseData(parsed)).toThrow(/Id/);
  });

  it('throws when a Course has no Name', async () => {
    const xml = `<?xml version="1.0"?>
      <CourseData>
        <RaceCourseData>
          <Course>
            <Length>1000</Length>
          </Course>
        </RaceCourseData>
      </CourseData>`;
    const parsed = await parser.parseStringPromise(xml);
    expect(() => parseCourseData(parsed)).toThrow(/Name/);
  });
});
