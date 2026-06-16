import { beforeEach, describe, expect, it, vi } from 'vitest';

import { readFileSync } from 'node:fs';

import { createFakePrisma, type FakePrisma } from './fake-prisma.js';

// The import service reads its Prisma client from utils/context.js. A Proxy
// forwards every access to the per-test fake instance held in `holder`.
const holder = vi.hoisted(() => ({ prisma: null as unknown as FakePrisma }));

vi.mock('../../../utils/context.js', () => ({
  default: new Proxy(
    {},
    {
      get: (_target, prop) => {
        const instance = holder.prisma as unknown as Record<string | symbol, unknown>;
        const value = instance[prop];
        return typeof value === 'function' ? (value as () => unknown).bind(instance) : value;
      },
    },
  ),
}));

const { importCourseDataXml } = await import('../course.import.service.js');

const fixtureXml = readFileSync(new URL('./fixtures/course-data.xml', import.meta.url), 'utf-8');

function seedFake() {
  return createFakePrisma({
    events: [{ id: 'evt1' }],
    classes: [
      { id: 1, eventId: 'evt1', name: 'A', courseId: null },
      { id: 2, eventId: 'evt1', name: 'B', courseId: null },
    ],
  });
}

beforeEach(() => {
  holder.prisma = seedFake();
});

describe('importCourseDataXml', () => {
  it('imports maps, controls, courses, course controls and class assignments', async () => {
    const result = await importCourseDataXml('evt1', fixtureXml);

    expect(result).toMatchObject({
      mapsImported: 1,
      controlsImported: 4,
      coursesImported: 2,
      courseControlsImported: 8,
      classesAssigned: 2,
      radioControlsPreserved: 0,
      unresolvedControlCodes: ['999'],
      unresolvedClassAssignments: [],
    });

    const { store } = holder.prisma;
    expect(store.controls.map((c) => c.code)).toEqual(['S1', '100', '101', 'F1']);
    expect(store.courses.map((c) => c.name)).toEqual(['A', 'B']);
  });

  it('creates start, control and finish records without stored coordinates', async () => {
    await importCourseDataXml('evt1', fixtureXml);
    const { store } = holder.prisma;
    const s1 = store.controls.find((c) => c.code === 'S1');
    const c100 = store.controls.find((c) => c.code === '100');
    const f1 = store.controls.find((c) => c.code === 'F1');

    expect(s1).toMatchObject({
      type: 'START',
      longitude: null,
      latitude: null,
      altitude: null,
      mapX: null,
      mapY: null,
    });
    expect(c100).toMatchObject({
      longitude: null,
      latitude: null,
      altitude: null,
      mapX: null,
      mapY: null,
    });
    expect(f1?.type).toBe('FINISH');
  });

  it('defaults newly imported controls to radio = false', async () => {
    await importCourseDataXml('evt1', fixtureXml);
    expect(holder.prisma.store.controls.every((c) => c.radio === false)).toBe(true);
  });

  it('does not store numberOfCompetitors or externalModifyTime on a course', async () => {
    await importCourseDataXml('evt1', fixtureXml);
    const course = holder.prisma.store.courses[0];
    expect('numberOfCompetitors' in course).toBe(false);
    expect('externalModifyTime' in course).toBe(false);
  });

  it('stores courseFamily when present in the XML', async () => {
    const xml = `<?xml version="1.0"?>
      <CourseData>
        <Event><Name>e</Name></Event>
        <RaceCourseData>
          <Course>
            <Name>Forked-1</Name>
            <CourseFamily>Forked</CourseFamily>
            <CourseControl type="Start"><Control>S1</Control></CourseControl>
          </Course>
        </RaceCourseData>
      </CourseData>`;
    await importCourseDataXml('evt1', xml);
    expect(holder.prisma.store.courses[0]).toMatchObject({
      name: 'Forked-1',
      courseFamily: 'Forked',
    });
  });

  it('resolves controlId for known controls and leaves it null for unknown ones', async () => {
    await importCourseDataXml('evt1', fixtureXml);
    const { store } = holder.prisma;
    const control100 = store.controls.find((c) => c.code === '100');
    const cc100 = store.courseControls.find((cc) => cc.controlCode === '100');
    const cc999 = store.courseControls.find((cc) => cc.controlCode === '999');

    expect(cc100?.controlId).toBe(control100?.id);
    // Unresolved control is still stored, with controlId = null.
    expect(cc999).toBeDefined();
    expect(cc999?.controlId).toBeNull();
  });

  it('assigns Class.courseId from ClassName + CourseName', async () => {
    await importCourseDataXml('evt1', fixtureXml);
    const { store } = holder.prisma;
    const classA = store.classes.find((cls) => cls.name === 'A');
    const courseA = store.courses.find((co) => co.name === 'A');
    expect(classA?.courseId).toBe(courseA?.id);
  });

  it('is idempotent: re-importing the same XML creates no duplicates', async () => {
    await importCourseDataXml('evt1', fixtureXml);
    await importCourseDataXml('evt1', fixtureXml);
    const { store } = holder.prisma;
    expect(store.controls).toHaveLength(4);
    expect(store.courses).toHaveLength(2);
    expect(store.courseControls).toHaveLength(8);
    expect(store.courseMaps).toHaveLength(1);
  });

  it('preserves manually set radio flags across reimport by default', async () => {
    await importCourseDataXml('evt1', fixtureXml);
    const s1 = holder.prisma.store.controls.find((c) => c.code === 'S1')!;
    s1.radio = true;

    const result = await importCourseDataXml('evt1', fixtureXml);

    const reimportedS1 = holder.prisma.store.controls.find((c) => c.code === 'S1')!;
    expect(reimportedS1.radio).toBe(true);
    expect(result.radioControlsPreserved).toBe(1);
    // The radio flag must not change the control type.
    expect(reimportedS1.type).toBe('START');
  });

  it('resets radio flags when preserveManualRadioFlags is false', async () => {
    await importCourseDataXml('evt1', fixtureXml);
    holder.prisma.store.controls.find((c) => c.code === 'S1')!.radio = true;

    const result = await importCourseDataXml('evt1', fixtureXml, {
      preserveManualRadioFlags: false,
    });

    expect(holder.prisma.store.controls.every((c) => c.radio === false)).toBe(true);
    expect(result.radioControlsPreserved).toBe(0);
  });

  it('throws when the event does not exist', async () => {
    await expect(importCourseDataXml('missing', fixtureXml)).rejects.toThrow(/not found/i);
  });

  it('throws when the root element is not CourseData', async () => {
    await expect(importCourseDataXml('evt1', '<ResultList></ResultList>')).rejects.toThrow(
      /CourseData/,
    );
  });
});
