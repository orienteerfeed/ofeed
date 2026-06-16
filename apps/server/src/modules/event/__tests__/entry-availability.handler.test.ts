import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({}));
const mockListEventEntryAvailability = vi.hoisted(() => vi.fn());
const s3Mock = vi.hoisted(() => ({ getPublicObject: vi.fn() }));

vi.mock('../../../utils/context.js', () => ({ default: prismaMock }));
vi.mock('../../../lib/storage/s3.js', () => ({
  getPublicObject: s3Mock.getPublicObject,
}));
vi.mock('../../../modules/start-slot-vacancy/start-slot-vacancy.service.js', () => ({
  listEventEntryAvailability: mockListEventEntryAvailability,
}));

import publicEventRoutes from '../event.public.routes.js';

const AVAILABILITY_FIXTURE = {
  entriesOpenAt: null,
  entriesCloseAt: null,
  currency: { code: 'CZK', name: 'Czech koruna' },
  vatPayer: false,
  vatRate: null,
  defaultStartMode: 'StartList',
  classes: [
    {
      id: 10,
      name: 'H21E',
      sex: 'M',
      minAge: null,
      maxAge: null,
      maxNumberOfCompetitors: 100,
      competitorCount: 80,
      startMode: 'StartList',
      fee: null,
      availableCount: 5,
      isFull: false,
      slots: [{ id: 1, startTime: new Date('2026-06-15T08:00:00.000Z'), bibNumber: null }],
    },
  ],
};

describe('GET /:eventId/entry-availability', () => {
  let app: Hono;

  beforeEach(() => {
    mockListEventEntryAvailability.mockReset();
    app = new Hono();
    app.route('/', publicEventRoutes as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with entry availability data', async () => {
    mockListEventEntryAvailability.mockResolvedValue(AVAILABILITY_FIXTURE);

    const response = await app.request('http://localhost/event-1/entry-availability');

    expect(response.status).toBe(200);
    const json = await response.json();
    // success() wraps payload in results: { data: ... }
    expect(json.results.data.currency).toEqual({ code: 'CZK', name: 'Czech koruna' });
    expect(json.results.data.classes).toHaveLength(1);
    expect(json.results.data.classes[0].availableCount).toBe(5);
    expect(mockListEventEntryAvailability).toHaveBeenCalledWith(prismaMock, 'event-1');
  });

  it('returns 422 when event does not exist', async () => {
    mockListEventEntryAvailability.mockResolvedValue(null);

    const response = await app.request('http://localhost/missing-event/entry-availability');

    expect(response.status).toBe(422);
  });

  it('returns 500 when the service throws', async () => {
    mockListEventEntryAvailability.mockRejectedValue(new Error('DB down'));

    const response = await app.request('http://localhost/event-1/entry-availability');

    expect(response.status).toBe(500);
  });
});
