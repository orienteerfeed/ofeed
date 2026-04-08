import { describe, expect, it } from 'vitest';

import {
  createFastestSplitChartReferenceTimes,
  createSplitChartCheckpoints,
  createInitialSplitChartVisibility,
  DEFAULT_VISIBLE_SPLIT_CHART_RUNNERS,
  hasSplitChartData,
} from '../../../src/pages/Event/split-chart.utils';

describe('split chart utils', () => {
  it('detects competitors with at least one split datapoint', () => {
    expect(
      hasSplitChartData({
        id: '1',
        splits: [{ controlCode: '31', time: 120 }],
      }),
    ).toBe(true);
    expect(hasSplitChartData({ id: '2', time: 900, splits: [] })).toBe(true);
    expect(hasSplitChartData({ id: '3', splits: [] })).toBe(false);
  });

  it('creates checkpoints from start through finish', () => {
    const checkpoints = createSplitChartCheckpoints([
      {
        id: 'a',
        time: 360,
        splits: [{ controlCode: '31', time: 120 }],
      },
      {
        id: 'b',
        time: 420,
        splits: [
          { controlCode: '31', time: 125 },
          { controlCode: '32', time: 255 },
        ],
      },
    ]);

    expect(checkpoints).toEqual([
      {
        controlCode: 'START',
        key: 'start',
        kind: 'start',
      },
      {
        controlCode: '31',
        key: 'control-0-31',
        kind: 'control',
        legIndex: 1,
        splitIndex: 0,
      },
      {
        controlCode: '32',
        key: 'control-1-32',
        kind: 'control',
        legIndex: 2,
        splitIndex: 1,
      },
      {
        controlCode: 'FINISH',
        key: 'finish',
        kind: 'finish',
      },
    ]);
  });

  it('builds cumulative fastest reference times from best legs', () => {
    const checkpoints = createSplitChartCheckpoints([
      {
        id: 'a',
        time: 300,
        splits: [
          { controlCode: '31', time: 100 },
          { controlCode: '32', time: 220 },
        ],
      },
      {
        id: 'b',
        time: 295,
        splits: [
          { controlCode: '31', time: 110 },
          { controlCode: '32', time: 205 },
        ],
      },
    ]);

    expect(
      createFastestSplitChartReferenceTimes(checkpoints, [
        {
          id: 'a',
          time: 300,
          splits: [
            { controlCode: '31', time: 100 },
            { controlCode: '32', time: 220 },
          ],
        },
        {
          id: 'b',
          time: 295,
          splits: [
            { controlCode: '31', time: 110 },
            { controlCode: '32', time: 205 },
          ],
        },
      ]),
    ).toEqual([0, 100, 195, 275]);
  });

  it('shows only the top runners with split data by default', () => {
    const visibility = createInitialSplitChartVisibility([
      { id: 'a', splits: [{ controlCode: '31', time: 100 }] },
      { id: 'b', splits: [{ controlCode: '31', time: 101 }] },
      { id: 'c', splits: [{ controlCode: '31', time: 102 }] },
      { id: 'd', splits: [{ controlCode: '31', time: 103 }] },
    ]);

    expect(Object.values(visibility).filter(Boolean)).toHaveLength(
      DEFAULT_VISIBLE_SPLIT_CHART_RUNNERS,
    );
    expect(visibility).toEqual({
      a: true,
      b: true,
      c: true,
      d: false,
    });
  });

  it('preserves manual selection while competitors stay in the same class', () => {
    const visibility = createInitialSplitChartVisibility(
      [
        { id: 'a', splits: [{ controlCode: '31', time: 100 }] },
        { id: 'b', splits: [{ controlCode: '31', time: 101 }] },
        { id: 'c', splits: [{ controlCode: '31', time: 102 }] },
      ],
      {
        a: false,
        b: true,
        c: false,
      },
    );

    expect(visibility).toEqual({
      a: false,
      b: true,
      c: false,
    });
  });
});
