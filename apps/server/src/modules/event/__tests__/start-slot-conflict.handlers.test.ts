import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppBindings } from '../../../types/index.js';

const mocks = vi.hoisted(() => ({ update: vi.fn(), createOrder: vi.fn(), authorize: vi.fn() }));
vi.mock('../../../utils/context.js', () => ({ default: {} }));
vi.mock('../../../utils/authz.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/authz.js')>()),
  ensureEventOwnerOrAdmin: mocks.authorize,
}));
vi.mock('../event.service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../event.service.js')>()),
  updateCompetitor: mocks.update,
}));
vi.mock('../../entry/entry.service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../entry/entry.service.js')>()),
  createEntryOrder: mocks.createOrder,
}));

import { ConflictError } from '../../../exceptions/index.js';
import { rethrowAuthzOrError } from '../../../graphql/errors.js';
import { registerSecureEventRoutes } from '../event.secure.handlers.js';
import { registerPublicEventRoutes } from '../event.public.handlers.js';

function app() {
  const app = new Hono<AppBindings>();
  app.use('*', async (c, next) => {
    c.set('authContext', { isAuthenticated: true, type: 'jwt', userId: 7 });
    await next();
  });
  registerSecureEventRoutes(app);
  registerPublicEventRoutes(app);
  return app;
}
const put = (body: object) =>
  app().request('/event-1/competitors/7', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('G19 slot conflict transport contract', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.authorize.mockResolvedValue({ userId: 7 });
  });

  it('keeps PUT success shape and does not inject an omitted time', async () => {
    mocks.update.mockResolvedValue({
      message: 'Competitor has been successfully updated',
      updatedFields: { classId: 42 },
    });
    const response = await put({ origin: 'OFFICE', classId: 42 });
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith('event-1', '7', 'OFFICE', { classId: 42 }, 7);
    expect(await response.json()).toMatchObject({
      error: false,
      code: 200,
      results: { data: { updatedFields: { classId: 42 } } },
    });
  });

  it('returns 409 SLOT_TAKEN from PUT', async () => {
    mocks.update.mockRejectedValue(
      new ConflictError('The requested start time is not available.', 'SLOT_TAKEN'),
    );
    const response = await put({ origin: 'OFFICE', startTime: '2026-10-26T09:00:00Z' });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: true,
      code: 409,
      errorCode: 'SLOT_TAKEN',
    });
  });

  it('returns 409 SLOT_TAKEN from entry submission without a retry key', async () => {
    mocks.createOrder.mockRejectedValue(
      new ConflictError('The requested start time is not available.', 'SLOT_TAKEN'),
    );
    const response = await app().request('/event-1/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contactEmail: 'test@example.com',
        contactFirstname: 'Jan',
        contactLastname: 'Test',
        paymentMethod: 'CASH',
        items: [
          {
            classId: 42,
            firstname: 'Jan',
            lastname: 'Test',
            registration: 'TST9501',
            card: 123,
            startTime: '2026-10-26T09:00:00Z',
          },
        ],
      }),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: true,
      code: 409,
      errorCode: 'SLOT_TAKEN',
    });
  });

  it('exposes SLOT_TAKEN as a GraphQL extension', () => {
    expect(() => rethrowAuthzOrError(new ConflictError('Taken', 'SLOT_TAKEN'), 'Fallback')).toThrow(
      expect.objectContaining({ extensions: { code: 'SLOT_TAKEN' } }),
    );
  });
});
