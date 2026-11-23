import { Hono } from 'hono';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { AppBindings } from '../../../types/index.js';
import { AuthzError } from '../../../utils/authz.js';
import { ConflictError, NotFoundError } from '../../../exceptions/index.js';
vi.mock('../entry-settlement.service.js', () => ({ downloadEntrySettlement: vi.fn() }));
import { downloadEntrySettlement } from '../entry-settlement.service.js';
import router from '../entry-settlement.routes.js';
beforeEach(() => vi.resetAllMocks());
describe('settlement binary route', () => {
  const app = () => new Hono<AppBindings>().route('/', router);
  it('returns a private PDF attachment and forwards signed access', async () => {
    vi.mocked(downloadEntrySettlement).mockResolvedValue({
      filename: 'vyuctovani-9990607.pdf',
      content: Buffer.from('%PDF-test'),
    });
    const response = await app().request('/race/entries/order/settlement.pdf?access=signed');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toContain(
      'attachment; filename="vyuctovani-9990607.pdf"',
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.text()).toBe('%PDF-test');
    expect(downloadEntrySettlement).toHaveBeenCalledWith(
      undefined,
      undefined,
      'race',
      'order',
      'signed',
    );
  });
  it.each([
    [new AuthzError('Unauthorized', 401), 401],
    [new AuthzError('Forbidden', 403), 403],
    [new NotFoundError('Missing'), 404],
    [new ConflictError('Not processed'), 409],
  ] as const)('preserves API errors for %s', async (cause, status) => {
    vi.mocked(downloadEntrySettlement).mockRejectedValue(cause);
    const response = await app().request('/race/entries/order/settlement.pdf');
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error: true, code: status });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
});
