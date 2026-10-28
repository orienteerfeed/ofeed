import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppBindings } from '../../../types/index.js';
import { AuthzError } from '../../../utils/authz.js';
import { ConflictError, NotFoundError, ValidationError } from '../../../exceptions/index.js';

vi.mock('../entry-payment.service.js', () => ({
  recordEntryPayment: vi.fn(),
  listEntryPayments: vi.fn(),
  listPaymentInsights: vi.fn(),
}));
import {
  listEntryPayments,
  listPaymentInsights,
  recordEntryPayment,
} from '../entry-payment.service.js';
import router from '../entry-payment.routes.js';

const body = {
  clientPaymentId: 'b42c66e5-98f7-4f1b-9fd6-0d436660b624',
  method: 'CASH',
  amount: 250,
  currency: 'CZK',
  paidAt: '2026-10-25T09:00:00Z',
  deviceId: 'desk-1',
};
function app(type: 'jwt' | 'eventBasic' | null = 'jwt') {
  const app = new Hono<AppBindings>();
  app.use('*', async (c, next) => {
    if (type) c.set('authContext', { isAuthenticated: true, type, userId: 7, eventId: 'race' });
    await next();
  });
  return app.route('/', router);
}
const request = (value: unknown = body) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(value),
});
const path = '/race/entries/entry-1/payments';
beforeEach(() => vi.resetAllMocks());

describe('entry payment REST adapters', () => {
  it('requires user JWTs for both endpoints', async () => {
    for (const type of [null, 'eventBasic'] as const) {
      expect((await app(type).request(path, request())).status).toBe(401);
      expect((await app(type).request('/race/payments')).status).toBe(401);
      expect((await app(type).request('/race/insights/payments')).status).toBe(401);
    }
    expect(recordEntryPayment).not.toHaveBeenCalled();
    expect(listEntryPayments).not.toHaveBeenCalled();
    expect(listPaymentInsights).not.toHaveBeenCalled();
  });
  it('returns enriched insights in the existing envelope and maps access errors', async () => {
    const row = {
      ...body,
      paymentReference: '2600000001',
      contactFirstname: 'Jan',
      contactLastname: 'Novák',
    };
    vi.mocked(listPaymentInsights).mockResolvedValue([row] as never);
    const response = await app().request('/race/insights/payments');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ results: { data: [row] } });
    expect(listPaymentInsights).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ userId: 7 }),
      'race',
    );
    vi.mocked(listPaymentInsights).mockRejectedValueOnce(new AuthzError('Denied', 403));
    expect((await app().request('/race/insights/payments')).status).toBe(403);
  });
  it('rejects malformed JSON, invalid amounts, operator spoofing and invalid queries', async () => {
    expect((await app().request(path, { ...request(), body: '{' })).status).toBe(400);
    for (const change of [{ amount: 1.005 }, { operatorId: 99 }]) {
      expect((await app().request(path, request({ ...body, ...change }))).status).toBe(422);
    }
    expect((await app().request('/race/payments?since=bad')).status).toBe(422);
    expect(recordEntryPayment).not.toHaveBeenCalled();
    expect(listEntryPayments).not.toHaveBeenCalled();
  });
  it('returns 201 on creation and 200 on replay in the existing envelope', async () => {
    for (const created of [true, false]) {
      vi.mocked(recordEntryPayment).mockResolvedValue({ payment: body, created } as never);
      const response = await app().request(path, request());
      expect(response.status).toBe(created ? 201 : 200);
      expect(await response.json()).toMatchObject({
        error: false,
        code: response.status,
        results: { data: body },
      });
    }
  });
  it('forwards report filters and preserves results.data', async () => {
    vi.mocked(listEntryPayments).mockResolvedValue([body] as never);
    const response = await app().request(
      '/race/payments?entryId=entry-1&since=2026-10-25T09:00:00Z&deviceId=desk-1',
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ results: { data: [body] } });
    expect(listEntryPayments).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ userId: 7 }),
      'race',
      { entryId: 'entry-1', since: '2026-10-25T09:00:00Z', deviceId: 'desk-1' },
    );
  });
  it('maps service failures to explicit HTTP errors', async () => {
    for (const [cause, status] of [
      [new AuthzError('Denied', 403), 403],
      [new NotFoundError('Missing'), 404],
      [new ConflictError('Reused'), 409],
      [new ValidationError('Currency'), 422],
    ] as const) {
      vi.mocked(recordEntryPayment).mockRejectedValueOnce(cause);
      expect((await app().request(path, request())).status).toBe(status);
    }
    vi.mocked(listEntryPayments).mockRejectedValueOnce(new AuthzError('Missing event', 404));
    expect((await app().request('/race/payments')).status).toBe(404);
  });
});
