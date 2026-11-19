import { describe, expect, it } from 'vitest';

import {
  buildRadioBestTimes,
  buildRadioRanks,
  getLastRadio,
  getProvisionalFinishTime,
  getRadioTime,
  getRunningRadioCode,
  isProvisionallyPlaced,
  placeProvisional,
  type RadioRankedCompetitor,
} from '@/pages/Event/radio-ranking.utils';

const runner = (
  id: string,
  status: string,
  splits: Record<string, number> = {}
): RadioRankedCompetitor => ({
  id,
  status,
  radioSplits: Object.entries(splits).map(([code, time]) => ({
    controlCode: Number(code),
    time,
  })),
});

const codes = ['100', '101'];

describe('radio ranking', () => {
  it('derives Finished duration from timestamps when the timing feed has no result time', () => {
    const finished = {
      ...runner('finished', 'Finished'),
      startTime: '2026-11-05T10:00:00Z',
      finishTime: '2026-11-05T10:20:00Z',
    };
    expect(getProvisionalFinishTime(finished)).toBe(1200);
    expect(getProvisionalFinishTime({ ...finished, time: 1100 })).toBe(1100);
    expect(
      getProvisionalFinishTime({ ...finished, finishTime: 'invalid' })
    ).toBeUndefined();
    const ok: RadioRankedCompetitor[] = [{ ...runner('ok', 'OK'), time: 1300 }];
    expect(placeProvisional(ok, [finished], []).map(row => row.id)).toEqual([
      'finished',
      'ok',
    ]);
  });
  it('places Finished by finish time before readout, even without radio splits', () => {
    const ok = [
      { ...runner('ok1', 'OK'), time: 1000 },
      { ...runner('ok2', 'OK'), time: 1200 },
    ];
    const pending = {
      ...runner('pending', 'Finished', { 100: 9999 }),
      time: 1100,
    };
    expect(isProvisionallyPlaced(pending, [])).toBe(true);
    expect(placeProvisional(ok, [pending], codes).map(row => row.id)).toEqual([
      'ok1',
      'pending',
      'ok2',
    ]);
    expect(
      placeProvisional(ok, [{ ...pending, time: 1000 }], []).map(row => row.id)
    ).toEqual(['ok1', 'pending', 'ok2']);
    expect(
      isProvisionallyPlaced({ ...pending, time: 0, radioSplits: [] }, [])
    ).toBe(true);
  });

  it('finds the best time at each control from the ranked runners only', () => {
    expect(
      buildRadioBestTimes(
        [
          runner('ok', 'OK', { 100: 300, 101: 620 }),
          runner('active', 'Active', { 100: 280, 101: 610 }),
          runner('dsq', 'Disqualified', { 100: 120, 101: 500 }),
        ],
        codes
      )
    ).toEqual(
      new Map([
        ['100', 280],
        ['101', 610],
      ])
    );
  });

  it('ranks every OK, Active and Finished runner at each radio control, ties shared', () => {
    const ranks = buildRadioRanks(
      [
        runner('a', 'OK', { 100: 300, 101: 600 }),
        runner('b', 'Active', { 100: 300 }),
        runner('c', 'Active', { 100: 250 }),
        runner('dsq', 'Disqualified', { 100: 100 }),
      ],
      codes
    );

    expect(ranks.get('100')).toEqual(
      new Map([
        ['c', 1],
        ['a', 2],
        ['b', 2],
      ])
    );
    expect(ranks.get('101')).toEqual(new Map([['a', 1]]));
  });

  it('uses the furthest radio control in course order', () => {
    expect(
      getLastRadio(runner('a', 'Active', { 100: 300, 101: 900 }), codes)
    ).toEqual({ code: '101', time: 900 });
    expect(getLastRadio(runner('a', 'Active', { 100: 300 }), codes)).toEqual({
      code: '100',
      time: 300,
    });
    expect(getLastRadio(runner('a', 'Active'), codes)).toBeUndefined();
  });

  it('places only Active and Finished runners with a radio time provisionally', () => {
    expect(
      isProvisionallyPlaced(runner('a', 'Active', { 100: 1 }), codes)
    ).toBe(true);
    expect(
      isProvisionallyPlaced(runner('a', 'Finished', { 101: 1 }), codes)
    ).toBe(true);
    expect(isProvisionallyPlaced(runner('a', 'Active'), codes)).toBe(false);
    expect(isProvisionallyPlaced(runner('a', 'OK', { 100: 1 }), codes)).toBe(
      false
    );
    expect(isProvisionallyPlaced(runner('a', 'Active', { 31: 1 }), codes)).toBe(
      false
    );
  });

  it('inserts runners on course after the finishers who were at least as fast there', () => {
    const ok = [
      runner('ok1', 'OK', { 100: 200, 101: 500 }),
      runner('ok2', 'OK', { 100: 300, 101: 650 }),
      runner('ok3', 'OK', { 100: 400, 101: 700 }),
    ];
    const pending = [
      // Newer control wins: 600 at 101 sits between ok1 and ok2.
      runner('p1', 'Active', { 100: 150, 101: 600 }),
      // Tie with ok2 at 100 goes after it.
      runner('p2', 'Active', { 100: 300 }),
      runner('p3', 'Active', { 100: 100 }),
      runner('p4', 'Active', { 100: 999 }),
    ];

    expect(
      placeProvisional(ok, pending, codes).map(competitor => competitor.id)
    ).toEqual(['p3', 'ok1', 'p1', 'ok2', 'p2', 'ok3', 'p4']);
  });

  it('ignores finishers without a time at the compared control', () => {
    const ok = [
      runner('ok1', 'OK', { 100: 200 }),
      runner('ok2', 'OK'),
      runner('ok3', 'OK', { 100: 400 }),
    ];

    expect(
      placeProvisional(ok, [runner('p', 'Active', { 100: 300 })], codes).map(
        competitor => competitor.id
      )
    ).toEqual(['ok1', 'p', 'ok2', 'ok3']);
  });

  it('keeps a runner after the finishers when none of them has a time at that control', () => {
    const ok = [runner('ok1', 'OK'), runner('ok2', 'OK')];

    expect(
      placeProvisional(ok, [runner('p', 'Active', { 100: 50 })], codes).map(
        competitor => competitor.id
      )
    ).toEqual(['ok1', 'ok2', 'p']);
  });

  it.each([
    [undefined, 200, 400],
    [undefined, 400, 200],
    [200, undefined, 300],
  ])('places after the last qualifying finisher in %j', (...times) => {
    const ok = times.map((time, index) =>
      runner(`ok${index}`, 'OK', time === undefined ? {} : { 100: time })
    );
    const pending = runner('p', 'Active', { 100: 300 });

    const ids = placeProvisional(ok, [pending], codes).map(item => item.id);
    expect(ids).toEqual(
      times[2] === 400 ? ['ok0', 'ok1', 'p', 'ok2'] : ['ok0', 'ok1', 'ok2', 'p']
    );
  });

  it('matches control codes with leading zeros numerically', () => {
    expect(getRadioTime(runner('a', 'Active', { 31: 420 }), '031')).toBe(420);
    expect(getRadioTime(runner('a', 'Active', { 31: 420 }), 'F1')).toBe(
      undefined
    );
  });
});

