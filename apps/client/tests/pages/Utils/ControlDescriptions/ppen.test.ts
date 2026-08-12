import { describe, expect, it } from 'vitest';

import { coursePageHeightMm } from '../../../../src/pages/Utils/ControlDescriptions/controlDescriptionPdf';
import { parsePpen } from '../../../../src/pages/Utils/ControlDescriptions/ppen';

/**
 * Trimmed from `thermoprinter-control-descriptions/sample-purple-pen/test.ppen`, with
 * description boxes added to control 31 to cover symbol reference parsing. Course 2
 * visits the same controls in the opposite order.
 */
const PPEN = `<course-scribe-event>
  <event id="1">
    <title>Test race</title>
    <map kind="bitmap" scale="4000" dpi="96">dedina.jpg</map>
    <standards map="2017" description="2018" />
  </event>
  <control id="1" kind="start">
    <location x="486.470917" y="309.008972" />
  </control>
  <control id="2" kind="finish">
    <location x="574.7356" y="339.160461" />
    <description box="all" iof-2004-ref="14.3" />
  </control>
  <control id="3" kind="normal">
    <code>31</code>
    <location x="550.388245" y="252.460434" />
    <description box="C" iof-2004-ref="0.1E" />
    <description box="D" iof-2004-ref="1.10" />
    <description box="G" iof-2004-ref="11.2W" />
    <description box="H" iof-2004-ref="13.6" />
  </control>
  <control id="4" kind="normal">
    <code>32</code>
    <location x="601.1626" y="261.368225" />
  </control>
  <course id="1" kind="normal" order="1">
    <name>Trať 1</name>
    <first course-control="1" />
    <options print-scale="10000" description-kind="symbols" />
  </course>
  <course id="2" kind="normal" order="2">
    <name>Test 2</name>
    <first course-control="9" />
    <options print-scale="10000" climb="9584" description-kind="symbols" />
  </course>
  <course-control id="1" control="1"><next course-control="3" /></course-control>
  <course-control id="2" control="2" />
  <course-control id="3" control="3"><next course-control="4" /></course-control>
  <course-control id="4" control="4"><next course-control="2" /></course-control>
  <course-control id="7" control="4"><next course-control="8" /></course-control>
  <course-control id="8" control="3"><next course-control="10" /></course-control>
  <course-control id="9" control="1"><next course-control="7" /></course-control>
  <course-control id="10" control="2" />
</course-scribe-event>`;

describe('parsePpen', () => {
  it('reads the event title and every course', () => {
    const { eventTitle, courses } = parsePpen(PPEN);

    expect(eventTitle).toBe('Test race');
    expect(courses.map(course => course.name)).toEqual(['Trať 1', 'Test 2']);
  });

  it('walks the course-control chain in order', () => {
    const [course] = parsePpen(PPEN).courses;

    expect(course!.rows.map(row => row.code)).toEqual([null, 31, 32, null]);
  });

  it('numbers only coded controls, leaving start and finish blank', () => {
    const [course] = parsePpen(PPEN).courses;

    expect(course!.rows.map(row => row.order)).toEqual([null, 1, 2, null]);
  });

  it('follows each course through its own chain', () => {
    const course = parsePpen(PPEN).courses[1]!;

    expect(course.rows.map(row => row.code)).toEqual([null, 32, 31, null]);
    expect(course.rows.map(row => row.order)).toEqual([null, 1, 2, null]);
  });

  it('separates per-column boxes from full-width ones', () => {
    const [course] = parsePpen(PPEN).courses;
    const [, control31, , finish] = course!.rows;

    expect(control31!.boxes).toEqual({
      C: '0.1E',
      D: '1.10',
      G: '11.2W',
      H: '13.6',
    });
    expect(control31!.allBox).toBeNull();
    expect(finish!.allBox).toBe('14.3');
    expect(finish!.boxes).toEqual({});
  });

  it('sums leg distances at the map scale, in kilometres', () => {
    const [course] = parsePpen(PPEN).courses;

    // 1:4000, so a millimetre on the map is 4 metres on the ground.
    expect(course!.length).toBeCloseTo(0.8762, 3);
  });

  it('reads climb, or null when the course has none', () => {
    const { courses } = parsePpen(PPEN);

    expect(courses[0]!.climb).toBeNull();
    expect(courses[1]!.climb).toBe(9584);
  });

  it('rejects files that are not Purple Pen events', () => {
    expect(() => parsePpen('<html><body>nope</body></html>')).toThrow(
      /course-scribe-event/
    );
    expect(() => parsePpen('not xml at all <<<')).toThrow(/XML/);
  });

  it('rejects an event without a map scale', () => {
    expect(() =>
      parsePpen(
        '<course-scribe-event><event id="1"><title>x</title></event></course-scribe-event>'
      )
    ).toThrow(/map scale/);
  });
});

describe('coursePageHeightMm', () => {
  it('fits the two header rows plus one row per control, at 6mm each', () => {
    const [course] = parsePpen(PPEN).courses;

    expect(coursePageHeightMm(course!)).toBe((2 + 4) * 6);
  });
});
