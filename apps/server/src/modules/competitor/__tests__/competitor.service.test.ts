import { describe, expect, it, vi } from 'vitest';

import {
  findCompetitorsByCard,
  findCompetitorsByRegistration,
  findOrganisationNamesByEvent,
  findResultFeedByEvent,
} from '../competitor.service.js';

describe('findResultFeedByEvent', () => {
  it('returns a complete snapshot even above 2500 results, preserving the GraphQL selection', async () => {
    const results = Array.from({ length: 2501 }, (_, id) => ({ id, status: 'OK' }));
    const prisma = {
      competitor: {
        findMany: vi.fn(async (args: { take?: number }) =>
          results.slice(0, args.take ?? results.length),
        ),
      },
    };
    const query = { include: { class: true } };

    const feed = await findResultFeedByEvent(prisma as never, 'event-1', query);

    expect(feed).toHaveLength(2501);
    expect(feed).toContainEqual(results[2500]);
    expect(prisma.competitor.findMany).toHaveBeenCalledWith({
      ...query,
      where: {
        class: { is: { eventId: 'event-1' } },
        status: { in: expect.arrayContaining(['OK', 'Finished', 'Disqualified']) },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
  });
});

describe('findOrganisationNamesByEvent', () => {
  it('returns organisation country fields normalized to alpha-2 codes', async () => {
    const prisma = {
      competitor: {
        groupBy: vi.fn().mockResolvedValue([
          {
            organisationId: 2481,
            _count: { organisationId: 3 },
          },
        ]),
      },
      organisation: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 2481,
            name: 'Klub OB Sokol Pezinok',
            nationality: 'SVK',
          },
        ]),
      },
      country: {
        findMany: vi.fn().mockResolvedValue([
          {
            countryCode: 'SK',
            countryName: 'Slovakia',
          },
        ]),
      },
    };

    await expect(
      findOrganisationNamesByEvent(prisma as never, { eventId: 'event-1' }),
    ).resolves.toEqual([
      {
        id: 2481,
        name: 'Klub OB Sokol Pezinok',
        countryCode: 'SK',
        country: 'Slovakia',
        competitors: 3,
      },
    ]);

    expect(prisma.country.findMany).toHaveBeenCalledWith({
      where: { countryCode: { in: ['SK'] } },
      select: { countryCode: true, countryName: true },
    });
  });
});

describe('findCompetitorsByCard', () => {
  it('filters competitors by SI card number within the requested event', async () => {
    const prisma = {
      competitor: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const query = {
      include: {
        class: true,
      },
    };

    await findCompetitorsByCard(
      prisma as never,
      { eventId: 'event-1', card: 8123456 },
      query,
    );

    expect(prisma.competitor.findMany).toHaveBeenCalledWith({
      ...query,
      where: {
        card: 8123456,
        class: { is: { eventId: 'event-1' } },
      },
      orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }, { id: 'asc' }],
    });
  });
});

describe('findCompetitorsByRegistration', () => {
  it('filters competitors by registration within the requested event', async () => {
    const prisma = {
      competitor: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const query = {
      include: {
        class: true,
      },
    };

    await findCompetitorsByRegistration(
      prisma as never,
      { eventId: 'event-1', registration: 'ABC9955' },
      query,
    );

    expect(prisma.competitor.findMany).toHaveBeenCalledWith({
      ...query,
      where: {
        registration: 'ABC9955',
        class: { is: { eventId: 'event-1' } },
      },
      orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }, { id: 'asc' }],
    });
  });
});
