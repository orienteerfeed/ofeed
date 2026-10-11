import { describe, expect, it, vi } from 'vitest';

const {
  getAdminRegistrationSyncStatusMock,
  getAdminRegistrationsMock,
  getAdminClubsMock,
  triggerAdminRegistrationSyncMock,
} = vi.hoisted(() => ({
  getAdminRegistrationSyncStatusMock: vi.fn(),
  getAdminRegistrationsMock: vi.fn(),
  getAdminClubsMock: vi.fn(),
  triggerAdminRegistrationSyncMock: vi.fn(),
}));

vi.mock('../admin.registration.service.js', () => ({
  getAdminRegistrationSyncStatus: getAdminRegistrationSyncStatusMock,
  getAdminRegistrations: getAdminRegistrationsMock,
  getAdminClubs: getAdminClubsMock,
  triggerAdminRegistrationSync: triggerAdminRegistrationSyncMock,
}));

import { HTTP_STATUS } from '../../../constants/index.js';
import {
  getAdminClubsHandler,
  getAdminRegistrationsHandler,
  getAdminRegistrationSyncStatusHandler,
  triggerAdminRegistrationSyncHandler,
} from '../admin.registration.handlers.js';

function createContext(options: {
  query?: Record<string, string | undefined>;
  body?: unknown;
  path?: string;
} = {}) {
  const { query = {}, body, path = '/rest/v1/admin/registrations' } = options;
  return {
    get: (key: string) => (key === 'requestId' ? 'test-request-id' : undefined),
    req: {
      method: body !== undefined ? 'POST' : 'GET',
      path,
      query: (key?: string) => (key ? query[key] : query),
      json: async () => body ?? {},
    },
    json: (responseBody: unknown, status: number) => ({ body: responseBody, status }),
  };
}

describe('admin registration handlers', () => {
  it('returns the combined sync status', async () => {
    getAdminRegistrationSyncStatusMock.mockResolvedValue({ registrations: [], clubs: null });

    const response = await getAdminRegistrationSyncStatusHandler(createContext());

    expect(response.status).toBe(HTTP_STATUS.OK);
    expect(response.body).toMatchObject({ error: false, results: { registrations: [], clubs: null } });
  });

  it('rejects an invalid page parameter for the registrations list', async () => {
    const response = await getAdminRegistrationsHandler(createContext({ query: { page: '1abc' } }));

    expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE_CONTENT);
    expect(getAdminRegistrationsMock).not.toHaveBeenCalled();
  });

  it('loads the registrations list with default pagination', async () => {
    getAdminRegistrationsMock.mockResolvedValue({ total: 0, items: [] });

    const response = await getAdminRegistrationsHandler(createContext());

    expect(getAdminRegistrationsMock).toHaveBeenCalledWith({ page: 1, limit: 25, q: undefined });
    expect(response.status).toBe(HTTP_STATUS.OK);
  });

  it('caps the registrations page limit at 200', async () => {
    getAdminRegistrationsMock.mockResolvedValue({ total: 0, items: [] });

    await getAdminRegistrationsHandler(createContext({ query: { limit: '500' } }));

    expect(getAdminRegistrationsMock).toHaveBeenCalledWith({ page: 1, limit: 200, q: undefined });
  });

  it('forwards the free-text filter to the clubs list', async () => {
    getAdminClubsMock.mockResolvedValue({ total: 0, items: [] });

    await getAdminClubsHandler(createContext({ query: { q: 'alfa' } }));

    expect(getAdminClubsMock).toHaveBeenCalledWith({ page: 1, limit: 25, q: 'alfa' });
  });

  it('rejects an invalid sync trigger body', async () => {
    const response = await triggerAdminRegistrationSyncHandler(
      createContext({ body: { scope: 'INVALID' } }),
    );

    expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE_CONTENT);
    expect(triggerAdminRegistrationSyncMock).not.toHaveBeenCalled();
  });

  it('triggers a sync and returns the result', async () => {
    triggerAdminRegistrationSyncMock.mockResolvedValue({
      scope: 'ALL',
      sport: 'OB',
      year: 2026,
      registrationsSynced: 11850,
      clubsSynced: 218,
      startedAt: new Date(),
      finishedAt: new Date(),
    });

    const response = await triggerAdminRegistrationSyncHandler(
      createContext({ body: { scope: 'ALL' } }),
    );

    expect(triggerAdminRegistrationSyncMock).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'ALL', sport: 'OB' }),
    );
    expect(response.status).toBe(HTTP_STATUS.OK);
  });

  it('returns 500 when the sync trigger fails', async () => {
    triggerAdminRegistrationSyncMock.mockRejectedValue(new Error('ORIS down'));

    const response = await triggerAdminRegistrationSyncHandler(
      createContext({ body: { scope: 'CLUBS' } }),
    );

    expect(response.status).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR);
  });
});
