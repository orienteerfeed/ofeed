import { describe, expect, it } from 'vitest';

import {
  hasDisplayableCourseClimb,
  hasDisplayableCourseInfo,
  hasDisplayableCourseLength,
} from '../../src/lib/course-info';

describe('course-info helpers', () => {
  it('hides placeholder zero values', () => {
    expect(hasDisplayableCourseLength(0)).toBe(false);
    expect(hasDisplayableCourseClimb({ length: 0, climb: 0 })).toBe(false);
    expect(hasDisplayableCourseInfo({ length: 0, climb: 0 })).toBe(false);
  });

  it('shows zero climb for valid flat courses', () => {
    expect(hasDisplayableCourseLength(4100)).toBe(true);
    expect(hasDisplayableCourseClimb({ length: 4100, climb: 0 })).toBe(true);
    expect(hasDisplayableCourseInfo({ length: 4100, climb: 0 })).toBe(true);
  });
});
