import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  sport: {
    findMany: vi.fn(),
  },
}));

vi.mock('../../../utils/context.js', () => ({
  default: prismaMock,
}));

import {
  loadExternalEventPreview,
  loadOrisEventCandidatesByDateRange,
} from '../event.import.service.js';

describe('event.import.service ORIS discipline mapping', () => {
  beforeEach(() => {
    prismaMock.sport.findMany.mockResolvedValue([{ id: 1, name: 'Orienteering' }]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('maps nested ORIS discipline short names to internal event discipline values', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            Method: 'getEvent',
            Format: 'json',
            Status: 'OK',
            ExportCreated: '2026-04-01 08:23:43',
            Data: {
              ID: '8835',
              Name: 'Oblastni zebricek',
              Date: '2025-10-11',
              Place: 'Dvorisko',
              Org1: {
                ID: '47',
                Abbr: 'CHC',
                Name: 'K.O.B. Chocen',
              },
              Sport: {
                ID: '1',
                NameCZ: 'OB',
                NameEN: 'Foot O',
              },
              Discipline: {
                ID: '2',
                ShortName: 'MD',
                NameCZ: 'Stredni trat',
                NameEN: 'Middle distance',
              },
              Ranking: '1',
              RankingKoef: '1,00',
              RankingKS: '0',
              StartTime: '10:00',
            },
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      ),
    );

    const preview = await loadExternalEventPreview({
      provider: 'ORIS',
      externalEventId: '8835',
    });

    expect(preview.externalEventId).toBe('8835');
    expect(preview.sportId).toBe(1);
    expect(preview.ranking).toBe(true);
    expect(preview.coefRanking).toBe(1);
    expect(preview.zeroTime).toBe('10:00:00');
    expect(preview.organizer).toBe('K.O.B. Chocen');
    expect(preview.discipline).toBe('MIDDLE');
  });

  it('loads ORIS event candidates in date-range chunks and merges duplicate events', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            Data: {
              Event_1: {
                ID: '6302',
                Name: 'Ranking event',
                Date: '2026-01-15',
                Ranking: '1',
                Discipline: {
                  ShortName: 'MD',
                },
              },
            },
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            Data: {
              Event_1: {
                ID: '6302',
                Name: 'Ranking event',
                Date: '2026-01-15',
                Ranking: '1',
                Discipline: {
                  ShortName: 'MD',
                },
              },
              Event_2: {
                ID: '6400',
                Name: 'Sprint event',
                Date: '2026-04-10',
                Ranking: '1',
                Discipline: {
                  ShortName: 'SP',
                },
              },
            },
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      );

    vi.stubGlobal('fetch', fetchMock);

    const candidates = await loadOrisEventCandidatesByDateRange({
      dateFrom: '2026-01-01',
      dateTo: '2026-04-15',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0].toString()).toContain('datefrom=2026-01-01');
    expect(fetchMock.mock.calls[0]?.[0].toString()).toContain('dateto=2026-03-31');
    expect(fetchMock.mock.calls[1]?.[0].toString()).toContain('datefrom=2026-04-01');
    expect(fetchMock.mock.calls[1]?.[0].toString()).toContain('dateto=2026-04-15');
    expect(candidates).toEqual([
      expect.objectContaining({
        externalEventId: '6302',
        discipline: 'MIDDLE',
        ranking: true,
      }),
      expect.objectContaining({
        externalEventId: '6400',
        discipline: 'SPRINT',
        ranking: true,
      }),
    ]);
  });
});
