import { beforeEach, describe, expect, it } from 'vitest';

import type { AppPrismaClient } from '../../../db/prisma-client.js';
import { createFakePrisma, type FakePrisma } from './fake-prisma.js';
import {
  assertClassCourseAccess,
  getEventFilesStatus,
  getLeafletCoursePointsByClassId,
  getRadioControlsByClassId,
  sortControlCodes,
  updateControlRadioFlag,
} from '../course.service.js';

let fake: FakePrisma;

function asPrisma() {
  return fake as unknown as AppPrismaClient;
}

beforeEach(() => {
  fake = createFakePrisma({
    events: [{ id: 'evt1' }],
    classes: [{ id: 1, eventId: 'evt1', name: 'A', courseId: 10 }],
    courses: [{ id: 10, eventId: 'evt1', name: 'A' }],
    controls: [
      {
        id: 100,
        eventId: 'evt1',
        code: 'S1',
        type: 'START',
        radio: false,
        latitude: 49.1,
        longitude: 16.1,
      },
      {
        id: 101,
        eventId: 'evt1',
        code: '100',
        type: 'CONTROL',
        radio: true,
        latitude: 49.2,
        longitude: 16.2,
      },
      {
        id: 102,
        eventId: 'evt1',
        code: '101',
        type: 'CONTROL',
        radio: false,
        latitude: null,
        longitude: null,
      },
      {
        id: 103,
        eventId: 'evt1',
        code: 'F1',
        type: 'FINISH',
        radio: false,
        latitude: 49.4,
        longitude: 16.4,
      },
    ],
    courseControls: [
      { id: 1, courseId: 10, sequence: 1, controlId: 100, controlCode: 'S1', legLength: null },
      { id: 2, courseId: 10, sequence: 2, controlId: 101, controlCode: '100', legLength: 360 },
      { id: 3, courseId: 10, sequence: 3, controlId: 102, controlCode: '101', legLength: 232 },
      { id: 4, courseId: 10, sequence: 4, controlId: 103, controlCode: 'F1', legLength: 118 },
    ],
  });
});

describe('updateControlRadioFlag', () => {
  it('sets radio = true on a control belonging to the event', async () => {
    const updated = await updateControlRadioFlag(asPrisma(), {
      eventId: 'evt1',
      controlId: 100,
      radio: true,
    });
    expect(updated.radio).toBe(true);
    expect(fake.store.controls.find((c) => c.id === 100)?.radio).toBe(true);
  });

  it('sets radio = false on a control belonging to the event', async () => {
    const updated = await updateControlRadioFlag(asPrisma(), {
      eventId: 'evt1',
      controlId: 101,
      radio: false,
    });
    expect(updated.radio).toBe(false);
  });

  it('throws when the control does not belong to the event', async () => {
    await expect(
      updateControlRadioFlag(asPrisma(), { eventId: 'other-event', controlId: 100, radio: true }),
    ).rejects.toThrow(/not found/i);
  });
});

describe('getLeafletCoursePointsByClassId', () => {
  it('returns points in course order with latitude/longitude', async () => {
    const points = await getLeafletCoursePointsByClassId(asPrisma(), 1);
    // Control 101 (id 102) has no coordinates and is skipped.
    expect(points.map((p) => p.code)).toEqual(['S1', '100', 'F1']);
    expect(points[0]).toMatchObject({ sequence: 1, latitude: 49.1, longitude: 16.1 });
    expect(points[1].legLength).toBe(360);
  });

  it('exposes the radio flag for each point', async () => {
    const points = await getLeafletCoursePointsByClassId(asPrisma(), 1);
    const byCode = Object.fromEntries(points.map((p) => [p.code, p]));
    expect(byCode['100'].radio).toBe(true);
    expect(byCode.S1.radio).toBe(false);
  });

  it('returns an empty array when the class has no course', async () => {
    fake.store.classes.push({ id: 2, eventId: 'evt1', name: 'B', courseId: null });
    expect(await getLeafletCoursePointsByClassId(asPrisma(), 2)).toEqual([]);
  });
});

describe('assertClassCourseAccess', () => {
  it('rejects an unauthenticated caller for an existing class', async () => {
    await expect(
      assertClassCourseAccess(asPrisma(), { isAuthenticated: false, type: null }, 1),
    ).rejects.toThrow(/unauthorized/i);
  });

  it('throws when the class does not exist', async () => {
    await expect(
      assertClassCourseAccess(asPrisma(), { isAuthenticated: false, type: null }, 999),
    ).rejects.toThrow(/not found/i);
  });
});

describe('getRadioControlsByClassId', () => {
  it('returns only controls with radio = true', async () => {
    const radios = await getRadioControlsByClassId(asPrisma(), 1);
    expect(radios.map((r) => r.code)).toEqual(['100']);
    expect(radios[0]).toMatchObject({
      sequence: 2,
      latitude: 49.2,
      longitude: 16.2,
      legLength: 360,
    });
  });
});

describe('sortControlCodes', () => {
  it('orders numeric codes by value, not lexicographically', () => {
    const sorted = ['110', '102', '100', '111', '101', '200'].sort(sortControlCodes);
    expect(sorted).toEqual(['100', '101', '102', '110', '111', '200']);
  });

  it('places non-numeric codes after numeric ones', () => {
    const sorted = ['Finish', '101', 'Start', '100'].sort(sortControlCodes);
    expect(sorted).toEqual(['100', '101', 'Finish', 'Start']);
  });
});

