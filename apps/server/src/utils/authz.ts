export type EventOwnerOptions = {
  select?: Record<string, boolean>;
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

function normalizeAuthUserId(auth: { userId?: number | string } | null | undefined) {
  if (typeof auth?.userId === 'number') {
    return Number.isFinite(auth.userId) ? auth.userId : null;
  }

  if (typeof auth?.userId === 'string' && auth.userId.trim() !== '') {
    const parsedUserId = Number(auth.userId);
    return Number.isFinite(parsedUserId) ? parsedUserId : null;
  }

  return null;
}

async function resolveAuthenticatedUserRole(prisma, auth) {
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
  prisma,
  auth,
  eventId,
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

  const event = await prisma.event.findUnique({
    where: { id: normalizedEventId },
    select: options.select ? { ...options.select, authorId: true } : { authorId: true },
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

export const ensureEventOwner = async (prisma, auth, eventId, options: EventOwnerOptions = {}) => {
  return ensureEventOwnerAccess(prisma, auth, eventId, options, false);
};

export const ensureEventOwnerOrAdmin = async (
  prisma,
  auth,
  eventId,
  options: EventOwnerOptions = {},
) => {
  return ensureEventOwnerAccess(prisma, auth, eventId, options, true);
};

export const requireEventOwner = async (prisma, auth, eventId) => {
  return ensureEventOwner(prisma, auth, eventId);
};

export const requireEventOwnerOrAdmin = async (prisma, auth, eventId) => {
  return ensureEventOwnerOrAdmin(prisma, auth, eventId);
};

export const requireAdmin = async (prisma, auth, options: AdminOptions = {}) => {
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
