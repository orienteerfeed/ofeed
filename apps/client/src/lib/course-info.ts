type CourseInfo = {
  length?: number | null;
  climb?: number | null;
};

export function hasDisplayableCourseLength(length?: number | null): boolean {
  return typeof length === 'number' && length > 0;
}

export function hasDisplayableCourseClimb({
  length,
  climb,
}: CourseInfo): boolean {
  return typeof climb === 'number' && (climb > 0 || (climb === 0 && hasDisplayableCourseLength(length)));
}

export function hasDisplayableCourseInfo(course: CourseInfo): boolean {
  return hasDisplayableCourseLength(course.length) || hasDisplayableCourseClimb(course);
}
