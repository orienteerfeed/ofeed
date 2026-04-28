import {
  adminUserMutationResultSchema,
  adminDashboardSchema,
  adminEventListSchema,
  adminUserListSchema,
  type AdminDashboardActivityPoint,
  type AdminEventListItem,
  type AdminUserListItem,
} from '@repo/shared';

import { formatUtcDateTimeRfc3339 } from '../../utils/time.js';

const DASHBOARD_ACTIVITY_MONTHS = 6;
const DASHBOARD_RECENT_LIMIT = 8;
const LIST_LIMIT = 50;

class AdminUserActionError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'AdminUserActionError';
    this.statusCode = statusCode;
  }
}

export function isAdminUserActionError(error: unknown): error is AdminUserActionError {
  return error instanceof AdminUserActionError;
}

function getMonthStartUtc(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
}

function subtractUtcMonths(date: Date, months: number) {
  return getMonthStartUtc(date.getUTCFullYear(), date.getUTCMonth() - months);
}

function createMonthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function buildDashboardMonthStarts(referenceDate: Date) {
  const currentMonthStart = getMonthStartUtc(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
  );

  return Array.from({ length: DASHBOARD_ACTIVITY_MONTHS }, (_, index) =>
    subtractUtcMonths(currentMonthStart, DASHBOARD_ACTIVITY_MONTHS - index - 1),
  );
}

function buildMonthlyActivity({
  monthStarts,
  userDates,
  eventDates,
}: {
  monthStarts: Date[];
  userDates: Date[];
  eventDates: Date[];
}): AdminDashboardActivityPoint[] {
  const usersByMonth = new Map<string, number>();
  const eventsByMonth = new Map<string, number>();

  for (const createdAt of userDates) {
    const monthKey = createMonthKey(createdAt);
    usersByMonth.set(monthKey, (usersByMonth.get(monthKey) ?? 0) + 1);
  }

  for (const createdAt of eventDates) {
    const monthKey = createMonthKey(createdAt);
    eventsByMonth.set(monthKey, (eventsByMonth.get(monthKey) ?? 0) + 1);
  }

  return monthStarts.map((monthStart) => {
    const monthKey = createMonthKey(monthStart);

    return {
      monthStart,
      usersCreated: usersByMonth.get(monthKey) ?? 0,
      eventsCreated: eventsByMonth.get(monthKey) ?? 0,
    };
  });
}

function mapUserListItem(user: {
  id: number;
  email: string;
  firstname: string;
  lastname: string;
  role: 'USER' | 'ADMIN';
  organisation: string | null;
  active: boolean;
  createdAt: Date;
}): AdminUserListItem {
  return {
    id: user.id,
    email: user.email,
    firstname: user.firstname,
    lastname: user.lastname,
    role: user.role,
    organisation: user.organisation,
    active: user.active,
    createdAt: user.createdAt,
  };
}

function mapEventListItem(event: {
  id: string;
  name: string;
  organizer: string | null;
  date: Date;
  discipline:
    | 'SPRINT'
    | 'MIDDLE'
    | 'LONG'
    | 'ULTRALONG'
    | 'NIGHT'
    | 'KNOCKOUT_SPRINT'
    | 'RELAY'
    | 'SPRINT_RELAY'
    | 'TEAMS'
    | 'OTHER';
  published: boolean;
  ranking: boolean;
  createdAt: Date;
  author: {
    firstname: string;
    lastname: string;
  } | null;
}): AdminEventListItem {
  return {
    id: event.id,
    name: event.name,
    organizer: event.organizer,
    date: formatUtcDateTimeRfc3339(event.date) ?? event.date,
    discipline: event.discipline,
    published: event.published,
    ranking: event.ranking,
    authorName: event.author ? `${event.author.firstname} ${event.author.lastname}` : null,
    createdAt: event.createdAt,
  };
}

type AdminUserMutationContext = {
  adminUserId: number;
  targetUserId: number;
};

async function loadAdminUserForMutation(tx, targetUserId: number) {
  const user = await tx.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      email: true,
      firstname: true,
      lastname: true,
      role: true,
      organisation: true,
      active: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new AdminUserActionError('Admin user target not found', 404);
  }

  return user;
}

