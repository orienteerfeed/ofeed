import type { Prisma } from '../generated/prisma/client.js';

export type AuthzAuthContext = {
  isAuthenticated: boolean;
  type?: 'jwt' | 'eventBasic' | null;
  userId?: number | string;
  eventId?: string;
};

type AuthzPrismaClient = {
  user: {
    findUnique: (args: {
      where: { id: number };
      select: { role: true };
    }) => Promise<{ role: string } | null> | { role: string } | null;
  };
  event: {
    findUnique: (args: {
      where: { id: string };
      select: Prisma.EventSelect;
    }) =>
      | Promise<({ authorId: number | null } & Record<string, unknown>) | null>
      | (({ authorId: number | null } & Record<string, unknown>) | null);
  };
};

export type EventOwnerOptions = {
  select?: Prisma.EventSelect;
  unauthenticatedStatus?: number;
  unauthenticatedMessage?: string;
  invalidBasicStatus?: number;
  invalidBasicMessage?: string;
  eventNotFoundStatus?: number;
  eventNotFoundMessage?: string;
  forbiddenStatus?: number;
  forbiddenMessage?: string;
};

export type AdminOptions = {
  unauthenticatedStatus?: number;
  unauthenticatedMessage?: string;
  forbiddenStatus?: number;
  forbiddenMessage?: string;
};

const DEFAULT_OPTIONS: Required<Omit<EventOwnerOptions, 'select'>> = {
  unauthenticatedStatus: 401,
  unauthenticatedMessage: 'Unauthorized: No credentials provided',
  invalidBasicStatus: 401,
  invalidBasicMessage: 'Unauthorized: Basic credentials do not match this event',
  eventNotFoundStatus: 404,
  eventNotFoundMessage: 'Event not found',
  forbiddenStatus: 403,
  forbiddenMessage: 'Not authorized for this event',
};

const DEFAULT_ADMIN_OPTIONS: Required<AdminOptions> = {
  unauthenticatedStatus: 401,
  unauthenticatedMessage: 'Unauthorized: No credentials provided',
  forbiddenStatus: 403,
  forbiddenMessage: 'Admin access required',
};

const ADMIN_ROLE = 'ADMIN';

export class AuthzError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'AuthzError';
    this.statusCode = statusCode;
  }
}

export function isAuthzError(error: unknown): error is AuthzError {
  return error instanceof AuthzError;
}

function normalizeAuthUserId(auth: AuthzAuthContext | null | undefined) {
  if (!auth || !('userId' in auth)) {
    return null;
  }

  if (typeof auth.userId === 'number') {
    return Number.isFinite(auth.userId) ? auth.userId : null;
  }

  if (typeof auth?.userId === 'string' && auth.userId.trim() !== '') {
    const parsedUserId = Number(auth.userId);
    return Number.isFinite(parsedUserId) ? parsedUserId : null;
  }

  return null;
}

async function resolveAuthenticatedUserRole(
  prisma: AuthzPrismaClient,
  auth: AuthzAuthContext | null | undefined,
) {
  const userId = normalizeAuthUserId(auth);

  if (userId === null) {
    return { userId: null, role: null };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  return {
    userId,
    role: user?.role ?? null,
  };
}

async function ensureEventOwnerAccess(
  prisma: AuthzPrismaClient,
  auth: AuthzAuthContext | null | undefined,
  eventId: string | number,
  options: EventOwnerOptions = {},
  allowAdmin = false,
) {
  const settings = { ...DEFAULT_OPTIONS, ...options };
  const normalizedEventId = String(eventId);

  if (!auth || !auth.isAuthenticated) {
    throw new AuthzError(settings.unauthenticatedMessage, settings.unauthenticatedStatus);
  }

  if (auth.type === 'eventBasic' && auth.eventId !== normalizedEventId) {
    throw new AuthzError(settings.invalidBasicMessage, settings.invalidBasicStatus);
  }

  const select: Prisma.EventSelect = options.select
    ? { ...options.select, authorId: true }
    : { authorId: true };

  const event = await prisma.event.findUnique({
    where: { id: normalizedEventId },
    select,
  });

  if (!event) {
    throw new AuthzError(settings.eventNotFoundMessage, settings.eventNotFoundStatus);
  }

  const { userId, role } = await resolveAuthenticatedUserRole(prisma, auth);

  if (userId === null) {
    throw new AuthzError(settings.unauthenticatedMessage, settings.unauthenticatedStatus);
  }

  const isEventOwner = event.authorId !== null && userId !== null && event.authorId === userId;
  const isAdmin = allowAdmin && auth.type === 'jwt' && role === ADMIN_ROLE;

  if (!isEventOwner && !isAdmin) {
    throw new AuthzError(settings.forbiddenMessage, settings.forbiddenStatus);
  }

  return { event, userId, role, isAdmin, isEventOwner };
}

export const ensureEventOwner = async (
  prisma: AuthzPrismaClient,
  auth: AuthzAuthContext | null | undefined,
  eventId: string | number,
  options: EventOwnerOptions = {},
) => {
  return ensureEventOwnerAccess(prisma, auth, eventId, options, false);
};

export const ensureEventOwnerOrAdmin = async (
  prisma: AuthzPrismaClient,
  auth: AuthzAuthContext | null | undefined,
  eventId: string | number,
  options: EventOwnerOptions = {},
) => {
  return ensureEventOwnerAccess(prisma, auth, eventId, options, true);
};

export const requireEventOwner = async (
  prisma: AuthzPrismaClient,
  auth: AuthzAuthContext | null | undefined,
  eventId: string | number,
) => {
  return ensureEventOwner(prisma, auth, eventId);
};

export const requireEventOwnerOrAdmin = async (
  prisma: AuthzPrismaClient,
  auth: AuthzAuthContext | null | undefined,
  eventId: string | number,
) => {
  return ensureEventOwnerOrAdmin(prisma, auth, eventId);
};

export const requireAdmin = async (
  prisma: AuthzPrismaClient,
  auth: AuthzAuthContext | null | undefined,
  options: AdminOptions = {},
) => {
  const settings = { ...DEFAULT_ADMIN_OPTIONS, ...options };

  if (!auth || !auth.isAuthenticated) {
    throw new AuthzError(settings.unauthenticatedMessage, settings.unauthenticatedStatus);
  }

  if (auth.type !== 'jwt') {
    throw new AuthzError(settings.forbiddenMessage, settings.forbiddenStatus);
  }

  const { userId, role } = await resolveAuthenticatedUserRole(prisma, auth);

  if (userId === null || role !== ADMIN_ROLE) {
    throw new AuthzError(settings.forbiddenMessage, settings.forbiddenStatus);
  }

  return {
    userId,
    role,
    isAdmin: true,
  };
};
