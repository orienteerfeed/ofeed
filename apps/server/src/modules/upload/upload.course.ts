export type CourseMetricsInput = {
  length?: number | null;
  climb?: number | null;
  controlsCount?: number | null;
};

export type NormalizedCourseMetrics = {
  length?: number;
  climb?: number;
  controlsCount?: number;
};

function isInteger(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

export function normalizeCourseMetrics(
  input: CourseMetricsInput,
): NormalizedCourseMetrics {
  const rawLength = isInteger(input.length) ? input.length : null;
  const rawClimb = isInteger(input.climb) ? input.climb : null;
  const rawControlsCount = isInteger(input.controlsCount) ? input.controlsCount : null;

  const length = rawLength !== null && rawLength > 0 ? rawLength : undefined;
  const controlsCount =
    rawControlsCount !== null && rawControlsCount > 0 ? rawControlsCount : undefined;

  // Keep 0m climb for valid flat courses, but drop the placeholder 0/0/0 bundle.
  const climb =
    rawClimb !== null &&
    rawClimb >= 0 &&
    !(rawClimb === 0 && length === undefined && controlsCount === undefined)
      ? rawClimb
      : undefined;

  return {
    ...(length !== undefined ? { length } : {}),
    ...(climb !== undefined ? { climb } : {}),
    ...(controlsCount !== undefined ? { controlsCount } : {}),
  };
}
