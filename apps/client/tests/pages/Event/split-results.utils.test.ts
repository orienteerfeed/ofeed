import { describe, expect, it } from 'vitest';

import {
  filterValidSplitResultCompetitors,
  isValidSplitResultCompetitor,
} from '../../../src/pages/Event/split-results.utils';

describe('split results utils', () => {
  it('accepts only ranked competitors with valid finish time', () => {
    expect(isValidSplitResultCompetitor({ status: 'OK', time: 1234 })).toBe(true);
    expect(isValidSplitResultCompetitor({ status: 'OK' })).toBe(false);
    expect(
      isValidSplitResultCompetitor({ status: 'Disqualified', time: 1234 }),
    ).toBe(false);
    expect(
      isValidSplitResultCompetitor({ status: 'MissingPunch', time: 1234 }),
    ).toBe(false);
  });

  it('filters reference competitors down to official valid results', () => {
    expect(
      filterValidSplitResultCompetitors([
        { id: 'ok-1', status: 'OK', time: 1000 },
        { id: 'mp', status: 'MissingPunch', time: 900 },
        { id: 'dsq', status: 'Disqualified', time: 850 },
        { id: 'ok-2', status: 'OK', time: 1100 },
      ]),
    ).toEqual([
      { id: 'ok-1', status: 'OK', time: 1000 },
      { id: 'ok-2', status: 'OK', time: 1100 },
    ]);
  });
});
