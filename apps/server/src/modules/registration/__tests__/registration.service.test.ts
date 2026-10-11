import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, loggerMock } = vi.hoisted(() => ({
  prismaMock: {
    club: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async (_args: { data: unknown[] }) => ({ count: 0 })),
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    },
    registration: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async (_args: { data: unknown[] }) => ({ count: 0 })),
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    },
    registrationSyncState: {
      upsert: vi.fn(async (_args: { create: unknown; update: unknown }) => ({})),
      findMany: vi.fn(async () => []),
    },
    clubSyncState: {
      upsert: vi.fn(async (_args: { create: unknown; update: unknown }) => ({})),
      findUnique: vi.fn(async () => null),
    },
    $transaction: vi.fn(async (steps: unknown[]) => Promise.all(steps as Promise<unknown>[])),
  },
  loggerMock: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  },
}));

vi.mock('../../../utils/context.js', () => ({ default: prismaMock }));
vi.mock('../../../lib/logging.js', () => ({ logger: loggerMock }));

import {
  ensureClubsSynchronized,
  ensureRegistrationsSynchronized,
  getClubSyncState,
  getRegistrationSyncStates,
  listClubsPaged,
  listRegistrationsPaged,
  lookupByCard,
  lookupByRegistration,
  resetRegistrationSyncStateForTesting,
  runClubSync,
  runRegistrationSync,
  searchClubs,
  syncClubsFromOris,
  syncRegistrationsFromOris,
} from '../registration.service.js';

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const CLUB_ROW = {
  id: 1,
  source: 'ORIS',
  externalId: '1',
  name: 'KOB ALFA Brno',
  abbr: 'ABM',
  region: 'Jihomoravská',
  syncedAt: new Date('2026-07-01T00:00:00.000Z'),
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
  updatedAt: new Date('2026-07-01T00:00:00.000Z'),
};

const REGISTRATION_ROW = {
  id: 1,
  source: 'ORIS',
  externalId: '33',
  registration: 'ABM6707',
  firstname: 'Libor',
  lastname: 'Adamek',
  birthYear: 1967,
  license: 'C',
  gender: 'M',
  clubId: 1,
  club: CLUB_ROW,
  card: 207849,
  sport: 'OB',
  year: 2026,
  syncedAt: new Date('2026-07-01T00:00:00.000Z'),
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
  updatedAt: new Date('2026-07-01T00:00:00.000Z'),
};

