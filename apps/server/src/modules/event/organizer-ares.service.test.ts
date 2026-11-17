import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchAresOrganizer,
  lookupAresOrganizer,
  mapAresOrganizer,
  searchAresOrganizers,
  verifyAresOrganizer,
} from './organizer-ares.service.js';
const subject = {
  ico: '12345678',
  obchodniJmeno: 'Test club',
  dic: 'CZ12345678',
  sidlo: {
    nazevUlice: 'Hlavní',
    cisloDomovni: 10,
    cisloOrientacni: 2,
    cisloOrientacniPismeno: 'a',
    nazevObce: 'Praha',
    psc: 11000,
    nazevStatu: 'Česká republika',
  },
};
const fetchMock = vi.fn();
const prisma = {
  user: { findUnique: vi.fn().mockResolvedValue({ role: 'USER' }) },
  event: { findUnique: vi.fn().mockResolvedValue({ authorId: 7 }) },
} as unknown as Parameters<typeof searchAresOrganizers>[0];
const auth = { isAuthenticated: true, type: 'jwt' as const, userId: 7 };
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
const respond = (body: unknown, status = 200) =>
  fetchMock.mockResolvedValue({ ok: status === 200, status, json: async () => body });
describe('ARES organizer lookup', () => {
  it('maps the complete address and preserves an absent VAT ID without inventing one', () => {
    expect(mapAresOrganizer(subject)).toEqual({
      name: 'Test club',
      companyId: '12345678',
      vatId: 'CZ12345678',
      street: 'Hlavní 10/2a',
      city: 'Praha',
      postalCode: '11000',
      country: 'CZ',
    });
    expect(
      mapAresOrganizer({
        ...subject,
        dic: undefined,
        sidlo: { nazevObce: 'Lhota', cisloDomovni: 4 },
      }),
    ).toMatchObject({ street: 'Lhota 4', vatId: '', postalCode: '', country: '' });
  });
  it('authorizes searches and detail requests before contacting ARES', async () => {
    await expect(
      searchAresOrganizers(prisma, { isAuthenticated: false }, 'race', 'Test'),
    ).rejects.toThrow();
    await expect(
      lookupAresOrganizer(prisma, { ...auth, userId: 8 }, 'race', '12345678'),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('bounds the search and validates queries and company IDs', async () => {
    respond({ ekonomickeSubjekty: [subject] });
    expect(await searchAresOrganizers(prisma, auth, 'race', ' Test ')).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/vyhledat'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ obchodniJmeno: 'Test', start: 0, pocet: 10 }),
        signal: expect.any(AbortSignal),
      }),
    );
    fetchMock.mockClear();
    await expect(searchAresOrganizers(prisma, auth, 'race', 'ab')).rejects.toThrow();
    await expect(fetchAresOrganizer('../bad')).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('distinguishes missing records from provider failures', async () => {
    respond(null, 404);
    expect(await fetchAresOrganizer('12345678')).toBeNull();
    respond({}, 503);
    await expect(fetchAresOrganizer('12345678')).rejects.toThrow('unavailable');
    fetchMock.mockRejectedValue(new DOMException('Timed out', 'TimeoutError'));
    await expect(fetchAresOrganizer('12345678')).rejects.toThrow('Timed out');
  });
  it('returns an empty list for no matches', async () => {
    respond({ ekonomickeSubjekty: [] });
    expect(await searchAresOrganizers(prisma, auth, 'race', 'Nobody')).toEqual([]);
  });
  it('verifies all billing fields and discards forged verification on mismatch or outage', async () => {
    const organizer = mapAresOrganizer(subject);
    respond(subject);
    expect(await verifyAresOrganizer(organizer)).toMatchObject({
      aresVerifiedAt: expect.any(String),
    });
    expect(
      await verifyAresOrganizer({
        ...organizer,
        street: 'Other 1',
        aresVerifiedAt: new Date().toISOString(),
      }),
    ).not.toHaveProperty('aresVerifiedAt');
    fetchMock.mockRejectedValue(new Error('Offline'));
    expect(
      await verifyAresOrganizer({ ...organizer, aresVerifiedAt: new Date().toISOString() }),
    ).toEqual(organizer);
  });
});
