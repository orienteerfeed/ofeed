import { describe, expect, it, vi } from 'vitest';

import { ensureEventOwner, ensureEventOwnerOrAdmin, requireAdmin } from '../authz.js';

function createPrismaMock({
  users = {},
  events = {},
}: {
  users?: Record<number, { role: 'USER' | 'ADMIN' } | null>;
  events?: Record<string, { authorId: number | null } | null>;
}) {
  return {
    user: {
      findUnique: vi.fn(({ where }: { where: { id: number } }) => users[where.id] ?? null),
    },
    event: {
      findUnique: vi.fn(
        ({ where, select }: { where: { id: string }; select?: Record<string, boolean> }) => {
          const event = events[where.id] ?? null;

          if (!event) {
            return null;
          }

          if (!select) {
            return event;
          }

          return Object.keys(select).reduce<Record<string, unknown>>((acc, key) => {
            if (select[key]) {
              acc[key] = event[key as keyof typeof event] ?? null;
            }
            return acc;
          }, {});
        },
      ),
    },
  };
}

describe('authz helpers', () => {
  it('allows admin users on admin-protected actions', async () => {
    const prisma = createPrismaMock({
      users: {
        1: { role: 'ADMIN' },
      },
    });

    await expect(
      requireAdmin(prisma, {
        isAuthenticated: true,
        type: 'jwt',
        userId: 1,
      }),
    ).resolves.toMatchObject({
      userId: 1,
      role: 'ADMIN',
      isAdmin: true,
    });
  });

  it('rejects non-admin users on admin-protected actions', async () => {
    const prisma = createPrismaMock({
      users: {
        2: { role: 'USER' },
      },
    });

    await expect(
      requireAdmin(prisma, {
        isAuthenticated: true,
        type: 'jwt',
        userId: 2,
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'Admin access required',
    });
  });

  it('allows an eventOwner to access their own event', async () => {
    const prisma = createPrismaMock({
      users: {
        3: { role: 'USER' },
      },
      events: {
        'evt-1': { authorId: 3 },
      },
    });

    await expect(
      ensureEventOwnerOrAdmin(
        prisma,
        {
          isAuthenticated: true,
          type: 'jwt',
          userId: '3',
        },
        'evt-1',
      ),
    ).resolves.toMatchObject({
      userId: 3,
      isEventOwner: true,
      isAdmin: false,
    });
  });

  it('allows admins to access events they do not own', async () => {
    const prisma = createPrismaMock({
      users: {
        4: { role: 'ADMIN' },
      },
      events: {
        'evt-2': { authorId: 99 },
      },
    });

    await expect(
      ensureEventOwnerOrAdmin(
        prisma,
        {
          isAuthenticated: true,
          type: 'jwt',
          userId: 4,
        },
        'evt-2',
      ),
    ).resolves.toMatchObject({
      userId: 4,
      isEventOwner: false,
      isAdmin: true,
    });
  });

  it('preserves original event authorId when admin accesses an event they do not own', async () => {
    const prisma = createPrismaMock({
      users: {
        4: { role: 'ADMIN' },
      },
      events: {
        'evt-2': { authorId: 99 },
      },
    });

    const result = await ensureEventOwnerOrAdmin(
      prisma,
      {
        isAuthenticated: true,
        type: 'jwt',
        userId: 4,
      },
      'evt-2',
    );

    expect(result.event.authorId).toBe(99);
    expect(result.userId).toBe(4);
  });

  it('rejects regular users on events they do not own', async () => {
    const prisma = createPrismaMock({
      users: {
        5: { role: 'USER' },
      },
      events: {
        'evt-3': { authorId: 12 },
      },
    });

    await expect(
      ensureEventOwnerOrAdmin(
        prisma,
        {
          isAuthenticated: true,
          type: 'jwt',
          userId: 5,
        },
        'evt-3',
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'Not authorized for this event',
    });
  });

  it('keeps exact eventOwner checks strict even for admins', async () => {
    const prisma = createPrismaMock({
      users: {
        6: { role: 'ADMIN' },
      },
      events: {
        'evt-4': { authorId: 16 },
      },
    });

    await expect(
      ensureEventOwner(
        prisma,
        {
          isAuthenticated: true,
          type: 'jwt',
          userId: 6,
        },
        'evt-4',
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'Not authorized for this event',
    });
  });

  it('allows event basic auth only for the matching eventOwner event', async () => {
    const prisma = createPrismaMock({
      users: {
        7: { role: 'USER' },
      },
      events: {
        'evt-5': { authorId: 7 },
      },
    });

    await expect(
      ensureEventOwnerOrAdmin(
        prisma,
        {
          isAuthenticated: true,
          type: 'eventBasic',
          userId: 7,
          eventId: 'evt-5',
        },
        'evt-5',
      ),
    ).resolves.toMatchObject({
      userId: 7,
      isEventOwner: true,
      isAdmin: false,
    });
  });
});