describe('registration.service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetRegistrationSyncStateForTesting();
    prismaMock.club.deleteMany.mockClear();
    prismaMock.club.createMany.mockClear();
    prismaMock.club.findFirst.mockClear().mockResolvedValue(null);
    prismaMock.club.findMany.mockClear().mockResolvedValue([]);
    prismaMock.club.count.mockClear().mockResolvedValue(0);
    prismaMock.registration.deleteMany.mockClear();
    prismaMock.registration.createMany.mockClear();
    prismaMock.registration.findFirst.mockClear().mockResolvedValue(null);
    prismaMock.registration.findMany.mockClear().mockResolvedValue([]);
    prismaMock.registration.count.mockClear().mockResolvedValue(0);
    prismaMock.registrationSyncState.upsert.mockClear();
    prismaMock.registrationSyncState.findMany.mockClear().mockResolvedValue([]);
    prismaMock.clubSyncState.upsert.mockClear();
    prismaMock.clubSyncState.findUnique.mockClear().mockResolvedValue(null);
    prismaMock.$transaction.mockClear();
    loggerMock.warn.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('syncClubsFromOris', () => {
    it('maps ORIS getCSOSClubList into Club rows and replaces the cache', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({
          Data: {
            ABM: { ID: '1', Name: 'KOB ALFA Brno', Abbr: 'ABM', Region: 'Jihomoravská' },
            XYZ: { ID: '2', Name: 'No Region Club', Abbr: 'XYZ' },
            BAD: { ID: '', Name: '', Abbr: '' },
          },
        }),
      );

      const count = await syncClubsFromOris();

      expect(count).toBe(2);
      expect(prismaMock.club.deleteMany).toHaveBeenCalledWith({ where: { source: 'ORIS' } });
      const created = prismaMock.club.createMany.mock.calls[0][0].data;
      expect(created).toEqual([
        expect.objectContaining({
          externalId: '1',
          name: 'KOB ALFA Brno',
          abbr: 'ABM',
          region: 'Jihomoravská',
        }),
        expect.objectContaining({
          externalId: '2',
          name: 'No Region Club',
          abbr: 'XYZ',
          region: null,
        }),
      ]);
    });
  });

  describe('syncRegistrationsFromOris', () => {
    it('maps ORIS getRegistration fields, resolving the internal club id from the local cache', async () => {
      prismaMock.club.findMany.mockResolvedValue([{ id: 1, externalId: '1' }]);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({
          Data: {
            Reg_1: {
              RegNo: 'ABM6707',
              UserID: '33',
              Lic: 'C',
              FirstName: 'Libor',
              LastName: 'Adámek',
              SI: '207849',
              ClubID: '1',
              Gender: 'M',
              Born: '67',
            },
          },
        }),
      );

      const count = await syncRegistrationsFromOris({ sport: 'OB', year: 2026 });

      expect(count).toBe(1);
      expect(prismaMock.registration.deleteMany).toHaveBeenCalledWith({
        where: { source: 'ORIS', sport: 'OB', year: 2026 },
      });
      const created = prismaMock.registration.createMany.mock.calls[0][0].data;
      expect(created).toEqual([
        expect.objectContaining({
          registration: 'ABM6707',
          externalId: '33',
          firstname: 'Libor',
          lastname: 'Adámek',
          license: 'C',
          card: 207849,
          clubId: 1,
          gender: 'M',
          birthYear: 1967,
          sport: 'OB',
          year: 2026,
        }),
      ]);
    });

    it('leaves clubId null when the club is not yet in the local cache', async () => {
      prismaMock.club.findMany.mockResolvedValue([]);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({
          Data: {
            Reg_1: {
              RegNo: 'ABM6751',
              UserID: '99',
              FirstName: 'Jana',
              LastName: 'Nova',
              ClubID: '1',
            },
          },
        }),
      );

      await syncRegistrationsFromOris({ sport: 'OB', year: 2026 });

      const created = prismaMock.registration.createMany.mock.calls[0][0].data;
      // Sequence 51 -> female per Czech convention; Born absent -> derived from RegNo (67 -> 1967).
      expect(created[0]).toMatchObject({ gender: 'F', birthYear: 1967, clubId: null });
    });

    it('skips malformed records missing required fields', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({
          Data: {
            Reg_1: { RegNo: 'ABM6707' }, // missing UserID/FirstName/LastName
          },
        }),
      );

      const count = await syncRegistrationsFromOris({ sport: 'OB', year: 2026 });
      expect(count).toBe(0);
    });
  });

  describe('ensureClubsSynchronized / ensureRegistrationsSynchronized', () => {
    it('skips the sync when a recent copy already exists', async () => {
      prismaMock.club.findFirst.mockResolvedValue({ syncedAt: new Date() });
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const didSync = await ensureClubsSynchronized({ now: new Date() });

      expect(didSync).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('applies a cooldown after a sync failure and skips retrying within it', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

      await expect(ensureClubsSynchronized({ now: new Date() })).rejects.toThrow('network down');
      expect(loggerMock.warn).toHaveBeenCalledWith(
        'Club ORIS sync failed and cooldown was applied',
        expect.objectContaining({ failureReason: 'network down' }),
      );

      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const didSync = await ensureClubsSynchronized({ now: new Date() });
      expect(didSync).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('deduplicates concurrent callers onto a single in-flight sync', async () => {
      let resolveFetch: (value: Response) => void = () => undefined;
      const pending = new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValue(pending as never);

      const first = ensureClubsSynchronized({ now: new Date() });
      const second = ensureClubsSynchronized({ now: new Date() });

      resolveFetch(jsonResponse({ Data: {} }));
      await Promise.all([first, second]);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('syncs clubs before registrations so the club relation resolves', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          jsonResponse({ Data: { ABM: { ID: '1', Name: 'KOB ALFA Brno', Abbr: 'ABM' } } }),
        )
        .mockResolvedValueOnce(jsonResponse({ Data: {} }));

      await ensureRegistrationsSynchronized({ sport: 'OB', year: 2026, now: new Date() });

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const firstCallUrl = fetchSpy.mock.calls[0][0] as URL;
      expect(String(firstCallUrl)).toContain('method=getCSOSClubList');
    });
  });

  describe('lookupByRegistration / lookupByCard / searchClubs', () => {
    it('maps a registration row to the public shape, including the SI card for a registration-code lookup', async () => {
      prismaMock.registration.findMany.mockResolvedValue([REGISTRATION_ROW]);

      const items = await lookupByRegistration('ABM6707', { sport: 'OB', year: 2026 });

      expect(prismaMock.registration.findMany).toHaveBeenCalledWith({
        where: { source: 'ORIS', registration: 'ABM6707', sport: 'OB', year: 2026 },
        include: { club: true },
      });
      expect(items).toEqual([
        {
          source: 'ORIS',
          externalId: '33',
          registration: 'ABM6707',
          firstname: 'Libor',
          lastname: 'Adamek',
          birthYear: 1967,
          license: 'C',
          organisation: 'KOB ALFA Brno',
          gender: 'M',
          card: 207849,
        },
      ]);
    });

    it('looks up by SI card number but never echoes the card back', async () => {
      prismaMock.registration.findMany.mockResolvedValue([REGISTRATION_ROW]);

      const items = await lookupByCard(207849, { sport: 'OB', year: 2026 });

      expect(prismaMock.registration.findMany).toHaveBeenCalledWith({
        where: { source: 'ORIS', card: 207849, sport: 'OB', year: 2026 },
        include: { club: true },
      });
      expect(items[0]).toMatchObject({ registration: 'ABM6707', card: null });
    });

    it('filters registration lookups by the requested source', async () => {
      prismaMock.registration.findMany.mockResolvedValue([]);

      await lookupByRegistration('ABM6707', { source: 'EVENTOR', sport: 'OB', year: 2026 });

      expect(prismaMock.registration.findMany).toHaveBeenCalledWith({
        where: { source: 'EVENTOR', registration: 'ABM6707', sport: 'OB', year: 2026 },
        include: { club: true },
      });
    });

    it('searches clubs by free text and maps to the public shape', async () => {
      prismaMock.club.findMany.mockResolvedValue([CLUB_ROW]);

      const items = await searchClubs('alfa', 50);

      expect(prismaMock.club.findMany).toHaveBeenCalledWith({
        where: { OR: [{ name: { contains: 'alfa' } }, { abbr: { contains: 'alfa' } }] },
        orderBy: { name: 'asc' },
        take: 50,
      });
      expect(items).toEqual([
        {
          source: 'ORIS',
          externalId: '1',
          name: 'KOB ALFA Brno',
          abbr: 'ABM',
          region: 'Jihomoravská',
        },
      ]);
    });

    it('returns the full club list when no query is given', async () => {
      prismaMock.club.findMany.mockResolvedValue([CLUB_ROW]);

      await searchClubs(undefined, 50);

      expect(prismaMock.club.findMany).toHaveBeenCalledWith({
        where: undefined,
        orderBy: { name: 'asc' },
        take: 50,
      });
    });
  });

  describe('runRegistrationSync / runClubSync', () => {
    it('persists a SUCCESS state with the record count on success', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ Data: {} }));

      const count = await runRegistrationSync({ sport: 'OB', year: 2026 });

      expect(count).toBe(0);
      expect(prismaMock.registrationSyncState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { source_sport_year: { source: 'ORIS', sport: 'OB', year: 2026 } },
          update: expect.objectContaining({
            lastStatus: 'SUCCESS',
            lastError: null,
            recordCount: 0,
          }),
        }),
      );
    });

    it('persists an ERROR state and rethrows on failure, without touching lastSuccessfulSyncAt', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ORIS down'));

      await expect(runRegistrationSync({ sport: 'OB', year: 2026 })).rejects.toThrow('ORIS down');

      const call = prismaMock.registrationSyncState.upsert.mock.calls[0][0];
      expect(call.update).toEqual({
        lastCheckedAt: expect.any(Date),
        lastStatus: 'ERROR',
        lastError: 'ORIS down',
      });
      expect(call.update).not.toHaveProperty('lastSuccessfulSyncAt');
    });

    it('persists club sync SUCCESS/ERROR state via the source-keyed upsert', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ Data: {} }));

      await runClubSync();

      expect(prismaMock.clubSyncState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { source: 'ORIS' },
          update: expect.objectContaining({ lastStatus: 'SUCCESS', recordCount: 0 }),
        }),
      );
    });
  });

  describe('admin reads: sync states and paginated lists', () => {
    it('lists registration sync states newest first', async () => {
      const row = {
        source: 'ORIS',
        sport: 'OB',
        year: 2026,
        lastCheckedAt: new Date(),
        lastSuccessfulSyncAt: new Date(),
        lastStatus: 'SUCCESS',
        lastError: null,
        recordCount: 11850,
      };
      prismaMock.registrationSyncState.findMany.mockResolvedValue([row]);

      const states = await getRegistrationSyncStates();

      expect(prismaMock.registrationSyncState.findMany).toHaveBeenCalledWith({
        orderBy: { updatedAt: 'desc' },
      });
      expect(states).toEqual([row]);
    });

    it('returns null club sync state when a sync has never been attempted', async () => {
      expect(await getClubSyncState()).toBeNull();
    });

    it('paginates registrations and includes the club-resolved organisation name', async () => {
      prismaMock.registration.count.mockResolvedValue(1);
      prismaMock.registration.findMany.mockResolvedValue([REGISTRATION_ROW]);

      const { total, items } = await listRegistrationsPaged({ page: 1, limit: 25 });

      expect(total).toBe(1);
      expect(items[0]).toMatchObject({
        registration: 'ABM6707',
        organisation: 'KOB ALFA Brno',
        card: 207849,
      });
    });

    it('filters registrations by free text across registration/firstname/lastname', async () => {
      await listRegistrationsPaged({ page: 1, limit: 25, q: 'libor' });

      expect(prismaMock.registration.count).toHaveBeenCalledWith({
        where: {
          OR: [
            { registration: { contains: 'LIBOR' } },
            { firstname: { contains: 'libor' } },
            { lastname: { contains: 'libor' } },
          ],
        },
      });
    });

    it('paginates clubs', async () => {
      prismaMock.club.count.mockResolvedValue(1);
      prismaMock.club.findMany.mockResolvedValue([CLUB_ROW]);

      const { total, items } = await listClubsPaged({ page: 1, limit: 25 });

      expect(total).toBe(1);
      expect(items[0]).toMatchObject({ name: 'KOB ALFA Brno', abbr: 'ABM' });
    });
  });
});
