import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  event: {
    findUnique: vi.fn(),
  },
  eventPassword: {
    findUnique: vi.fn(),
  },
  class: {
    findMany: vi.fn(),
  },
  competitor: {
    findMany: vi.fn(),
  },
}));

vi.mock('../../../utils/context.js', () => ({
  default: prismaMock,
}));

import publicEventRoutes from '../event.public.routes.js';

describe('event connection check route', () => {
  beforeEach(() => {
    prismaMock.event.findUnique.mockReset();
    prismaMock.eventPassword.findUnique.mockReset();
    prismaMock.class.findMany.mockReset();
    prismaMock.competitor.findMany.mockReset();
  });

  it('returns connection validity for a valid Basic-authenticated event', async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      id: 'evt-1',
      name: 'Night Sprint',
    });
    prismaMock.eventPassword.findUnique.mockResolvedValue({
      expiresAt: new Date('2026-06-01T08:00:00.000Z'),
    });
    prismaMock.class.findMany.mockResolvedValue([]);
    prismaMock.competitor.findMany.mockResolvedValue([]);

    const app = new Hono();
    app.use('*', async (c, next) => {
      (c as any).set('authContext', {
        isAuthenticated: true,
        type: 'eventBasic',
        eventId: 'evt-1',
      });
      await next();
    });
    app.route('/', publicEventRoutes as never);

    const response = await app.request('http://localhost/evt-1/connection-check', {
      method: 'POST',
    });

    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload).toMatchObject({
      message: 'OK',
      error: false,
      code: 200,
      results: {
        data: {
          valid: true,
          event: {
            id: 'evt-1',
            name: 'Night Sprint',
          },
          credentials: {
            valid: true,
            reason: null,
            authType: 'eventBasic',
            expiresAt: '2026-06-01T08:00:00.000Z',
          },
          classes: {
            valid: true,
            items: [],
          },
          competitors: {
            valid: true,
            items: [],
          },
        },
      },
    });
  });

  it('remaps stale internal ids through external ids when current entities exist', async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      id: 'evt-1',
      name: 'Night Sprint',
    });
    prismaMock.eventPassword.findUnique.mockResolvedValue({
      expiresAt: new Date('2026-06-01T08:00:00.000Z'),
    });
    prismaMock.class.findMany.mockResolvedValue([
      {
        id: 44,
        eventId: 'evt-1',
        externalId: 'H21',
        name: 'H21',
      },
    ]);
    prismaMock.competitor.findMany.mockResolvedValue([
      {
        id: 904,
        externalId: 'oris-88991',
        firstname: 'Jan',
        lastname: 'Novak',
        classId: 44,
        class: {
          id: 44,
          externalId: 'H21',
          name: 'H21',
        },
      },
    ]);

    const app = new Hono();
    app.use('*', async (c, next) => {
      (c as any).set('authContext', {
        isAuthenticated: true,
        type: 'eventBasic',
        eventId: 'evt-1',
      });
      await next();
    });
    app.route('/', publicEventRoutes as never);

    const response = await app.request('http://localhost/evt-1/connection-check', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        classes: [
          {
            ref: 'class-1',
            id: 12,
            externalId: 'H21',
          },
        ],
        competitors: [
          {
            ref: 'comp-1',
            id: 456,
            externalId: 'oris-88991',
            classId: 12,
            classExternalId: 'H21',
          },
        ],
      }),
    });

    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.results.data.valid).toBe(true);
    expect(payload.results.data.classes.items).toEqual([
      expect.objectContaining({
        ref: 'class-1',
        valid: true,
        status: 'remapped',
        reason: 'stale_reference',
        resolved: {
          id: 44,
          externalId: 'H21',
          name: 'H21',
        },
      }),
    ]);
    expect(payload.results.data.competitors.items).toEqual([
      expect.objectContaining({
        ref: 'comp-1',
        valid: true,
        status: 'remapped',
        reason: 'stale_reference',
        resolved: {
          id: 904,
          externalId: 'oris-88991',
          firstname: 'Jan',
          lastname: 'Novak',
          classId: 44,
          classExternalId: 'H21',
          className: 'H21',
        },
        class: {
          valid: true,
          status: 'remapped',
          reason: 'stale_reference',
          resolved: {
            id: 44,
            externalId: 'H21',
            name: 'H21',
          },
        },
      }),
    ]);
  });

  it('reports invalid credentials without rejecting the request', async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      id: 'evt-1',
      name: 'Night Sprint',
    });
    prismaMock.eventPassword.findUnique.mockResolvedValue(null);
    prismaMock.class.findMany.mockResolvedValue([]);
    prismaMock.competitor.findMany.mockResolvedValue([]);

    const app = new Hono();
    app.use('*', async (c, next) => {
      (c as any).set('authContext', {
        isAuthenticated: false,
        type: null,
        failureReason: 'basic_password_expired',
      });
      await next();
    });
    app.route('/', publicEventRoutes as never);

    const response = await app.request('http://localhost/evt-1/connection-check', {
      method: 'POST',
    });

    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.results.data).toMatchObject({
      valid: false,
      event: {
        id: 'evt-1',
        name: 'Night Sprint',
      },
      credentials: {
        valid: false,
        reason: 'basic_password_expired',
        authType: null,
        expiresAt: null,
      },
    });
  });
});
