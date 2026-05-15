import { describe, expect, it, vi } from 'vitest';

import { findOrganisationNamesByEvent } from '../competitor.service.js';

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
