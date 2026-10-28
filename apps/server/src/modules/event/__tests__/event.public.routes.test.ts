import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  event: {
    findUnique: vi.fn(),
  },
}));

const s3Mock = vi.hoisted(() => ({
  getPublicObject: vi.fn(),
}));

vi.mock('../../../utils/context.js', () => ({
  default: prismaMock,
}));

vi.mock('../../../lib/storage/s3.js', () => ({
  getPublicObject: s3Mock.getPublicObject,
}));

import publicEventRoutes from '../event.public.routes.js';

describe('public event routes', () => {
  beforeEach(() => {
    prismaMock.event.findUnique.mockReset();
    s3Mock.getPublicObject.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('includes team counts in event detail, including empty relay classes', async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      id: 'relay-event',
      name: 'Relay',
      date: new Date('2026-10-20T00:00:00Z'),
      discipline: 'Relay',
      classes: [
        { id: 1, name: 'H21', minAge: null, maxAge: null, _count: { competitors: 6, teams: 2 } },
        { id: 2, name: 'D21', minAge: null, maxAge: null, _count: { competitors: 0, teams: 0 } },
      ],
    });
    const app = new Hono();
    app.route('/', publicEventRoutes as any);
    const response = await app.request('http://localhost/relay-event');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.results.data.classes).toEqual([
      expect.objectContaining({ id: 1, competitorsCount: 6, teamsCount: 2 }),
      expect.objectContaining({ id: 2, competitorsCount: 0, teamsCount: 0 }),
    ]);
    expect(
      prismaMock.event.findUnique.mock.calls[0][0].select.classes.include._count.select,
    ).toEqual({ competitors: true, teams: true });
  });

  it('serves featured image for unpublished events when the image exists', async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      featuredImageKey: 'events/test-event/featured-image.png',
    });
    s3Mock.getPublicObject.mockResolvedValue({
      Body: 'image-binary',
      ContentType: 'image/png',
      ContentLength: 12,
    });

    const app = new Hono();
    app.route('/', publicEventRoutes as any);

    const response = await app.request('http://localhost/test-event/image');

    expect(response.status).toBe(200);
    expect(prismaMock.event.findUnique).toHaveBeenCalledWith({
      where: { id: 'test-event' },
      select: { featuredImageKey: true },
    });
    expect(s3Mock.getPublicObject).toHaveBeenCalledWith('events/test-event/featured-image.png');
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('content-length')).toBe('12');
    expect(response.headers.get('cache-control')).toBe('public, max-age=3600');
    expect(await response.text()).toBe('image-binary');
  });
});
