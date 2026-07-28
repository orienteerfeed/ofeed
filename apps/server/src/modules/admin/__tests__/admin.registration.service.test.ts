import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getRegistrationSyncStatesMock,
  getClubSyncStateMock,
  listRegistrationsPagedMock,
  listClubsPagedMock,
  runRegistrationSyncMock,
  runClubSyncMock,
} = vi.hoisted(() => ({
  getRegistrationSyncStatesMock: vi.fn(),
  getClubSyncStateMock: vi.fn(),
  listRegistrationsPagedMock: vi.fn(),
  listClubsPagedMock: vi.fn(),
  runRegistrationSyncMock: vi.fn(),
  runClubSyncMock: vi.fn(),
}));

vi.mock('../../registration/registration.service.js', () => ({
  getRegistrationSyncStates: getRegistrationSyncStatesMock,
  getClubSyncState: getClubSyncStateMock,
  listRegistrationsPaged: listRegistrationsPagedMock,
  listClubsPaged: listClubsPagedMock,
  runRegistrationSync: runRegistrationSyncMock,
  runClubSync: runClubSyncMock,
}));

import {
  getAdminClubs,
  getAdminRegistrations,
  getAdminRegistrationSyncStatus,
  triggerAdminRegistrationSync,
} from '../admin.registration.service.js';

const REGISTRATION_SYNC_STATE = {
  source: 'ORIS' as const,
  sport: 'OB' as const,
  year: 2026,
  lastCheckedAt: new Date('2026-07-01T00:00:00.000Z'),
  lastSuccessfulSyncAt: new Date('2026-07-01T00:00:00.000Z'),
  lastStatus: 'SUCCESS' as const,
  lastError: null,
  recordCount: 11850,
};

const CLUB_SYNC_STATE = {
  source: 'ORIS' as const,
  lastCheckedAt: new Date('2026-07-01T00:00:00.000Z'),
  lastSuccessfulSyncAt: new Date('2026-07-01T00:00:00.000Z'),
  lastStatus: 'SUCCESS' as const,
  lastError: null,
  recordCount: 218,
};

describe('admin registration service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('combines registration and club sync state into one status payload', async () => {
    getRegistrationSyncStatesMock.mockResolvedValue([REGISTRATION_SYNC_STATE]);
    getClubSyncStateMock.mockResolvedValue(CLUB_SYNC_STATE);

    const status = await getAdminRegistrationSyncStatus();

    expect(status).toEqual({
      registrations: [REGISTRATION_SYNC_STATE],
      clubs: CLUB_SYNC_STATE,
    });
  });

  it('reports clubs as null when a club sync has never been attempted', async () => {
    getRegistrationSyncStatesMock.mockResolvedValue([]);
    getClubSyncStateMock.mockResolvedValue(null);

    const status = await getAdminRegistrationSyncStatus();

    expect(status.clubs).toBeNull();
  });

  it('delegates paginated registrations listing and validates the shape', async () => {
    listRegistrationsPagedMock.mockResolvedValue({
      total: 1,
      items: [
        {
          id: 1,
          source: 'ORIS',
          registration: 'ABM6707',
          firstname: 'Libor',
          lastname: 'Adamek',
          birthYear: 1967,
          license: 'C',
          gender: 'M',
          organisation: 'KOB ALFA Brno',
          card: 207849,
          sport: 'OB',
          year: 2026,
          syncedAt: new Date(),
        },
      ],
    });

    const result = await getAdminRegistrations({ page: 1, limit: 25 });

    expect(listRegistrationsPagedMock).toHaveBeenCalledWith({ page: 1, limit: 25 });
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({ registration: 'ABM6707' });
  });

  it('delegates paginated club listing and validates the shape', async () => {
    listClubsPagedMock.mockResolvedValue({
      total: 1,
      items: [
        {
          id: 1,
          source: 'ORIS',
          externalId: '1',
          name: 'KOB ALFA Brno',
          abbr: 'ABM',
          region: null,
          syncedAt: new Date(),
        },
      ],
    });

    const result = await getAdminClubs({ page: 1, limit: 25, q: 'alfa' });

    expect(listClubsPagedMock).toHaveBeenCalledWith({ page: 1, limit: 25, q: 'alfa' });
    expect(result.total).toBe(1);
  });

  describe('triggerAdminRegistrationSync', () => {
    it('syncs clubs first, then registrations, for scope ALL', async () => {
      runClubSyncMock.mockResolvedValue(218);
      runRegistrationSyncMock.mockResolvedValue(11850);

      const result = await triggerAdminRegistrationSync({ scope: 'ALL', sport: 'OB', year: 2026 });

      expect(runClubSyncMock).toHaveBeenCalledTimes(1);
      expect(runRegistrationSyncMock).toHaveBeenCalledWith({ sport: 'OB', year: 2026 });
      expect(result).toMatchObject({
        scope: 'ALL',
        sport: 'OB',
        year: 2026,
        registrationsSynced: 11850,
        clubsSynced: 218,
      });
    });

    it('only syncs registrations for scope REGISTRATIONS', async () => {
      runRegistrationSyncMock.mockResolvedValue(11850);

      const result = await triggerAdminRegistrationSync({
        scope: 'REGISTRATIONS',
        sport: 'OB',
        year: 2026,
      });

      expect(runClubSyncMock).not.toHaveBeenCalled();
      expect(result.clubsSynced).toBeNull();
      expect(result.registrationsSynced).toBe(11850);
    });

    it('only syncs clubs for scope CLUBS', async () => {
      runClubSyncMock.mockResolvedValue(218);

      const result = await triggerAdminRegistrationSync({ scope: 'CLUBS', sport: 'OB', year: 2026 });

      expect(runRegistrationSyncMock).not.toHaveBeenCalled();
      expect(result.registrationsSynced).toBeNull();
      expect(result.clubsSynced).toBe(218);
    });

    it('defaults year to the current year when not provided', async () => {
      runClubSyncMock.mockResolvedValue(0);
      runRegistrationSyncMock.mockResolvedValue(0);

      const result = await triggerAdminRegistrationSync({ scope: 'ALL', sport: 'OB' });

      expect(result.year).toBe(new Date().getFullYear());
    });

    it('propagates a sync failure to the caller', async () => {
      runClubSyncMock.mockRejectedValue(new Error('ORIS down'));

      await expect(
        triggerAdminRegistrationSync({ scope: 'CLUBS', sport: 'OB', year: 2026 }),
      ).rejects.toThrow('ORIS down');
    });
  });
});