describe('getEventFilesStatus', () => {
  it('reports start list unavailable when the event has no competitors', async () => {
    fake = createFakePrisma({
      events: [{ id: 'evt1' }],
      classes: [{ id: 1, eventId: 'evt1', name: 'A' }],
      competitors: [],
    });
    const status = await getEventFilesStatus(asPrisma(), 'evt1');
    expect(status.startList.available).toBe(false);
    expect(status.startList.competitorsCount).toBe(0);
    expect(status.startList.source).toBeNull();
  });

  it('reports start list available when a competitor has a start time', async () => {
    fake = createFakePrisma({
      events: [{ id: 'evt1' }],
      classes: [{ id: 1, eventId: 'evt1', name: 'A' }],
      competitors: [
        { id: 1, classId: 1, startTime: new Date('2026-06-11T08:00:00Z'), status: 'Inactive' },
        { id: 2, classId: 1, startTime: null, status: 'Inactive' },
      ],
    });
    const status = await getEventFilesStatus(asPrisma(), 'evt1');
    expect(status.startList.available).toBe(true);
    expect(status.startList.classesCount).toBe(1);
    expect(status.startList.competitorsCount).toBe(2);
    expect(status.startList.competitorsWithStartTimeCount).toBe(1);
    expect(status.startList.source).toBe('data');
  });

  it('reports courses unavailable when no course data exists', async () => {
    fake = createFakePrisma({
      events: [{ id: 'evt1' }],
      classes: [{ id: 1, eventId: 'evt1', name: 'A' }],
    });
    const status = await getEventFilesStatus(asPrisma(), 'evt1');
    expect(status.courses.available).toBe(false);
    expect(status.courses).toMatchObject({
      coursesCount: 0,
      controlsCount: 0,
      courseControlsCount: 0,
    });
  });

  it('reports courses available when courses, controls and course controls exist', async () => {
    fake = createFakePrisma({
      events: [{ id: 'evt1' }],
      classes: [{ id: 1, eventId: 'evt1', name: 'A', courseId: 10 }],
      courses: [{ id: 10, eventId: 'evt1', name: 'A' }],
      controls: [{ id: 100, eventId: 'evt1', code: '100', type: 'CONTROL', radio: false }],
      courseControls: [{ id: 1, courseId: 10, sequence: 1, controlId: 100, controlCode: '100' }],
    });
    const status = await getEventFilesStatus(asPrisma(), 'evt1');
    expect(status.courses.available).toBe(true);
    expect(status.courses).toMatchObject({
      coursesCount: 1,
      controlsCount: 1,
      courseControlsCount: 1,
      source: 'data',
    });
  });

  it('reports results unavailable when no competitor has result data', async () => {
    fake = createFakePrisma({
      events: [{ id: 'evt1' }],
      classes: [{ id: 1, eventId: 'evt1', name: 'A' }],
      competitors: [
        { id: 1, classId: 1, startTime: null, finishTime: null, time: null, status: 'Inactive' },
      ],
    });
    const status = await getEventFilesStatus(asPrisma(), 'evt1');
    expect(status.results.available).toBe(false);
    expect(status.results.competitorsWithResultDataCount).toBe(0);
  });

  it('reports results available from finishTime, time, or a real result status', async () => {
    fake = createFakePrisma({
      events: [{ id: 'evt1' }],
      classes: [{ id: 1, eventId: 'evt1', name: 'A' }],
      competitors: [
        { id: 1, classId: 1, finishTime: new Date('2026-06-11T09:00:00Z'), time: null, status: 'Inactive' },
        { id: 2, classId: 1, finishTime: null, time: 3600, status: 'Inactive' },
        { id: 3, classId: 1, finishTime: null, time: null, status: 'DidNotFinish' },
        { id: 4, classId: 1, finishTime: null, time: null, status: 'DidNotStart' },
      ],
    });
    const status = await getEventFilesStatus(asPrisma(), 'evt1');
    expect(status.results.available).toBe(true);
    // The DidNotStart competitor (id 4) is not counted as a result.
    expect(status.results.competitorsWithResultDataCount).toBe(3);
    expect(status.results.source).toBe('data');
  });

  it('does not derive availability from upload records (only data matters)', async () => {
    // Classes exist (e.g. an upload happened) but there is no competitor /
    // course / result data: every section must still report unavailable.
    fake = createFakePrisma({
      events: [{ id: 'evt1' }],
      classes: [{ id: 1, eventId: 'evt1', name: 'A' }],
    });
    const status = await getEventFilesStatus(asPrisma(), 'evt1');
    expect(status.startList.available).toBe(false);
    expect(status.courses.available).toBe(false);
    expect(status.results.available).toBe(false);
  });

  it('returns event CONTROL radio controls sorted naturally, excluding start/finish', async () => {
    fake = createFakePrisma({
      events: [{ id: 'evt1' }],
      controls: [
        { id: 100, eventId: 'evt1', code: 'S1', type: 'START', radio: false },
        { id: 101, eventId: 'evt1', code: '110', type: 'CONTROL', radio: false },
        { id: 102, eventId: 'evt1', code: '100', type: 'CONTROL', radio: true },
        { id: 103, eventId: 'evt1', code: '102', type: 'CONTROL', radio: false },
        { id: 104, eventId: 'evt1', code: 'F1', type: 'FINISH', radio: false },
      ],
    });
    const status = await getEventFilesStatus(asPrisma(), 'evt1');
    expect(status.radioControls.map((c) => c.code)).toEqual(['100', '102', '110']);
    expect(status.radioControls.find((c) => c.code === '100')?.radio).toBe(true);
  });
});
