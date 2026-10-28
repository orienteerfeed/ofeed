import { describe, expect, it } from 'vitest';
import type { EventAnomalyInsight } from '@repo/shared';
import {
  filterAnomalyInsight,
  summarizeAnomalies,
} from '@/pages/Event/Insights/anomaly-insight.utils';

const report: EventAnomalyInsight = {
  coverage: [],
  competitors: [
    {
      id: 3,
      firstname: 'Jan',
      lastname: 'Zed',
      registration: 'ABC123',
      bibNumber: 7,
      card: 1234,
      organisation: 'Club',
      classId: 1,
      className: 'H21',
      startMode: 'StartList',
      startTime: null,
      findings: [
        {
          type: 'FAST_FIRST_SPLIT',
          controlCode: 31,
          splitSeconds: 20,
          medianSeconds: 100,
          differenceSeconds: 80,
          referenceCount: 8,
          intervalSeconds: null,
          phaseSeconds: null,
          nearestStartTime: null,
          punchTimes: [],
        },
        {
          type: 'START_PUNCH',
          controlCode: null,
          splitSeconds: null,
          medianSeconds: null,
          differenceSeconds: null,
          referenceCount: null,
          intervalSeconds: null,
          phaseSeconds: null,
          nearestStartTime: null,
          punchTimes: ['2026-10-28T10:00:00Z'],
        },
      ],
    },
    {
      id: 1,
      firstname: 'Alice',
      lastname: 'Abel',
      registration: 'DEF456',
      bibNumber: null,
      card: null,
      organisation: null,
      classId: 2,
      className: 'D21',
      startMode: 'WaveStart',
      startTime: null,
      findings: [
        {
          type: 'OFF_START_GRID',
          controlCode: null,
          splitSeconds: null,
          medianSeconds: null,
          differenceSeconds: 13,
          referenceCount: null,
          intervalSeconds: 60,
          phaseSeconds: 0,
          nearestStartTime: '2026-10-28T10:00:00Z',
          punchTimes: [],
        },
      ],
    },
  ],
};
describe('anomaly filters and counts', () => {
  it('combines class, search and finding type without discarding other evidence or changing the source', () => {
    const before = structuredClone(report);
    const rows = filterAnomalyInsight(report, {
      classId: '1',
      search: '  abc123 ',
      type: 'START_PUNCH',
    });
    expect(rows.map(row => row.id)).toEqual([3]);
    expect(rows[0]!.findings).toHaveLength(2);
    expect(report).toEqual(before);
    expect(summarizeAnomalies(rows)).toEqual([
      { type: 'FAST_FIRST_SPLIT', count: 1 },
      { type: 'OFF_START_GRID', count: 0 },
      { type: 'START_PUNCH', count: 1 },
    ]);
  });
  it.each(['Club', '1234', '7', 'Zed Jan', 'Jan Zed'])(
    'searches all identifying fields: %s',
    search => {
      expect(
        filterAnomalyInsight(report, { classId: '', search, type: '' }).map(
          row => row.id
        )
      ).toEqual([3]);
    }
  );
  it('orders by class/name and returns no matches for inconsistent filters', () => {
    expect(
      filterAnomalyInsight(report, { classId: '', search: '', type: '' }).map(
        row => row.id
      )
    ).toEqual([1, 3]);
    expect(
      filterAnomalyInsight(report, { classId: '2', search: 'Club', type: '' })
    ).toEqual([]);
  });
});
