import { describe, expect, it } from 'vitest';
import { eventAnomalyInsightSchema } from '@repo/shared';
import { analyzeEventAnomalies, inferStartGrid } from '../anomaly-analysis.js';
import { category, competitor, event } from './anomaly-fixtures.js';

const fast = (time = 20) => competitor(99, { splits: [{ controlCode: 31, time }] });
const splitCoverage = (report: ReturnType<typeof analyzeEventAnomalies>) =>
  report.coverage.find((row) => row.type === 'FAST_FIRST_SPLIT');

describe('conservative first split detection', () => {
  it('uses verified first ordinary control, leave-one-out references and structured evidence', () => {
    const report = analyzeEventAnomalies(event, [
      category({ competitors: [...category().competitors.slice(0, 8), fast()] }),
    ]);
    expect(report.competitors).toHaveLength(1);
    expect(report.competitors[0]).toMatchObject({
      id: 99,
      findings: [
        {
          type: 'FAST_FIRST_SPLIT',
          controlCode: 31,
          splitSeconds: 20,
          medianSeconds: 100,
          referenceCount: 8,
          differenceSeconds: 80,
        },
      ],
    });
    expect(splitCoverage(report)).toMatchObject({ status: 'EVALUATED', evaluated: 9, total: 9 });
    expect(eventAnomalyInsightSchema.parse(report)).toEqual(report);
  });
  it.each([
    [50, 100, false],
    [49, 100, true],
    [20, 50, true],
    [21, 50, false],
    [0, 100, false],
    [-1, 100, false],
    [null, 100, false],
  ])(
    'honors ratio, absolute difference and positivity boundaries (%s against %s)',
    (time, center, flagged) => {
      const peers = Array.from({ length: 8 }, (_, index) =>
        competitor(index + 1, { splits: [{ controlCode: 31, time: center }] }),
      );
      const report = analyzeEventAnomalies(event, [
        category({
          competitors: [...peers, competitor(99, { splits: [{ controlCode: 31, time }] })],
        }),
      ]);
      expect(report.competitors.some((row) => row.id === 99)).toBe(flagged);
    },
  );
  it('requires eight OTHER valid references and does not use a rejected status as reference', () => {
    const peers = category().competitors.slice(0, 7);
    const report = analyzeEventAnomalies(event, [
      category({ competitors: [...peers, competitor(8, { status: 'MissingPunch' }), fast()] }),
    ]);
    expect(report.competitors).toEqual([]);
    expect(splitCoverage(report)).toMatchObject({ status: 'EVALUATED', evaluated: 1 }); // Only the non-reference can use all eight OK peers.
    const tooFew = analyzeEventAnomalies(event, [category({ competitors: [...peers, fast()] })]);
    expect(splitCoverage(tooFew)).toMatchObject({ status: 'INSUFFICIENT_DATA', evaluated: 0 });
  });
  it('can flag a non-reference competitor and does not mix categories', () => {
    const peers = category().competitors.slice(0, 8);
    const report = analyzeEventAnomalies(event, [
      category({ competitors: peers }),
      category({ id: 2, name: 'D21', competitors: [fast()] }),
    ]);
    expect(report.competitors).toEqual([]);
    const valid = analyzeEventAnomalies(event, [
      category({ competitors: [...peers, { ...fast(), status: 'Disqualified' }] }),
    ]);
    expect(valid.competitors[0]?.id).toBe(99);
  });
  it('does not flag broad peer distributions using MAD', () => {
    const peers = Array.from({ length: 8 }, (_, index) =>
      competitor(index + 1, { splits: [{ controlCode: 31, time: index < 4 ? 100 : 200 }] }),
    );
    expect(
      analyzeEventAnomalies(event, [category({ competitors: [...peers, fast()] })]).competitors,
    ).toEqual([]);
  });
  it('skips missing courses and ambiguous first controls without falling back to stored splits', () => {
    for (const course of [null, { courseControls: [] }]) {
      expect(
        splitCoverage(
          analyzeEventAnomalies(event, [
            category({ course, competitors: [...category().competitors, fast()] }),
          ]),
        )?.status,
      ).toBe('NO_COURSE');
    }
    const course = category().course!;
    const ambiguous = {
      courseControls: [...course.courseControls, { ...course.courseControls[2], sequence: 6 }],
    };
    expect(
      splitCoverage(analyzeEventAnomalies(event, [category({ course: ambiguous })]))?.status,
    ).toBe('AMBIGUOUS_FIRST_CONTROL');
    const repeated = fast();
    repeated.splits.push({ controlCode: 31, time: 30 });
    const missing = competitor(98, { splits: [{ controlCode: 32, time: 10 }] });
    expect(
      analyzeEventAnomalies(event, [
        category({ competitors: [...category().competitors, repeated, missing] }),
      ]).competitors,
    ).toEqual([]);
  });
  it.each(['Unordered', 'UnorderedNoTimes'])('skips %s result mode', (resultListMode) => {
    expect(
      splitCoverage(analyzeEventAnomalies(event, [category({ resultListMode })]))?.status,
    ).toBe('UNSUPPORTED_MODE');
  });
  it('skips Score-O but analyzes splits in FreeStart', () => {
    expect(
      splitCoverage(analyzeEventAnomalies({ ...event, eventFormat: 'ScoreO' }, [category()]))
        ?.status,
    ).toBe('UNSUPPORTED_MODE');
    const report = analyzeEventAnomalies({ ...event, defaultStartMode: 'FreeStart' }, [
      category({ competitors: [...category().competitors, fast()] }),
    ]);
    expect(report.competitors[0]?.findings[0]?.type).toBe('FAST_FIRST_SPLIT');
    expect(
      report.coverage
        .filter((row) => row.type !== 'FAST_FIRST_SPLIT')
        .every((row) => row.status === 'UNSUPPORTED_MODE'),
    ).toBe(true);
  });
});

