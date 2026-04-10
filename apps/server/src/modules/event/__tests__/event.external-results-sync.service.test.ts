import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AppPrismaClient } from '../../../db/prisma-client.js';
import { ExternalImportError } from '../event.import.service.js';
import { syncOfficialResultsForEvent } from '../event.external-results-sync.service.js';

type MockPrisma = Pick<AppPrismaClient, 'event' | 'eventExternalResultsSyncState'>;

function createPrismaMock(overrides?: {
  eventFindUnique?: ReturnType<typeof vi.fn>;
  eventUpdate?: ReturnType<typeof vi.fn>;
  syncUpsert?: ReturnType<typeof vi.fn>;
}): MockPrisma {
  return {
    event: {
      findUnique: overrides?.eventFindUnique ?? vi.fn(),
      update: overrides?.eventUpdate ?? vi.fn(),
    },
    eventExternalResultsSyncState: {
      upsert: overrides?.syncUpsert ?? vi.fn(),
    },
  } as unknown as MockPrisma;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('event.external-results-sync.service', () => {
  it('marks ORIS results as official and stores sync timestamps', async () => {
    const now = new Date('2026-04-09T10:00:00.000Z');
    const prisma = createPrismaMock({
      eventFindUnique: vi.fn().mockResolvedValue({
        id: 'evt_oris',
        externalSource: 'ORIS',
        externalEventId: '9666',
        resultsOfficialAt: null,
        externalResultsSync: null,
      }),
      eventUpdate: vi.fn().mockResolvedValue({}),
      syncUpsert: vi.fn().mockResolvedValue({}),
    });
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ Data: { Results: [{ Name: 'A', Time: 123 }] } }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      }),
    );

    vi.stubGlobal('fetch', fetchSpy);

    const result = await syncOfficialResultsForEvent(prisma as AppPrismaClient, {
      eventId: 'evt_oris',
      now,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('method=getEventResults'),
      expect.objectContaining({
        method: 'GET',
      }),
    );
    expect(prisma.event.update).toHaveBeenCalledWith({
      where: {
        id: 'evt_oris',
      },
      data: {
        resultsOfficialAt: now,
      },
    });
    expect(prisma.eventExternalResultsSyncState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          lastCheckedAt: now,
          lastSuccessfulCheckAt: now,
          lastDetectedOfficialAt: now,
          lastStatus: 'OFFICIAL',
          lastError: null,
        }),
      }),
    );
    expect(result).toMatchObject({
      provider: 'ORIS',
      status: 'OFFICIAL',
      officialResultsDetected: true,
      resultsOfficialAt: now,
      lastCheckedAt: now,
      lastSuccessfulCheckAt: now,
      lastDetectedOfficialAt: now,
      officialResultsUrl: 'https://oris.ceskyorientak.cz/Vysledky?id=9666',
    });
  });

  it('returns not found when ORIS reports no results yet', async () => {
    const now = new Date('2026-04-09T10:00:00.000Z');
    const prisma = createPrismaMock({
      eventFindUnique: vi.fn().mockResolvedValue({
        id: 'evt_oris_empty',
        externalSource: 'ORIS',
        externalEventId: '9666',
        resultsOfficialAt: null,
        externalResultsSync: null,
      }),
      eventUpdate: vi.fn().mockResolvedValue({}),
      syncUpsert: vi.fn().mockResolvedValue({}),
    });
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          Method: 'getEventResults',
          Format: 'json',
          Status: 'OK',
          Data: [],
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
    );

    vi.stubGlobal('fetch', fetchSpy);

    const result = await syncOfficialResultsForEvent(prisma as AppPrismaClient, {
      eventId: 'evt_oris_empty',
      now,
    });

    expect(result).toMatchObject({
      provider: 'ORIS',
      status: 'NOT_FOUND',
      officialResultsDetected: false,
      resultsOfficialAt: null,
      lastCheckedAt: now,
      lastSuccessfulCheckAt: now,
      lastDetectedOfficialAt: null,
    });
    expect(prisma.event.update).not.toHaveBeenCalled();
    expect(prisma.eventExternalResultsSyncState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          lastStatus: 'NOT_FOUND',
          lastSuccessfulCheckAt: now,
          lastError: null,
        }),
      }),
    );
  });

  it('returns not found when Eventor does not expose person results yet', async () => {
    const now = new Date('2026-04-09T10:00:00.000Z');
    const lastDetectedOfficialAt = new Date('2026-04-08T09:00:00.000Z');
    const prisma = createPrismaMock({
      eventFindUnique: vi.fn().mockResolvedValue({
        id: 'evt_eventor',
        externalSource: 'EVENTOR',
        externalEventId: '8726',
        resultsOfficialAt: null,
        externalResultsSync: {
          lastDetectedOfficialAt,
          lastSuccessfulCheckAt: new Date('2026-04-08T08:00:00.000Z'),
        },
      }),
      eventUpdate: vi.fn().mockResolvedValue({}),
      syncUpsert: vi.fn().mockResolvedValue({}),
    });
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ResultList: {
            ClassResult: [{ Class: { Name: 'D21' } }],
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

    vi.stubGlobal('fetch', fetchSpy);

    const result = await syncOfficialResultsForEvent(prisma as AppPrismaClient, {
      eventId: 'evt_eventor',
      apiKey: 'eventor-secret',
      now,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/results/event?eventId=8726'),
      expect.objectContaining({
        headers: expect.objectContaining({
          ApiKey: 'eventor-secret',
          'Api-Key': 'eventor-secret',
        }),
      }),
    );
    expect(prisma.event.update).not.toHaveBeenCalled();
    expect(prisma.eventExternalResultsSyncState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          lastStatus: 'NOT_FOUND',
          lastDetectedOfficialAt,
          lastSuccessfulCheckAt: now,
          lastError: null,
        }),
      }),
    );
    expect(result).toMatchObject({
      provider: 'EVENTOR',
      status: 'NOT_FOUND',
      officialResultsDetected: false,
      lastCheckedAt: now,
      lastSuccessfulCheckAt: now,
      lastDetectedOfficialAt,
      resultsOfficialAt: null,
      officialResultsUrl:
        'https://eventor.orienteering.sport/Events/ResultList?eventId=8726&groupBy=EventClass',
    });
  });

  it('stores provider errors into sync state and keeps the last successful check timestamp', async () => {
    const now = new Date('2026-04-09T10:00:00.000Z');
    const lastSuccessfulCheckAt = new Date('2026-04-08T09:30:00.000Z');
    const prisma = createPrismaMock({
      eventFindUnique: vi.fn().mockResolvedValue({
        id: 'evt_error',
        externalSource: 'ORIS',
        externalEventId: '9666',
        resultsOfficialAt: null,
        externalResultsSync: {
          lastDetectedOfficialAt: null,
          lastSuccessfulCheckAt,
        },
      }),
      eventUpdate: vi.fn().mockResolvedValue({}),
      syncUpsert: vi.fn().mockResolvedValue({}),
    });
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('upstream unavailable', {
        status: 503,
      }),
    );

    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      syncOfficialResultsForEvent(prisma as AppPrismaClient, {
        eventId: 'evt_error',
        now,
      }),
    ).rejects.toBeInstanceOf(ExternalImportError);

    expect(prisma.event.update).not.toHaveBeenCalled();
    expect(prisma.eventExternalResultsSyncState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          lastCheckedAt: now,
          lastSuccessfulCheckAt,
          lastStatus: 'ERROR',
          lastError: 'External provider is currently unavailable.',
        }),
      }),
    );
  });

  it('treats invalid ORIS event ids as not found and surfaces a 404 error', async () => {
    const now = new Date('2026-04-09T10:00:00.000Z');
    const lastSuccessfulCheckAt = new Date('2026-04-08T09:30:00.000Z');
    const prisma = createPrismaMock({
      eventFindUnique: vi.fn().mockResolvedValue({
        id: 'evt_invalid_oris',
        externalSource: 'ORIS',
        externalEventId: '999999',
        resultsOfficialAt: null,
        externalResultsSync: {
          lastDetectedOfficialAt: null,
          lastSuccessfulCheckAt,
        },
      }),
      eventUpdate: vi.fn().mockResolvedValue({}),
      syncUpsert: vi.fn().mockResolvedValue({}),
    });
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          Method: 'getEventResults',
          Format: 'json',
          Status: 'ID not valid',
          Data: [],
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
    );

    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      syncOfficialResultsForEvent(prisma as AppPrismaClient, {
        eventId: 'evt_invalid_oris',
        now,
      }),
    ).rejects.toMatchObject({
      message: 'External event was not found.',
      statusCode: 404,
    });

    expect(prisma.event.update).not.toHaveBeenCalled();
    expect(prisma.eventExternalResultsSyncState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          lastCheckedAt: now,
          lastSuccessfulCheckAt,
          lastStatus: 'NOT_FOUND',
          lastError: 'External event was not found.',
        }),
      }),
    );
  });
});
