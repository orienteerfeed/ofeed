import { describe, expect, it } from 'vitest';

import { computeClassCapacity } from '../class.capacity.js';

describe('computeClassCapacity — FreeStart mode', () => {
  it('returns max minus live count when max is set', () => {
    expect(
      computeClassCapacity({
        effectiveStartMode: 'FreeStart',
        maxNumberOfCompetitors: 50,
        competitorCount: 17,
        vacancyCount: 0,
      }),
    ).toEqual({ availableCount: 33, capacityMode: 'FreeStart', isFull: false });
  });

  it('returns 0 when max is null (no cap configured)', () => {
    expect(
      computeClassCapacity({
        effectiveStartMode: 'FreeStart',
        maxNumberOfCompetitors: null,
        competitorCount: 5,
        vacancyCount: 0,
      }),
    ).toEqual({ availableCount: 0, capacityMode: 'FreeStart', isFull: true });
  });

  it('clamps to 0 when competitors exceed max', () => {
    expect(
      computeClassCapacity({
        effectiveStartMode: 'FreeStart',
        maxNumberOfCompetitors: 10,
        competitorCount: 12,
        vacancyCount: 0,
      }),
    ).toEqual({ availableCount: 0, capacityMode: 'FreeStart', isFull: true });
  });

  it('is full when max equals competitor count', () => {
    const result = computeClassCapacity({
      effectiveStartMode: 'FreeStart',
      maxNumberOfCompetitors: 20,
      competitorCount: 20,
      vacancyCount: 0,
    });
    expect(result.isFull).toBe(true);
    expect(result.availableCount).toBe(0);
  });
});

describe('computeClassCapacity — StartSlot mode', () => {
  it('returns 0 when max is null, even if slots exist', () => {
    expect(
      computeClassCapacity({
        effectiveStartMode: 'StartList',
        maxNumberOfCompetitors: null,
        competitorCount: 10,
        vacancyCount: 7,
      }),
    ).toEqual({ availableCount: 0, capacityMode: 'StartSlot', isFull: true });
  });

  it('is full when vacancyCount is 0 (max set)', () => {
    expect(
      computeClassCapacity({
        effectiveStartMode: 'MassStart',
        maxNumberOfCompetitors: 100,
        competitorCount: 30,
        vacancyCount: 0,
      }),
    ).toEqual({ availableCount: 0, capacityMode: 'StartSlot', isFull: true });
  });

  it('caps availableCount at headroom when max is the tighter constraint', () => {
    // 120 max, 105 registered → headroom = 15; but 25 slots → min(25, 15) = 15
    expect(
      computeClassCapacity({
        effectiveStartMode: 'StartList',
        maxNumberOfCompetitors: 120,
        competitorCount: 105,
        vacancyCount: 25,
      }),
    ).toEqual({ availableCount: 15, capacityMode: 'StartSlot', isFull: false });
  });

  it('caps availableCount at vacancyCount when slots are the tighter constraint', () => {
    // 100 max, 10 registered → headroom = 90; but only 7 slots → min(7, 90) = 7
    expect(
      computeClassCapacity({
        effectiveStartMode: 'WaveStart',
        maxNumberOfCompetitors: 100,
        competitorCount: 10,
        vacancyCount: 7,
      }),
    ).toEqual({ availableCount: 7, capacityMode: 'StartSlot', isFull: false });
  });

  it('is full when competitors have reached max, even with slots remaining', () => {
    expect(
      computeClassCapacity({
        effectiveStartMode: 'StartList',
        maxNumberOfCompetitors: 50,
        competitorCount: 50,
        vacancyCount: 3,
      }),
    ).toEqual({ availableCount: 0, capacityMode: 'StartSlot', isFull: true });
  });
});
