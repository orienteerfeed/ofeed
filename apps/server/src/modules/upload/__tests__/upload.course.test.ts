import { describe, expect, it } from 'vitest';

import { normalizeCourseMetrics } from '../upload.course.js';

describe('normalizeCourseMetrics', () => {
  it('drops placeholder zero course metrics from start lists', () => {
    expect(
      normalizeCourseMetrics({
        length: 0,
        climb: 0,
        controlsCount: 0,
      }),
    ).toEqual({});
  });

  it('keeps 0m climb for valid flat courses', () => {
    expect(
      normalizeCourseMetrics({
        length: 3200,
        climb: 0,
        controlsCount: 15,
      }),
    ).toEqual({
      length: 3200,
      climb: 0,
      controlsCount: 15,
    });
  });

  it('drops zero length and zero controls while keeping meaningful climb', () => {
    expect(
      normalizeCourseMetrics({
        length: 0,
        climb: 45,
        controlsCount: 0,
      }),
    ).toEqual({
      climb: 45,
    });
  });
});
