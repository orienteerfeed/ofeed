import { describe, expect, it } from 'vitest';

import {
  compareByStatusPriorityThenName,
  compareCompetitorsByName,
  formatResultListRank,
  getResultStatusPriority,
  isFinishedResultCompetitor,
  isUnorderedResultListMode,
  resolveResultListMode,
  shouldDisplayResultTimeLoss,
  shouldDisplayResultTimes,
} from '../../../src/pages/Event/result-list.utils';

describe('resolveResultListMode', () => {
  it('falls back to Default for nullish or unknown values', () => {
    expect(resolveResultListMode(null)).toBe('Default');
    expect(resolveResultListMode(undefined)).toBe('Default');
    expect(resolveResultListMode('')).toBe('Default');
    expect(resolveResultListMode('Default')).toBe('Default');
    expect(resolveResultListMode('Something')).toBe('Default');
  });

  it('keeps the supported unordered modes', () => {
    expect(resolveResultListMode('Unordered')).toBe('Unordered');
    expect(resolveResultListMode('UnorderedNoTimes')).toBe('UnorderedNoTimes');
  });
});

describe('isUnorderedResultListMode', () => {
  it('is only true for the unordered modes', () => {
    expect(isUnorderedResultListMode(null)).toBe(false);
    expect(isUnorderedResultListMode('Default')).toBe(false);
    expect(isUnorderedResultListMode('Unordered')).toBe(true);
    expect(isUnorderedResultListMode('UnorderedNoTimes')).toBe(true);
  });
});

describe('time and time-loss visibility', () => {
  it('shows times for every mode except UnorderedNoTimes', () => {
    expect(shouldDisplayResultTimes(null)).toBe(true);
    expect(shouldDisplayResultTimes('Default')).toBe(true);
    expect(shouldDisplayResultTimes('Unordered')).toBe(true);
    expect(shouldDisplayResultTimes('UnorderedNoTimes')).toBe(false);
  });

  it('shows time loss for every mode except UnorderedNoTimes', () => {
    expect(shouldDisplayResultTimeLoss(null)).toBe(true);
    expect(shouldDisplayResultTimeLoss('Default')).toBe(true);
    expect(shouldDisplayResultTimeLoss('Unordered')).toBe(true);
    expect(shouldDisplayResultTimeLoss('UnorderedNoTimes')).toBe(false);
  });
});

describe('isFinishedResultCompetitor', () => {
  it('treats only ranked OK competitors as finished', () => {
    expect(isFinishedResultCompetitor({ status: 'OK' })).toBe(true);
    expect(isFinishedResultCompetitor({ status: 'Active' })).toBe(false);
    expect(isFinishedResultCompetitor({ status: 'Finished' })).toBe(false);
    expect(isFinishedResultCompetitor({ status: 'DidNotStart' })).toBe(false);
    expect(isFinishedResultCompetitor({ status: 'Disqualified' })).toBe(false);
  });
});

describe('compareCompetitorsByName', () => {
  it('orders by lastname then firstname, case-insensitively', () => {
    const people = [
      { firstname: 'Petr', lastname: 'Novak' },
      { firstname: 'Adam', lastname: 'novak' },
      { firstname: 'Eva', lastname: 'Adamova' },
    ];

    const sorted = people.slice().sort(compareCompetitorsByName);

    expect(sorted.map((p) => `${p.lastname} ${p.firstname}`)).toEqual([
      'Adamova Eva',
      'novak Adam',
      'Novak Petr',
    ]);
  });
});

describe('getResultStatusPriority', () => {
  it('ranks known statuses and treats unknown ones as lowest priority', () => {
    expect(getResultStatusPriority('OK')).toBe(0);
    expect(getResultStatusPriority('Active')).toBe(1);
    expect(getResultStatusPriority('DidNotStart')).toBe(9);
    expect(getResultStatusPriority('Something')).toBe(10);
  });
});

describe('compareByStatusPriorityThenName', () => {
  it('orders by status priority, then alphabetically within a status', () => {
    const competitors = [
      { firstname: 'Zoe', lastname: 'Young', status: 'Active' },
      { firstname: 'Bob', lastname: 'Brown', status: 'OK' },
      { firstname: 'Amy', lastname: 'Adams', status: 'Active' },
      { firstname: 'Carl', lastname: 'Clark', status: 'OK' },
      { firstname: 'Dan', lastname: 'Davis', status: 'DidNotStart' },
    ];

    const sorted = competitors.slice().sort(compareByStatusPriorityThenName);

    expect(sorted.map((c) => c.lastname)).toEqual([
      'Brown', // OK, alphabetical
      'Clark', // OK, alphabetical
      'Adams', // Active, alphabetical
      'Young', // Active, alphabetical
      'Davis', // DidNotStart
    ]);
  });

  it('orders unknown statuses after every known status', () => {
    const competitors = [
      { firstname: 'A', lastname: 'Adams', status: 'Weird' },
      { firstname: 'B', lastname: 'Brown', status: 'DidNotStart' },
    ];

    const sorted = competitors.slice().sort(compareByStatusPriorityThenName);

    expect(sorted.map((c) => c.status)).toEqual(['DidNotStart', 'Weird']);
  });
});

describe('formatResultListRank', () => {
  it('renders the numbered rank in default mode', () => {
    expect(formatResultListRank(3, 'Default')).toBe('3.');
    expect(formatResultListRank(1, null)).toBe('1.');
  });

  it('hides the numeric rank in unordered modes', () => {
    expect(formatResultListRank(3, 'Unordered')).toBe('-');
    expect(formatResultListRank(1, 'UnorderedNoTimes')).toBe('-');
  });

  it('passes through status markers regardless of mode', () => {
    expect(formatResultListRank('🏃', 'Default')).toBe('🏃');
    expect(formatResultListRank('🏃', 'Unordered')).toBe('🏃');
  });

  it('renders nothing for a missing rank', () => {
    expect(formatResultListRank(undefined, 'Default')).toBe('');
  });
});