describe('class start grid inference', () => {
  const ms = (seconds: number[]) => seconds.map((value) => value * 1000);
  it.each([60, 30, 120])(
    'accepts regular offset %s-second grids and duplicate wave starts',
    (interval) => {
      const times = Array.from({ length: 8 }, (_, index) => index * interval + 17);
      expect(inferStartGrid(ms([...times, ...times]))).toEqual({
        interval: interval * 1000,
        phase: 17_000,
      });
    },
  );
  it('accepts gaps and an outlier with at least 80% grid support', () => {
    expect(inferStartGrid(ms([0, 60, 120, 180, 240, 360, 390]))).toEqual({
      interval: 60_000,
      phase: 0,
    });
    expect(inferStartGrid(ms([0, 60, 120, 180, 211]))).toEqual({ interval: 60_000, phase: 0 });
  });
  it('rejects small, duplicate-only, noisy, ambiguous-phase, too-short and tied-gap samples', () => {
    for (const sample of [
      [0, 60, 120, 180],
      [0, 0, 0, 0, 0],
      [0, 60, 120, 180, 211, 242],
      [0, 60, 120, 180, 217, 277, 337, 397],
      [0, 1, 2, 3, 4],
      [0, 30, 90, 120, 180, 210, 270],
    ])
      expect(inferStartGrid(ms(sample)), String(sample)).toBeNull();
  });
  it('flags off-grid times while allowing the one-second tolerance and retaining wave competitors', () => {
    const times = [0, 60, 120, 180, 240, 300, 360, 420, 481, 541.001];
    const members = times.map((seconds, index) =>
      competitor(index + 1, { startTime: new Date(Date.UTC(2026, 9, 28, 10) + seconds * 1000) }),
    );
    const report = analyzeEventAnomalies(event, [
      category({ startMode: 'WaveStart', competitors: [...members, { ...members[9], id: 99 }] }),
    ]);
    expect(report.competitors.map((row) => row.id)).toEqual([10, 99]);
    expect(report.competitors[0]?.findings[0]).toMatchObject({
      type: 'OFF_START_GRID',
      intervalSeconds: 60,
      differenceSeconds: 1.001,
      nearestStartTime: '2026-10-28T10:09:00.000Z',
    });
  });
  it('calculates across midnight and DST using absolute timestamps', () => {
    const base = Date.parse('2026-10-25T00:58:00Z');
    expect(inferStartGrid(ms([0, 60, 120, 180, 240, 300]).map((value) => value + base))).toEqual({
      interval: 60_000,
      phase: 0,
    });
  });
});

describe('observed start punches and report coverage', () => {
  it('combines all findings under one competitor and inherits the event start mode', () => {
    const member = fast();
    member.startTime = new Date('2026-10-28T10:10:13Z');
    member.punches = [
      { punchTime: new Date('2026-10-28T10:10:12Z') },
      { punchTime: new Date('2026-10-28T10:10:11Z') },
    ];
    const report = analyzeEventAnomalies(event, [
      category({ competitors: [...category().competitors, member] }),
    ]);
    expect(report.competitors).toHaveLength(1);
    expect(report.competitors[0]).toMatchObject({
      startMode: 'StartList',
      findings: [
        { type: 'FAST_FIRST_SPLIT' },
        { type: 'OFF_START_GRID' },
        {
          type: 'START_PUNCH',
          punchTimes: ['2026-10-28T10:10:11.000Z', '2026-10-28T10:10:12.000Z'],
        },
      ],
    });
    expect(report.coverage.find((row) => row.type === 'START_PUNCH')).toMatchObject({
      evaluated: 1,
      total: 10,
    });
  });
  it.each(['FreeStart', 'MassStart', 'PursuitStart'] as const)(
    'does not check starts for %s',
    (startMode) => {
      const member = competitor(1, { punches: [{ punchTime: new Date() }] });
      const report = analyzeEventAnomalies(event, [category({ startMode, competitors: [member] })]);
      expect(report.competitors).toEqual([]);
      expect(
        report.coverage.filter((row) => row.type !== 'FAST_FIRST_SPLIT').map((row) => row.status),
      ).toEqual(['UNSUPPORTED_MODE', 'UNSUPPORTED_MODE']);
    },
  );
  it('returns coverage for empty classes without claiming successful checks', () => {
    const report = analyzeEventAnomalies(event, [category({ competitors: [] })]);
    expect(report.competitors).toEqual([]);
    expect(
      report.coverage.every((row) => row.status === 'INSUFFICIENT_DATA' && row.evaluated === 0),
    ).toBe(true);
    expect(analyzeEventAnomalies(event, [])).toEqual({ competitors: [], coverage: [] });
  });
});
