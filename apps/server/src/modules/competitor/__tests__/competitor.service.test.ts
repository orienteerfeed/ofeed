import { describe, expect, it, vi } from 'vitest';

import {
  findCompetitorsByCard,
  findCompetitorsByRegistration,
  findOrganisationNamesByEvent,
} from '../competitor.service.js';

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
