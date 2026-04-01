import { describe, expect, it } from 'vitest';

import {
  __adminServiceInternals,
  deleteAdminUser,
  getAdminDashboard,
  getAdminEvents,
  getAdminUsers,
  updateAdminUserActive,
} from '../admin.service.js';

function createPrismaMock() {
  return {
    user: {
      count: async ({ where }: { where?: { active?: boolean; role?: 'ADMIN' } } = {}) => {
        if (where?.active) return 2;
        if (where?.role === 'ADMIN') return 1;
        return 3;
      },
      findMany: async ({
        where,
        take,
      }: {
        where?: { createdAt?: { gte: Date } };
        take?: number;
      }) => {
        const users = [
          {
            id: 1,
            email: 'admin@example.com',
            firstname: 'Ada',
            lastname: 'Admin',
            role: 'ADMIN' as const,
            organisation: 'OFeed',
            active: true,
            createdAt: new Date('2026-03-05T10:00:00.000Z'),
          },
          {
            id: 2,
            email: 'user@example.com',
            firstname: 'Uma',
            lastname: 'User',
            role: 'USER' as const,
            organisation: null,
            active: true,
            createdAt: new Date('2026-02-10T10:00:00.000Z'),
          },
          {
            id: 3,
            email: 'inactive@example.com',
            firstname: 'Ian',
            lastname: 'Inactive',
            role: 'USER' as const,
            organisation: null,
            active: false,
            createdAt: new Date('2025-12-10T10:00:00.000Z'),
          },
        ];

        if (where?.createdAt?.gte) {
          return users
            .filter((user) => user.createdAt >= where.createdAt!.gte)
            .map((user) => ({ createdAt: user.createdAt }));
        }

        return users.slice(0, take ?? users.length);
      },
    },
    event: {
      count: async ({
        where,
      }: { where?: { published?: boolean; ranking?: boolean; date?: { gte: Date } } } = {}) => {
        if (where?.published) return 1;
        if (where?.ranking) return 2;
        if (where?.date?.gte) return 2;
        return 4;
      },
      findMany: async ({
        where,
        take,
      }: {
        where?: { createdAt?: { gte: Date } };
        take?: number;
      }) => {
        const events = [
          {
            id: 'evt-1',
            name: 'Spring race',
            organizer: 'Alpha Club',
            date: new Date('2026-04-12T00:00:00.000Z'),
            discipline: 'MIDDLE' as const,
            published: true,
            ranking: true,
            createdAt: new Date('2026-03-06T08:00:00.000Z'),
            author: { firstname: 'Ada', lastname: 'Admin' },
          },
          {
            id: 'evt-2',
            name: 'Night challenge',
            organizer: 'Beta Club',
            date: new Date('2026-05-18T00:00:00.000Z'),
            discipline: 'NIGHT' as const,
            published: false,
            ranking: true,
            createdAt: new Date('2026-02-03T08:00:00.000Z'),
            author: { firstname: 'Uma', lastname: 'User' },
          },
          {
            id: 'evt-3',
            name: 'City sprint',
            organizer: 'Gamma Club',
            date: new Date('2025-12-20T00:00:00.000Z'),
            discipline: 'SPRINT' as const,
            published: false,
            ranking: false,
            createdAt: new Date('2025-12-15T08:00:00.000Z'),
            author: null,
          },
        ];

        if (where?.createdAt?.gte) {
          return events
            .filter((event) => event.createdAt >= where.createdAt!.gte)
            .map((event) => ({ createdAt: event.createdAt }));
        }

        return events.slice(0, take ?? events.length);
      },
    },
  };
}

