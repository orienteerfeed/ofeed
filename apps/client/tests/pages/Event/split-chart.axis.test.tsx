import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';

/**
 * Guards the Recharts axis contract SplitChart relies on: a numeric x axis keyed
 * on cumulative course distance must position points and grid lines by distance,
 * not evenly per leg. jsdom does not render tick <text>, so tick *lines* are
 * measured instead.
 */

// Head and tail of the real D21C sprint course (legs 79, 32, ... , 207, 179).
const data = [
  { distance: 0, a: 0 },
  { distance: 79, a: 5 },
  { distance: 111, a: 9 },
  { distance: 2059, a: 20 },
  { distance: 2238, a: 25 },
];

function tickXs(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick-line'),
  ).map(node => Number(node.getAttribute('x1')));
}

function gaps(xs: number[]) {
  return xs.slice(1).map((x, index) => x - (xs[index] as number));
}

describe('split chart distance axis', () => {
  it('positions ticks proportionally to course distance', () => {
    const { container } = render(
      <LineChart width={600} height={300} data={data}>
        <CartesianGrid />
        <XAxis
          dataKey="distance"
          type="number"
          domain={['dataMin', 'dataMax']}
          ticks={data.map(point => point.distance)}
        />
        <YAxis />
        <Line dataKey="a" dot={false} isAnimationActive={false} />
      </LineChart>,
    );

    const xs = tickXs(container);
    expect(xs).toHaveLength(data.length);

    // Ratio of each gap to the total must track the ratio of leg length to course
    // length, within a pixel.
    const totalPx = (xs.at(-1) as number) - (xs[0] as number);
    const expectedGaps = gaps(data.map(point => point.distance)).map(
      legLength => (legLength / 2238) * totalPx,
    );
    gaps(xs).forEach((gap, index) => {
      expect(gap).toBeCloseTo(expectedGaps[index] as number, 0);
    });
  });

  it('spaces ticks evenly on the category axis fallback', () => {
    const { container } = render(
      <LineChart width={600} height={300} data={data}>
        <XAxis dataKey="distance" />
        <YAxis />
        <Line dataKey="a" dot={false} isAnimationActive={false} />
      </LineChart>,
    );

    const xs = tickXs(container);
    expect(xs).toHaveLength(data.length);
    expect(Math.max(...gaps(xs)) - Math.min(...gaps(xs))).toBeLessThan(1);
  });
});
