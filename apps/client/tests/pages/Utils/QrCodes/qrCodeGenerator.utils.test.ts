import { describe, expect, it } from 'vitest';

import {
  countBibLabels,
  encodeBibCode,
  generateBibLabels,
} from '../../../../src/pages/Utils/QrCodes/qrCodeGenerator.utils';

describe('encodeBibCode', () => {
  it('zero-pads team and leg into a fixed 6-digit code', () => {
    expect(encodeBibCode(1, 1)).toBe('000101');
    expect(encodeBibCode(42, 7)).toBe('004207');
    expect(encodeBibCode(9999, 99)).toBe('999999');
  });
});

describe('countBibLabels', () => {
  it('multiplies the team and leg range sizes', () => {
    expect(
      countBibLabels({ teamFrom: 1, teamTo: 3, legFrom: 1, legTo: 2 }),
    ).toBe(6);
    expect(
      countBibLabels({ teamFrom: 5, teamTo: 5, legFrom: 1, legTo: 1 }),
    ).toBe(1);
  });

  it('returns 0 for inverted ranges', () => {
    expect(
      countBibLabels({ teamFrom: 3, teamTo: 1, legFrom: 1, legTo: 1 }),
    ).toBe(0);
    expect(
      countBibLabels({ teamFrom: 1, teamTo: 1, legFrom: 2, legTo: 1 }),
    ).toBe(0);
  });
});

describe('generateBibLabels', () => {
  it('generates one label per team/leg combination, team-major', () => {
    const labels = generateBibLabels({
      teamFrom: 1,
      teamTo: 2,
      legFrom: 1,
      legTo: 2,
    });

    expect(labels).toEqual([
      { team: 1, leg: 1, code: '000101' },
      { team: 1, leg: 2, code: '000102' },
      { team: 2, leg: 1, code: '000201' },
      { team: 2, leg: 2, code: '000202' },
    ]);
  });

  it('returns exactly one label for a single team/leg', () => {
    const labels = generateBibLabels({
      teamFrom: 7,
      teamTo: 7,
      legFrom: 3,
      legTo: 3,
    });

    expect(labels).toEqual([{ team: 7, leg: 3, code: '000703' }]);
  });
});