function createUserMutationPrismaMock(
  initialUsers: Array<{
    id: number;
    email: string;
    firstname: string;
    lastname: string;
    role: 'USER' | 'ADMIN';
    organisation: string | null;
    active: boolean;
    createdAt: Date;
  }>,
) {
  const users = [...initialUsers];
  const deletedOauthAccessTokenWhere: unknown[] = [];
  const deletedOauthAuthorizationCodeWhere: unknown[] = [];
  const deletedOauthRefreshTokenWhere: unknown[] = [];
  const deletedOauthGrantWhere: unknown[] = [];
  const deletedOauthScopeWhere: unknown[] = [];
  const deletedOauthRedirectUriWhere: unknown[] = [];
  const deletedOauthClientWhere: unknown[] = [];
  const deletedProtocolWhere: unknown[] = [];
  const updatedEventWhere: unknown[] = [];
  const deletedPasswordResetWhere: unknown[] = [];
  const deletedUserIds: number[] = [];

  const oauthClients = [{ id: 'client-1', userId: 2 }];

  const tx = {
    user: {
      findUnique: async ({ where }: { where: { id: number } }) =>
        users.find((user) => user.id === where.id) ?? null,
      count: async ({
        where,
      }: {
        where?: { role?: 'ADMIN'; active?: boolean };
      } = {}) =>
        users.filter((user) => {
          if (where?.role && user.role !== where.role) {
            return false;
          }
          if (where?.active !== undefined && user.active !== where.active) {
            return false;
          }
          return true;
        }).length,
      update: async ({ where, data }: { where: { id: number }; data: { active: boolean } }) => {
        const user = users.find((item) => item.id === where.id);
        if (!user) {
          throw new Error('User not found');
        }
        user.active = data.active;
        return user;
      },
      delete: async ({ where }: { where: { id: number } }) => {
        const index = users.findIndex((user) => user.id === where.id);
        if (index === -1) {
          throw new Error('User not found');
        }
        deletedUserIds.push(where.id);
        return users.splice(index, 1)[0];
      },
    },
    oAuthClient: {
      findMany: async ({ where }: { where: { userId: number } }) =>
        oauthClients
          .filter((client) => client.userId === where.userId)
          .map((client) => ({ id: client.id })),
      deleteMany: async ({ where }: { where: unknown }) => {
        deletedOauthClientWhere.push(where);
        return { count: 0 };
      },
    },
    oAuthAccessToken: {
      deleteMany: async ({ where }: { where: unknown }) => {
        deletedOauthAccessTokenWhere.push(where);
        return { count: 0 };
      },
    },
    oAuthAuthorizationCode: {
      deleteMany: async ({ where }: { where: unknown }) => {
        deletedOauthAuthorizationCodeWhere.push(where);
        return { count: 0 };
      },
    },
    oAuthRefreshToken: {
      deleteMany: async ({ where }: { where: unknown }) => {
        deletedOauthRefreshTokenWhere.push(where);
        return { count: 0 };
      },
    },
    oAuthGrant: {
      deleteMany: async ({ where }: { where: unknown }) => {
        deletedOauthGrantWhere.push(where);
        return { count: 0 };
      },
    },
    oAuthScope: {
      deleteMany: async ({ where }: { where: unknown }) => {
        deletedOauthScopeWhere.push(where);
        return { count: 0 };
      },
    },
    oAuthRedirectUri: {
      deleteMany: async ({ where }: { where: unknown }) => {
        deletedOauthRedirectUriWhere.push(where);
        return { count: 0 };
      },
    },
    protocol: {
      deleteMany: async ({ where }: { where: unknown }) => {
        deletedProtocolWhere.push(where);
        return { count: 0 };
      },
    },
    event: {
      updateMany: async ({ where }: { where: unknown }) => {
        updatedEventWhere.push(where);
        return { count: 0 };
      },
    },
    passwordReset: {
      deleteMany: async ({ where }: { where: unknown }) => {
        deletedPasswordResetWhere.push(where);
        return { count: 0 };
      },
    },
  };

  return {
    prisma: {
      $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
    },
    state: {
      users,
      deletedUserIds,
      deletedOauthAccessTokenWhere,
      deletedOauthAuthorizationCodeWhere,
      deletedOauthRefreshTokenWhere,
      deletedOauthGrantWhere,
      deletedOauthScopeWhere,
      deletedOauthRedirectUriWhere,
      deletedOauthClientWhere,
      deletedProtocolWhere,
      updatedEventWhere,
      deletedPasswordResetWhere,
    },
  };
}