describe('running radio clock column', () => {
  const now = Date.parse('2026-11-05T10:10:00Z');
  const active = {
    ...runner('active', 'Active'),
    startTime: '2026-11-05T10:00:00Z',
  };
  it('moves through missing radios in course order and then to finish', () => {
    expect(getRunningRadioCode(active, ['101', '100'], now)).toBe('101');
    expect(
      getRunningRadioCode(
        { ...active, radioSplits: [{ controlCode: 101, time: 300 }] },
        ['101', '100'],
        now
      )
    ).toBe('100');
    expect(
      getRunningRadioCode(
        {
          ...active,
          radioSplits: [
            { controlCode: 100, time: 500 },
            { controlCode: 101, time: 300 },
          ],
        },
        ['101', '100'],
        now
      )
    ).toBeUndefined();
    expect(getRunningRadioCode(active, [], now)).toBeUndefined();
  });
  it('handles numeric codes, missing/invalid times and earlier gaps', () => {
    const competitor = {
      ...active,
      radioSplits: [
        { controlCode: 100, time: 0 },
        { controlCode: 101, time: 200 },
      ],
    };
    expect(getRunningRadioCode(competitor, ['0100', '101'], now)).toBe('0100');
    for (const time of [null, undefined, -1]) {
      expect(
        getRunningRadioCode(
          {
            ...competitor,
            radioSplits: [
              { controlCode: 100, ...(time === undefined ? {} : { time }) },
            ],
          },
          codes,
          now
        )
      ).toBe('100');
    }
    expect(
      getRunningRadioCode(
        { ...competitor, radioSplits: [{ controlCode: 100, time: 100 }] },
        ['0100', '101'],
        now
      )
    ).toBe('101');
  });
  it('keeps countdowns and invalid starts at finish and never moves non-Active clocks', () => {
    for (const startTime of [
      null,
      undefined,
      '',
      'invalid',
      '2026-11-05T10:11:00Z',
    ]) {
      expect(
        getRunningRadioCode(
          {
            ...runner('active', 'Active'),
            ...(startTime === undefined ? {} : { startTime }),
          },
          codes,
          now
        )
      ).toBeUndefined();
    }
    for (const status of [
      'OK',
      'Finished',
      'Inactive',
      'DidNotStart',
      'Disqualified',
    ]) {
      expect(
        getRunningRadioCode({ ...active, status }, codes, now)
      ).toBeUndefined();
    }
    expect(
      getRunningRadioCode(
        { ...active, startTime: new Date(now).toISOString() },
        codes,
        now
      )
    ).toBe('100');
  });
});
