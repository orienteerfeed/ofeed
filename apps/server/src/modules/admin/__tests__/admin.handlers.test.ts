import { describe, expect, it } from 'vitest';

import { HTTP_STATUS } from '../../../constants/index.js';
import { getAdminEventsHandler, getAdminUsersHandler } from '../admin.handlers.js';

function createContext(query: Record<string, string | undefined>) {
  return {
    get: (key: string) => (key === 'requestId' ? 'test-request-id' : undefined),
    req: {
      method: 'GET',
      path: '/rest/v1/admin/users',
      query: (key: string) => query[key],
    },
    json: (body: unknown, status: number) => ({ body, status }),
  };
}

describe('admin handlers pagination validation', () => {
  it('rejects partially numeric users page query parameter', async () => {
    const response = await getAdminUsersHandler(createContext({ page: '1abc' }));

    expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE_CONTENT);
    expect(response.body).toMatchObject({
      error: true,
      code: HTTP_STATUS.UNPROCESSABLE_CONTENT,
    });
  });

  it('rejects partially numeric users limit query parameter', async () => {
    const response = await getAdminUsersHandler(createContext({ limit: '25foo' }));

    expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE_CONTENT);
    expect(response.body).toMatchObject({
      error: true,
      code: HTTP_STATUS.UNPROCESSABLE_CONTENT,
    });
  });

  it('rejects partially numeric events page query parameter', async () => {
    const response = await getAdminEventsHandler(createContext({ page: '1.9' }));

    expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE_CONTENT);
    expect(response.body).toMatchObject({
      error: true,
      code: HTTP_STATUS.UNPROCESSABLE_CONTENT,
    });
  });

  it('rejects partially numeric events limit query parameter', async () => {
    const response = await getAdminEventsHandler(createContext({ limit: '25foo' }));

    expect(response.status).toBe(HTTP_STATUS.UNPROCESSABLE_CONTENT);
    expect(response.body).toMatchObject({
      error: true,
      code: HTTP_STATUS.UNPROCESSABLE_CONTENT,
    });
  });
});