async function ensureAdminUserMutationAllowed(
  tx,
  context: AdminUserMutationContext,
  params: {
    action: 'delete' | 'deactivate';
    targetUser: Awaited<ReturnType<typeof loadAdminUserForMutation>>;
  },
) {
  if (context.adminUserId === context.targetUserId) {
    throw new AdminUserActionError('You cannot modify your own admin account in this action.', 400);
  }

  if (params.targetUser.role !== 'ADMIN' || !params.targetUser.active) {
    return;
  }

  const activeAdminCount = await tx.user.count({
    where: {
      role: 'ADMIN',
      active: true,
    },
  });

  if (activeAdminCount <= 1) {
    throw new AdminUserActionError(
      params.action === 'delete'
        ? 'Cannot delete the last active admin account.'
        : 'Cannot deactivate the last active admin account.',
      409,
    );
  }
}

export async function getAdminDashboard(prisma, referenceDate = new Date()) {
  const todayStart = new Date(referenceDate);
  todayStart.setHours(0, 0, 0, 0);

  const monthStarts = buildDashboardMonthStarts(referenceDate);
  const activityWindowStart = monthStarts[0] ?? subtractUtcMonths(referenceDate, 5);

  const [
    totalUsers,
    activeUsers,
    adminUsers,
    totalEvents,
    publishedEvents,
    rankingEvents,
    upcomingEvents,
    recentUsersRaw,
    recentEventsRaw,
    dashboardUserDates,
    dashboardEventDates,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { active: true } }),
    prisma.user.count({ where: { role: 'ADMIN' } }),
    prisma.event.count(),
    prisma.event.count({ where: { published: true } }),
    prisma.event.count({ where: { ranking: true } }),
    prisma.event.count({ where: { date: { gte: todayStart } } }),
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: DASHBOARD_RECENT_LIMIT,
      select: {
        id: true,
        email: true,
        firstname: true,
        lastname: true,
        role: true,
        organisation: true,
        active: true,
        createdAt: true,
      },
    }),
    prisma.event.findMany({
      orderBy: [{ createdAt: 'desc' }, { date: 'desc' }],
      take: DASHBOARD_RECENT_LIMIT,
      select: {
        id: true,
        name: true,
        organizer: true,
        date: true,
        discipline: true,
        published: true,
        ranking: true,
        createdAt: true,
        author: {
          select: {
            firstname: true,
            lastname: true,
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { createdAt: { gte: activityWindowStart } },
      select: { createdAt: true },
    }),
    prisma.event.findMany({
      where: { createdAt: { gte: activityWindowStart } },
      select: { createdAt: true },
    }),
  ]);

  return adminDashboardSchema.parse({
    summary: {
      totalUsers,
      activeUsers,
      adminUsers,
      totalEvents,
      publishedEvents,
      rankingEvents,
      upcomingEvents,
    },
    monthlyActivity: buildMonthlyActivity({
      monthStarts,
      userDates: dashboardUserDates.map((entry) => entry.createdAt),
      eventDates: dashboardEventDates.map((entry) => entry.createdAt),
    }),
    recentUsers: recentUsersRaw.map(mapUserListItem),
    recentEvents: recentEventsRaw.map(mapEventListItem),
  });
}

export async function getAdminUsers(
  prisma,
  { page = 1, limit = 25 }: { page?: number; limit?: number } = {},
) {
  const skip = (page - 1) * limit;

  const [total, users] = await Promise.all([
    prisma.user.count(),
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        email: true,
        firstname: true,
        lastname: true,
        role: true,
        organisation: true,
        active: true,
        createdAt: true,
      },
    }),
  ]);

  return adminUserListSchema.parse({
    total,
    items: users.map(mapUserListItem),
  });
}

