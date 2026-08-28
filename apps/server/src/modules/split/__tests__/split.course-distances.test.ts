import { describe, expect, it } from 'vitest';

import { computeSplitCourseDistances } from '../split.service.js';

type CourseControlInput = Parameters<typeof computeSplitCourseDistances>[0][number];

function start(): CourseControlInput {
  return { type: 'START', legLength: null, controlCode: 'S1', control: null };
}

function control(code: string, legLength: number | null): CourseControlInput {
  return { type: 'CONTROL', legLength, controlCode: code, control: null };
}

function finish(legLength: number | null): CourseControlInput {
  return { type: 'FINISH', legLength, controlCode: 'F1', control: null };
}

describe('computeSplitCourseDistances', () => {
  it('sums leg lengths into cumulative distances from the start', () => {
    // Head of the real H21C sprint course: legs 147, 123, 86, 119 into 112/116/102/101.
    expect(
      computeSplitCourseDistances(
        [
          start(),
          control('112', 147),
          control('116', 123),
          control('102', 86),
          control('101', 119),
          finish(179),
        ],
        2860,
      ),
    ).toEqual({
      totalLength: 654,
      controls: [
        { controlCode: '112', distance: 147 },
        { controlCode: '116', distance: 270 },
        { controlCode: '102', distance: 356 },
        { controlCode: '101', distance: 475 },
      ],
    });
  });

  it('falls back to the declared course length when the finish leg is absent', () => {
    expect(
      computeSplitCourseDistances([start(), control('112', 147), control('116', 123)], 400),
    ).toEqual({
      totalLength: 400,
      controls: [
        { controlCode: '112', distance: 147 },
        { controlCode: '116', distance: 270 },
      ],
    });
  });

  it('falls back to the resolved control type when the course control has none', () => {
    expect(
      computeSplitCourseDistances(
        [
          { type: null, legLength: null, controlCode: 'S1', control: { type: 'START' } },
          { type: null, legLength: 147, controlCode: '112', control: { type: 'CONTROL' } },
          { type: null, legLength: 179, controlCode: 'F1', control: { type: 'FINISH' } },
        ],
        2860,
      ),
    ).toEqual({ totalLength: 326, controls: [{ controlCode: '112', distance: 147 }] });
  });

  it('gives up when any leg length is missing', () => {
    expect(
      computeSplitCourseDistances(
        [start(), control('112', 147), control('116', null), finish(179)],
        2860,
      ),
    ).toBeNull();
  });

  it('gives up when there is no usable total length or no controls', () => {
    expect(computeSplitCourseDistances([start(), control('112', 147)], null)).toBeNull();
    expect(computeSplitCourseDistances([start(), finish(179)], 2860)).toBeNull();
  });
});