describe('admin service', () => {
  it('builds month buckets for the last six months', () => {
    const monthStarts = __adminServiceInternals.buildDashboardMonthStarts(
      new Date('2026-04-01T00:00:00.000Z'),
    );

    expect(monthStarts).toHaveLength(6);
    expect(monthStarts[0]?.toISOString()).toBe('2025-11-01T00:00:00.000Z');
    expect(monthStarts[5]?.toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });

  it('aggregates admin dashboard data', async () => {
    const dashboard = await getAdminDashboard(
      createPrismaMock(),
      new Date('2026-04-01T00:00:00.000Z'),
    );

    expect(dashboard.summary).toMatchObject({
      totalUsers: 3,
      activeUsers: 2,
      adminUsers: 1,
      totalEvents: 4,
      publishedEvents: 1,
      rankingEvents: 2,
      upcomingEvents: 2,
    });
    expect(dashboard.recentUsers).toHaveLength(3);
    expect(dashboard.recentEvents).toHaveLength(3);
    expect(dashboard.monthlyActivity.some((point) => point.usersCreated > 0)).toBe(true);
    expect(dashboard.monthlyActivity.some((point) => point.eventsCreated > 0)).toBe(true);
  });

  it('returns typed users and events lists', async () => {
    const prisma = createPrismaMock();
    const users = await getAdminUsers(prisma);
    const events = await getAdminEvents(prisma);

    expect(users.total).toBe(3);
    expect(users.items[0]?.email).toBe('admin@example.com');
    expect(events.total).toBe(4);
    expect(events.items[0]?.authorName).toBe('Ada Admin');
  });

  it('updates admin user active state', async () => {
    const { prisma, state } = createUserMutationPrismaMock([
      {
        id: 1,
        email: 'admin@example.com',
        firstname: 'Ada',
        lastname: 'Admin',
        role: 'ADMIN',
        organisation: 'OFeed',
        active: true,
        createdAt: new Date('2026-03-05T10:00:00.000Z'),
      },
      {
        id: 2,
        email: 'user@example.com',
        firstname: 'Uma',
        lastname: 'User',
        role: 'USER',
        organisation: null,
        active: false,
        createdAt: new Date('2026-02-10T10:00:00.000Z'),
      },
    ]);

    const result = await updateAdminUserActive(prisma, {
      adminUserId: 1,
      targetUserId: 2,
      active: true,
    });

    expect(result.user.active).toBe(true);
    expect(state.users.find((user) => user.id === 2)?.active).toBe(true);
  });

  it('prevents deactivating the last active admin account', async () => {
    const { prisma } = createUserMutationPrismaMock([
      {
        id: 1,
        email: 'admin@example.com',
        firstname: 'Ada',
        lastname: 'Admin',
        role: 'ADMIN',
        organisation: 'OFeed',
        active: true,
        createdAt: new Date('2026-03-05T10:00:00.000Z'),
      },
      {
        id: 2,
        email: 'user@example.com',
        firstname: 'Uma',
        lastname: 'User',
        role: 'USER',
        organisation: null,
        active: true,
        createdAt: new Date('2026-02-10T10:00:00.000Z'),
      },
    ]);

    await expect(
      updateAdminUserActive(prisma, {
        adminUserId: 2,
        targetUserId: 1,
        active: false,
      }),
    ).rejects.toMatchObject({
      message: 'Cannot deactivate the last active admin account.',
      statusCode: 409,
    });
  });

  it('deletes admin user account and related auth data', async () => {
    const { prisma, state } = createUserMutationPrismaMock([
      {
        id: 1,
        email: 'admin@example.com',
        firstname: 'Ada',
        lastname: 'Admin',
        role: 'ADMIN',
        organisation: 'OFeed',
        active: true,
        createdAt: new Date('2026-03-05T10:00:00.000Z'),
      },
      {
        id: 2,
        email: 'user@example.com',
        firstname: 'Uma',
        lastname: 'User',
        role: 'USER',
        organisation: null,
        active: true,
        createdAt: new Date('2026-02-10T10:00:00.000Z'),
      },
    ]);

    const result = await deleteAdminUser(prisma, {
      adminUserId: 1,
      targetUserId: 2,
    });

    expect(result.user.id).toBe(2);
    expect(state.deletedUserIds).toEqual([2]);
    expect(state.users.find((user) => user.id === 2)).toBeUndefined();
    expect(state.deletedProtocolWhere).toEqual([{ authorId: 2 }]);
    expect(state.updatedEventWhere).toEqual([{ authorId: 2 }]);
    expect(state.deletedPasswordResetWhere).toEqual([{ email: 'user@example.com' }]);
    expect(state.deletedOauthClientWhere).toEqual([{ id: { in: ['client-1'] } }]);
  });
});
