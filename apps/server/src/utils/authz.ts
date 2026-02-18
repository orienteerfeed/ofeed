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

const DEFAULT_OPTIONS: Required<Omit<EventOwnerOptions, "select">> = {
  unauthenticatedStatus: 401,
  unauthenticatedMessage: "Unauthorized: No credentials provided",
  invalidBasicStatus: 401,
  invalidBasicMessage: "Unauthorized: Basic credentials do not match this event",
  eventNotFoundStatus: 404,
  eventNotFoundMessage: "Event not found",
  forbiddenStatus: 403,
  forbiddenMessage: "Not authorized for this event",
};

export class AuthzError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "AuthzError";
    this.statusCode = statusCode;
  }
}

export function isAuthzError(error: unknown): error is AuthzError {
  return error instanceof AuthzError;
}

export const ensureEventOwner = async (prisma, auth, eventId, options: EventOwnerOptions = {}) => {
  const settings = { ...DEFAULT_OPTIONS, ...options };

  if (!auth || !auth.isAuthenticated) {
    throw new AuthzError(settings.unauthenticatedMessage, settings.unauthenticatedStatus);
  }

  if (auth.type === "eventBasic" && auth.eventId !== eventId) {
    throw new AuthzError(settings.invalidBasicMessage, settings.invalidBasicStatus);
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: options.select ? { ...options.select, authorId: true } : { authorId: true },
  });

  if (!event) {
    throw new AuthzError(settings.eventNotFoundMessage, settings.eventNotFoundStatus);
  }

  if (event.authorId !== auth.userId) {
    throw new AuthzError(settings.forbiddenMessage, settings.forbiddenStatus);
  }

  return { event, userId: auth.userId };
};

export const requireEventOwner = async (prisma, auth, eventId) => {
  return ensureEventOwner(prisma, auth, eventId);
};