export async function updateAdminUserActive(
  prisma,
  params: {
    adminUserId: number;
    targetUserId: number;
    active: boolean;
  },
) {
  return prisma.$transaction(async (tx) => {
    const targetUser = await loadAdminUserForMutation(tx, params.targetUserId);

    if (targetUser.active === params.active) {
      return adminUserMutationResultSchema.parse({
        user: mapUserListItem(targetUser),
      });
    }

    if (!params.active) {
      await ensureAdminUserMutationAllowed(
        tx,
        {
          adminUserId: params.adminUserId,
          targetUserId: params.targetUserId,
        },
        {
          action: 'deactivate',
          targetUser,
        },
      );
    }

    const updatedUser = await tx.user.update({
      where: { id: params.targetUserId },
      data: {
        active: params.active,
      },
      select: {
        id: true,
        email: true,
        firstname: true,
        lastname: true,
        role: true,
        organisation: true,
        active: true,
        createdAt: true,
      },
    });

    return adminUserMutationResultSchema.parse({
      user: mapUserListItem(updatedUser),
    });
  });
}

export async function deleteAdminUser(
  prisma,
  params: {
    adminUserId: number;
    targetUserId: number;
  },
) {
  return prisma.$transaction(async (tx) => {
    const targetUser = await loadAdminUserForMutation(tx, params.targetUserId);

    await ensureAdminUserMutationAllowed(
      tx,
      {
        adminUserId: params.adminUserId,
        targetUserId: params.targetUserId,
      },
      {
        action: 'delete',
        targetUser,
      },
    );

    const oauthClients = await tx.oAuthClient.findMany({
      where: { userId: params.targetUserId },
      select: { id: true },
    });

    const oauthClientIds = oauthClients.map((client) => client.id);

    await tx.oAuthAccessToken.deleteMany({
      where: {
        OR: [
          { userId: params.targetUserId },
          ...(oauthClientIds.length > 0 ? [{ clientId: { in: oauthClientIds } }] : []),
        ],
      },
    });
    await tx.oAuthAuthorizationCode.deleteMany({
      where: {
        OR: [
          { userId: params.targetUserId },
          ...(oauthClientIds.length > 0 ? [{ clientId: { in: oauthClientIds } }] : []),
        ],
      },
    });
    await tx.oAuthRefreshToken.deleteMany({
      where: {
        OR: [
          { userId: params.targetUserId },
          ...(oauthClientIds.length > 0 ? [{ clientId: { in: oauthClientIds } }] : []),
        ],
      },
    });

    if (oauthClientIds.length > 0) {
      await tx.oAuthGrant.deleteMany({
        where: { clientId: { in: oauthClientIds } },
      });
      await tx.oAuthScope.deleteMany({
        where: { clientId: { in: oauthClientIds } },
      });
      await tx.oAuthRedirectUri.deleteMany({
        where: { clientId: { in: oauthClientIds } },
      });
      await tx.oAuthClient.deleteMany({
        where: { id: { in: oauthClientIds } },
      });
    }

    await tx.protocol.deleteMany({
      where: { authorId: params.targetUserId },
    });
    await tx.event.updateMany({
      where: { authorId: params.targetUserId },
      data: { authorId: null },
    });
    await tx.passwordReset.deleteMany({
      where: { email: targetUser.email },
    });
    await tx.user.delete({
      where: { id: params.targetUserId },
    });

    return adminUserMutationResultSchema.parse({
      user: mapUserListItem(targetUser),
    });
  });
}

export async function getAdminEvents(
  prisma,
  { page = 1, limit = 25 }: { page?: number; limit?: number } = {},
) {
  const skip = (page - 1) * limit;

  const [total, events] = await Promise.all([
    prisma.event.count(),
    prisma.event.findMany({
      orderBy: [{ createdAt: 'desc' }, { date: 'desc' }],
      skip,
      take: limit,
      select: {
        id: true,
        name: true,
        organizer: true,
        date: true,
        discipline: true,
        published: true,
        ranking: true,
        createdAt: true,
        author: {
          select: {
            firstname: true,
            lastname: true,
          },
        },
      },
    }),
  ]);

  return adminEventListSchema.parse({
    total,
    items: events.map(mapEventListItem),
  });
}

export const __adminServiceInternals = {
  AdminUserActionError,
  buildDashboardMonthStarts,
  buildMonthlyActivity,
  createMonthKey,
};
