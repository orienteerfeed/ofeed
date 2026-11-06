import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConflictError, NotFoundError } from '../../../exceptions/index.js';
import type { AppBindings } from '../../../types/index.js';
import { AuthzError } from '../../../utils/authz.js';

vi.mock('../bank-connection.service.js', () => ({
  createBankConnection: vi.fn(),
  listBankConnections: vi.fn(),
  listConnectionBankTransactions: vi.fn(),
  listEventBankTransactions: vi.fn(),
  recordBankSyncReport: vi.fn(),
  reportBankTransactions: vi.fn(),
  revokeBankConnection: vi.fn(),
  updateBankConnection: vi.fn(),
}));
vi.mock('../bank-matching.js', () => ({
  ignoreBankTransaction: vi.fn(),
  matchBankTransactionManually: vi.fn(),
}));
import {
  createBankConnection,
  listEventBankTransactions,
  reportBankTransactions,
  revokeBankConnection,
} from '../bank-connection.service.js';
import { ignoreBankTransaction } from '../bank-matching.js';
import {
  bankConnectionRoutes,
  bankTransactionRoutes,
  eventBankTransactionRoutes,
} from '../bank.routes.js';

const DEVICE = '0d3c8f3e-2f7a-4a63-9a43-6f7d52d4f1aa';
function app(type: 'jwt' | 'eventBasic' | null = 'jwt') {
  const app = new Hono<AppBindings>();
  app.use('*', async (c, next) => {
    if (type) c.set('authContext', { isAuthenticated: true, type, userId: 7, eventId: 'race' });
    await next();
  });
  app.route('/bank-connections', bankConnectionRoutes);
  app.route('/bank-transactions', bankTransactionRoutes);
  app.route('/events', eventBankTransactionRoutes);
  return app;
}
const post = (value: unknown, headers: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(value),
});
const batch = (transactions: unknown[]) => ({ deviceId: DEVICE, transactions });
beforeEach(() => vi.resetAllMocks());

describe('bank REST adapters', () => {
  it('requires a user JWT everywhere', async () => {
    for (const type of [null, 'eventBasic'] as const) {
      expect((await app(type).request('/bank-connections')).status).toBe(401);
      expect(
        (await app(type).request('/bank-connections/conn/transactions', post(batch([{}])))).status,
      ).toBe(401);
      expect((await app(type).request('/bank-transactions/bt-1/ignore', post({}))).status).toBe(
        401,
      );
      expect((await app(type).request('/events/race/bank-transactions')).status).toBe(401);
    }
    expect(reportBankTransactions).not.toHaveBeenCalled();
  });

  it('passes the JWT owner and returns 201 for new and 200 for existing connections', async () => {
    const body = {
      provider: 'FIO',
      mode: 'LIVE',
      name: 'Fio',
      accountIdentifier: 'CZ6508000000192000145399',
      variableSymbolPrefix: '82',
      prefixEffectiveFrom: '2026-10-20',
      deviceId: DEVICE,
    };
    vi.mocked(createBankConnection).mockResolvedValueOnce({
      connection: { id: 'conn' } as never,
      created: true,
    });
    const created = await app().request('/bank-connections', post({ ...body, ownerId: 99 }));
    expect(created.status).toBe(422); // ownerId is never accepted from the body
    const ok = await app().request('/bank-connections', post(body));
    expect(ok.status).toBe(201);
    expect(vi.mocked(createBankConnection).mock.calls[0]![1]).toBe(7);
    vi.mocked(createBankConnection).mockResolvedValueOnce({
      connection: { id: 'conn' } as never,
      created: false,
    });
    expect((await app().request('/bank-connections', post(body))).status).toBe(200);
  });

  it('returns per-item batch results and validates only the envelope', async () => {
    vi.mocked(reportBankTransactions).mockResolvedValueOnce([
      { providerTransactionId: '1', status: 'MATCHED' },
      { providerTransactionId: null, status: 'INVALID' },
    ]);
    const response = await app().request(
      '/bank-connections/conn/transactions',
      post(batch([{ providerTransactionId: '1' }, 'bad']), { 'Idempotency-Key': 'run-1' }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      results: { data: [{ status: 'MATCHED' }, { status: 'INVALID' }] },
    });
    expect(vi.mocked(reportBankTransactions).mock.calls[0]!.slice(1)).toEqual([
      7,
      'conn',
      DEVICE,
      [{ providerTransactionId: '1' }, 'bad'],
    ]);

    for (const value of [batch([]), batch(Array.from({ length: 201 }, () => ({}))), {}]) {
      expect((await app().request('/bank-connections/conn/transactions', post(value))).status).toBe(
        422,
      );
    }
    const badKey = await app().request(
      '/bank-connections/conn/transactions',
      post(batch([{}]), { 'Idempotency-Key': 'with space' }),
    );
    expect(badKey.status).toBe(422);
    expect(reportBankTransactions).toHaveBeenCalledTimes(1);
  });

  it('maps service errors', async () => {
    vi.mocked(reportBankTransactions).mockRejectedValueOnce(new ConflictError('revoked'));
    expect(
      (await app().request('/bank-connections/conn/transactions', post(batch([{}])))).status,
    ).toBe(409);
    vi.mocked(revokeBankConnection).mockRejectedValueOnce(new NotFoundError('missing'));
    expect((await app().request('/bank-connections/conn', { method: 'DELETE' })).status).toBe(404);
    vi.mocked(ignoreBankTransaction).mockRejectedValueOnce(new ConflictError('resolved'));
    expect((await app().request('/bank-transactions/bt-1/ignore', post({}))).status).toBe(409);
    vi.mocked(listEventBankTransactions).mockRejectedValueOnce(new AuthzError('owner', 403));
    expect((await app().request('/events/race/bank-transactions')).status).toBe(403);
  });
});
