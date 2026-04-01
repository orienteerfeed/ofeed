import { describe, expect, it } from 'vitest';

import {
  calculateCzechRankingPointsForResult,
  isCzechRankingWriteConflict,
  isCzechRankingEligibleClassName,
  isCzechRankingEligibleRegistration,
  resolveCurrentCzechRankingWindowStart,
  resolveCzechRankingCategoryFromClassName,
  resolveCzechRankingBucket,
  resolveEffectiveCzechRankingSnapshotMonth,
  resolveCzechRankingSnapshotMonth,
} from '../czech-ranking.js';
import { normalizeCzechRankingMonthInput } from '../../modules/upload/upload.service.js';

describe('czech-ranking helpers', () => {
  it('recognizes eligible Czech ranking registrations', () => {
    expect(isCzechRankingEligibleRegistration('PHK0302')).toBe(true);
    expect(isCzechRankingEligibleRegistration(' phk0302 ')).toBe(true);
    expect(isCzechRankingEligibleRegistration('')).toBe(false);
    expect(isCzechRankingEligibleRegistration('ABC123')).toBe(false);
  });

  it('recognizes Czech ranking classes', () => {
    expect(isCzechRankingEligibleClassName('H21A')).toBe(true);
    expect(isCzechRankingEligibleClassName('D20B')).toBe(true);
    expect(isCzechRankingEligibleClassName('H35')).toBe(false);
    expect(isCzechRankingEligibleClassName('Open')).toBe(false);
  });

  it('maps disciplines to Czech ranking buckets', () => {
    expect(resolveCzechRankingBucket('MIDDLE')).toBe('FOREST');
    expect(resolveCzechRankingBucket('LONG')).toBe('FOREST');
    expect(resolveCzechRankingBucket('NIGHT')).toBe('FOREST');
    expect(resolveCzechRankingBucket('SPRINT')).toBe('SPRINT');
    expect(resolveCzechRankingBucket('KNOCKOUT_SPRINT')).toBe('NONE');
    expect(resolveCzechRankingBucket('OTHER')).toBe('NONE');
  });

  it('maps Czech ranking classes to snapshot categories', () => {
    expect(resolveCzechRankingCategoryFromClassName('H21A')).toBe('M');
    expect(resolveCzechRankingCategoryFromClassName('D20B')).toBe('F');
    expect(resolveCzechRankingCategoryFromClassName('Open')).toBeNull();
  });

  it('resolves the ranking snapshot month to the previous calendar month', () => {
    expect(
      resolveCzechRankingSnapshotMonth(new Date('2026-03-15T00:00:00.000Z')).toISOString(),
    ).toBe('2026-02-01T00:00:00.000Z');
    expect(
      resolveCzechRankingSnapshotMonth(new Date('2026-01-03T00:00:00.000Z')).toISOString(),
    ).toBe('2025-12-01T00:00:00.000Z');
  });

  it('falls back to the latest available Czech ranking snapshot month at or before the target month', () => {
    expect(
      resolveEffectiveCzechRankingSnapshotMonth(new Date('2026-03-01T00:00:00.000Z'), [
        new Date('2026-03-01T00:00:00.000Z'),
        new Date('2026-02-01T00:00:00.000Z'),
        new Date('2026-01-01T00:00:00.000Z'),
      ])?.toISOString(),
    ).toBe('2026-03-01T00:00:00.000Z');

    expect(
      resolveEffectiveCzechRankingSnapshotMonth(new Date('2025-12-01T00:00:00.000Z'), [
        new Date('2026-01-01T00:00:00.000Z'),
        new Date('2025-11-01T00:00:00.000Z'),
        new Date('2025-09-01T00:00:00.000Z'),
      ])?.toISOString(),
    ).toBe('2025-11-01T00:00:00.000Z');

    expect(
      resolveEffectiveCzechRankingSnapshotMonth(new Date('2025-09-01T00:00:00.000Z'), [
        new Date('2025-11-01T00:00:00.000Z'),
        new Date('2025-10-01T00:00:00.000Z'),
      ]),
    ).toBeNull();
  });

  it('resolves rolling window starts for current Czech ranking views', () => {
    expect(
      resolveCurrentCzechRankingWindowStart(
        'FOREST',
        new Date('2026-03-31T12:00:00.000Z'),
      )?.toISOString(),
    ).toBe('2025-04-01T00:00:00.000Z');
    expect(
      resolveCurrentCzechRankingWindowStart(
        'SPRINT',
        new Date('2026-03-31T12:00:00.000Z'),
      )?.toISOString(),
    ).toBe('2024-04-01T00:00:00.000Z');
    expect(
      resolveCurrentCzechRankingWindowStart('NONE', new Date('2026-03-31T12:00:00.000Z')),
    ).toBeNull();
  });

  it('calculates Czech ranking points with the current formula', () => {
    expect(
      calculateCzechRankingPointsForResult({
        competitorTime: 100,
        performanceCenter: 100,
        fieldStrength: 9800,
        position: 1,
        ratedCompetitorsCount: 10,
        startFactor: 0,
        eventCoefficient: 1,
      }),
    ).toBe(9800);

    expect(
      calculateCzechRankingPointsForResult({
        competitorTime: 220,
        performanceCenter: 100,
        fieldStrength: 9800,
        position: 10,
        ratedCompetitorsCount: 10,
        startFactor: 0.15,
        eventCoefficient: 1,
      }),
    ).toBe(0);
  });

  it('recognizes Czech ranking write conflicts from MariaDB/Prisma errors', () => {
    expect(
      isCzechRankingWriteConflict(
        new Error("Record has changed since last read in table 'competitor'"),
      ),
    ).toBe(true);
    expect(isCzechRankingWriteConflict(new Error('P2034 transaction write conflict'))).toBe(true);
    expect(isCzechRankingWriteConflict(new Error('Validation failed'))).toBe(false);
  });
});

describe('normalizeCzechRankingMonthInput', () => {
  it('parses YYYY-MM values', () => {
    expect(normalizeCzechRankingMonthInput('2026-02')?.toISOString()).toBe(
      '2026-02-01T00:00:00.000Z',
    );
  });

  it('rejects invalid month values', () => {
    expect(normalizeCzechRankingMonthInput('2026-13')).toBeNull();
    expect(normalizeCzechRankingMonthInput('2026/02')).toBeNull();
  });
});
