/**
 * Purple Pen (`.ppen`) reader. A `.ppen` file is XML, so `DOMParser` handles it with no
 * dependency. Ported from generate-pdf-control-description.py.
 */

export const DESCRIPTION_BOXES = ['C', 'D', 'E', 'F', 'G', 'H'] as const;

export type DescriptionBox = (typeof DESCRIPTION_BOXES)[number];

export interface DescriptionRow {
  /** Sequence number, or null for start / finish / map issue rows. */
  order: number | null;
  code: number | null;
  /** IOF 2004 symbol refs per column, for rows that use the eight-column layout. */
  boxes: Partial<Record<DescriptionBox, string>>;
  /** IOF 2004 symbol ref for `box="all"` rows, which span the full width. */
  allBox: string | null;
}

export interface Course {
  id: number;
  name: string;
  /** Kilometres, following the map scale. */
  length: number;
  /** Metres, or null when the course has no climb set. */
  climb: number | null;
  rows: DescriptionRow[];
}

export interface PpenData {
  eventTitle: string;
  courses: Course[];
}

interface ParsedControl {
  code: number | null;
  boxes: Partial<Record<DescriptionBox, string>>;
  allBox: string | null;
  location: { x: number; y: number } | null;
}

const isDescriptionBox = (value: string): value is DescriptionBox =>
  (DESCRIPTION_BOXES as readonly string[]).includes(value);

const parseControls = (root: Element): Map<number, ParsedControl> => {
  const controls = new Map<number, ParsedControl>();

  for (const element of root.querySelectorAll(':scope > control')) {
    const id = Number(element.getAttribute('id'));
    if (!Number.isFinite(id)) continue;

    const codeText = element.querySelector(':scope > code')?.textContent;
    const location = element.querySelector(':scope > location');
    const control: ParsedControl = {
      code: codeText ? Number(codeText) : null,
      boxes: {},
      allBox: null,
      location: location
        ? {
            x: Number(location.getAttribute('x')),
            y: Number(location.getAttribute('y')),
          }
        : null,
    };

    for (const description of element.querySelectorAll(
      ':scope > description'
    )) {
      const box = description.getAttribute('box');
      const ref = description.getAttribute('iof-2004-ref');
      if (!box || !ref) continue;
      if (box === 'all') control.allBox = ref;
      else if (isDescriptionBox(box)) control.boxes[box] = ref;
    }

    controls.set(id, control);
  }

  return controls;
};

interface ParsedCourseControl {
  controlId: number;
  nextId: number | null;
}

const parseCourseControls = (
  root: Element
): Map<number, ParsedCourseControl> => {
  const courseControls = new Map<number, ParsedCourseControl>();

  for (const element of root.querySelectorAll(':scope > course-control')) {
    const id = Number(element.getAttribute('id'));
    if (!Number.isFinite(id)) continue;

    const next = element
      .querySelector(':scope > next')
      ?.getAttribute('course-control');
    courseControls.set(id, {
      controlId: Number(element.getAttribute('control')),
      nextId: next ? Number(next) : null,
    });
  }

  return courseControls;
};

/**
 * Walks the course-control linked list from `<first>`, collecting description rows and
 * summing leg distances.
 *
 * ponytail: the distance from the map issue point and from the last control to the
 * finish are excluded, matching the Python original's TODO. Purple Pen reports the same
 * length only for courses without those elements.
 */
const buildCourse = (
  element: Element,
  controls: Map<number, ParsedControl>,
  courseControls: Map<number, ParsedCourseControl>,
  mapScale: number
): Course | null => {
  const firstId = element
    .querySelector(':scope > first')
    ?.getAttribute('course-control');
  if (!firstId) return null;

  const rows: DescriptionRow[] = [];
  const climbText = element
    .querySelector(':scope > options')
    ?.getAttribute('climb');

  let order = 0;
  let lengthMm = 0;
  let previous: ParsedControl | null = null;
  let courseControlId: number | null = Number(firstId);
  const visited = new Set<number>();

  while (courseControlId !== null && !visited.has(courseControlId)) {
    visited.add(courseControlId);

    const courseControl = courseControls.get(courseControlId);
    if (!courseControl) break;
    const control = controls.get(courseControl.controlId);
    if (!control) break;

    // Only coded controls take a sequence number; start, finish and map issue don't.
    if (control.code !== null) order += 1;

    rows.push({
      order: control.code !== null ? order : null,
      code: control.code,
      boxes: control.boxes,
      allBox: control.allBox,
    });

    if (previous?.location && control.location) {
      lengthMm += Math.hypot(
        control.location.x - previous.location.x,
        control.location.y - previous.location.y
      );
    }

    previous = control;
    courseControlId = courseControl.nextId;
  }

  return {
    id: Number(element.getAttribute('id')),
    name: element.querySelector(':scope > name')?.textContent?.trim() ?? '',
    length: lengthMm * mapScale,
    climb: climbText ? Number(climbText) : null,
    rows,
  };
};

export const parsePpen = (xml: string): PpenData => {
  const document = new DOMParser().parseFromString(xml, 'text/xml');
  if (document.querySelector('parsererror')) {
    throw new Error('Not a valid XML document');
  }

  const root = document.querySelector('course-scribe-event');
  if (!root) throw new Error('Missing course-scribe-event root element');

  const scale = Number(
    root.querySelector('event > map')?.getAttribute('scale') ?? NaN
  );
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error('Missing map scale');
  }
  // Map millimetres times the scale gives real millimetres; divide by 1e6 for kilometres.
  const mapScale = scale / 1_000_000;

  const controls = parseControls(root);
  const courseControls = parseCourseControls(root);

  const courses: Course[] = [];
  for (const element of root.querySelectorAll(':scope > course')) {
    const course = buildCourse(element, controls, courseControls, mapScale);
    if (course && course.rows.length > 0) courses.push(course);
  }

  if (courses.length === 0) throw new Error('No courses found');

  return {
    eventTitle: root.querySelector('event > title')?.textContent?.trim() ?? '',
    courses,
  };
};
