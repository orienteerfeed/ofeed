import type { EventConnectionCheckBody } from './event.schema.js';

type ConnectionCheckAuthContext =
  | {
      isAuthenticated?: boolean;
      type?: 'jwt' | 'eventBasic' | null;
      eventId?: string;
      failureReason?: string;
    }
  | null
  | undefined;

type PrismaLike = {
  event: {
    findUnique: (args: Record<string, unknown>) => Promise<{
      id: string;
      name: string | null;
    } | null>;
  };
  eventPassword: {
    findUnique: (args: Record<string, unknown>) => Promise<{
      expiresAt: Date | string;
    } | null>;
  };
  class: {
    findMany: (args: Record<string, unknown>) => Promise<
      Array<{
        id: number;
        externalId: string | null;
        name: string;
        eventId: string;
      }>
    >;
  };
  competitor: {
    findMany: (args: Record<string, unknown>) => Promise<
      Array<{
        id: number;
        externalId: string | null;
        firstname: string | null;
        lastname: string | null;
        classId: number;
        class: {
          id: number;
          externalId: string | null;
          name: string;
        } | null;
      }>
    >;
  };
};

type ConnectionStatus = 'matched' | 'remapped' | 'missing' | 'mismatch' | 'wrong_class';

type ResolvedClass = {
  id: number;
  externalId: string | null;
  name: string;
};

type ResolvedCompetitor = {
  id: number;
  externalId: string | null;
  firstname: string | null;
  lastname: string | null;
  classId: number;
  classExternalId: string | null;
  className: string | null;
};

function uniqueNumbers(values: Array<number | undefined>) {
  return Array.from(new Set(values.filter((value): value is number => typeof value === 'number')));
}

function uniqueStrings(values: Array<string | undefined>) {
  return Array.from(
    new Set(
      values.filter((value): value is string => typeof value === 'string' && value.length > 0),
    ),
  );
}

function resolveCredentials(authContext: ConnectionCheckAuthContext, eventId: string) {
  if (authContext?.isAuthenticated && authContext.type === 'eventBasic') {
    if (authContext.eventId === eventId) {
      return {
        valid: true,
        reason: null,
        authType: authContext.type,
      };
    }

    return {
      valid: false,
      reason: 'basic_event_id_mismatch',
      authType: authContext.type,
    };
  }

  if (authContext?.isAuthenticated && authContext.type === 'jwt') {
    return {
      valid: false,
      reason: 'basic_auth_required',
      authType: authContext.type,
    };
  }

  return {
    valid: false,
    reason: authContext?.failureReason ?? 'missing_authorization_header',
    authType: authContext?.type ?? null,
  };
}

function toResolvedClass(entity: ResolvedClass | null | undefined) {
  if (!entity) {
    return null;
  }

  return {
    id: entity.id,
    externalId: entity.externalId,
    name: entity.name,
  };
}

function toResolvedCompetitor(
  entity:
    | {
        id: number;
        externalId: string | null;
        firstname: string | null;
        lastname: string | null;
        classId: number;
        class: {
          id: number;
          externalId: string | null;
          name: string;
        } | null;
      }
    | null
    | undefined,
): ResolvedCompetitor | null {
  if (!entity) {
    return null;
  }

  return {
    id: entity.id,
    externalId: entity.externalId,
    firstname: entity.firstname,
    lastname: entity.lastname,
    classId: entity.classId,
    classExternalId: entity.class?.externalId ?? null,
    className: entity.class?.name ?? null,
  };
}

function resolveClassMatch(
  requested: { id?: number; externalId?: string },
  classById: Map<number, ResolvedClass>,
  classByExternalId: Map<string, ResolvedClass>,
) {
  const matchById = requested.id !== undefined ? (classById.get(requested.id) ?? null) : null;
  const matchByExternalId =
    requested.externalId !== undefined
      ? (classByExternalId.get(requested.externalId) ?? null)
      : null;

  if (requested.id !== undefined && requested.externalId !== undefined) {
    if (matchById && matchByExternalId) {
      if (matchById.id === matchByExternalId.id) {
        return {
          valid: true,
          status: 'matched' as ConnectionStatus,
          reason: null,
          resolved: matchById,
        };
      }

      return {
        valid: false,
        status: 'mismatch' as ConnectionStatus,
        reason: 'id_external_id_mismatch',
        resolved: null,
      };
    }

    if (matchById || matchByExternalId) {
      return {
        valid: true,
        status: 'remapped' as ConnectionStatus,
        reason: 'stale_reference',
        resolved: matchById ?? matchByExternalId,
      };
    }

    return {
      valid: false,
      status: 'missing' as ConnectionStatus,
      reason: 'not_found',
      resolved: null,
    };
  }

  if (matchById || matchByExternalId) {
    return {
      valid: true,
      status: 'matched' as ConnectionStatus,
      reason: null,
      resolved: matchById ?? matchByExternalId,
    };
  }

  return {
    valid: false,
    status: 'missing' as ConnectionStatus,
    reason: 'not_found',
    resolved: null,
  };
}

function resolveCompetitorClassMatch(
  requested: { classId?: number; classExternalId?: string },
  resolvedCompetitor: {
    class: {
      id: number;
      externalId: string | null;
      name: string;
    } | null;
  },
  classById: Map<number, ResolvedClass>,
  classByExternalId: Map<string, ResolvedClass>,
) {
  if (requested.classId === undefined && requested.classExternalId === undefined) {
    return null;
  }

  const resolvedClass = resolvedCompetitor.class;
  const requestedMatch = resolveClassMatch(
    {
      id: requested.classId,
      externalId: requested.classExternalId,
    },
    classById,
    classByExternalId,
  );

  if (!requestedMatch.resolved || !resolvedClass) {
    return {
      valid: false,
      status: requestedMatch.status,
      reason: requestedMatch.reason,
      resolved: toResolvedClass(requestedMatch.resolved),
    };
  }

  if (requestedMatch.resolved.id !== resolvedClass.id) {
    return {
      valid: false,
      status: 'wrong_class' as ConnectionStatus,
      reason: 'competitor_class_mismatch',
      resolved: toResolvedClass({
        id: resolvedClass.id,
        externalId: resolvedClass.externalId,
        name: resolvedClass.name,
      }),
    };
  }

  return {
    valid: true,
    status: requestedMatch.status,
    reason: requestedMatch.reason,
    resolved: toResolvedClass(requestedMatch.resolved),
  };
}

function resolveCompetitorMatch(
  requested: {
    id?: number;
    externalId?: string;
    classId?: number;
    classExternalId?: string;
  },
  competitorById: Map<
    number,
    {
      id: number;
      externalId: string | null;
      firstname: string | null;
      lastname: string | null;
      classId: number;
      class: {
        id: number;
        externalId: string | null;
        name: string;
      } | null;
    }
  >,
  competitorByExternalId: Map<
    string,
    {
      id: number;
      externalId: string | null;
      firstname: string | null;
      lastname: string | null;
      classId: number;
      class: {
        id: number;
        externalId: string | null;
        name: string;
      } | null;
    }
  >,
  classById: Map<number, ResolvedClass>,
  classByExternalId: Map<string, ResolvedClass>,
) {
  const matchById = requested.id !== undefined ? (competitorById.get(requested.id) ?? null) : null;
  const matchByExternalId =
    requested.externalId !== undefined
      ? (competitorByExternalId.get(requested.externalId) ?? null)
      : null;

  let resolvedCompetitor = null as ReturnType<typeof toResolvedCompetitor>;
  let valid = false;
  let status: ConnectionStatus = 'missing';
  let reason: string | null = 'not_found';

  if (requested.id !== undefined && requested.externalId !== undefined) {
    if (matchById && matchByExternalId) {
      if (matchById.id === matchByExternalId.id) {
        resolvedCompetitor = toResolvedCompetitor(matchById);
        valid = true;
        status = 'matched';
        reason = null;
      } else {
        status = 'mismatch';
        reason = 'id_external_id_mismatch';
      }
    } else if (matchById || matchByExternalId) {
      resolvedCompetitor = toResolvedCompetitor(matchById ?? matchByExternalId);
      valid = true;
      status = 'remapped';
      reason = 'stale_reference';
    }
  } else if (matchById || matchByExternalId) {
    resolvedCompetitor = toResolvedCompetitor(matchById ?? matchByExternalId);
    valid = true;
    status = 'matched';
    reason = null;
  }

  const resolvedEntity = matchById ?? matchByExternalId;
  const classCheck =
    resolvedEntity !== null
      ? resolveCompetitorClassMatch(requested, resolvedEntity, classById, classByExternalId)
      : requested.classId !== undefined || requested.classExternalId !== undefined
        ? {
            valid: false,
            status: 'missing' as ConnectionStatus,
            reason: 'competitor_not_found',
            resolved: null,
          }
        : null;

  if (classCheck && !classCheck.valid) {
    valid = false;
    if (status === 'matched' || status === 'remapped') {
      status = classCheck.status;
      reason = classCheck.reason;
    }
  }

  return {
    valid,
    status,
    reason,
    resolved: resolvedCompetitor,
    class: classCheck,
  };
}

export async function validateEventConnection(
  prismaClient: PrismaLike,
  eventId: string,
  authContext: ConnectionCheckAuthContext,
  body: EventConnectionCheckBody,
) {
  const event = await prismaClient.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      name: true,
    },
  });

  const credentials = resolveCredentials(authContext, eventId);
  const eventPassword = credentials.valid
    ? await prismaClient.eventPassword.findUnique({
        where: { eventId },
        select: {
          expiresAt: true,
        },
      })
    : null;

  const classIds = uniqueNumbers([
    ...body.classes.map((item) => item.id),
    ...body.competitors.map((item) => item.classId),
  ]);
  const classExternalIds = uniqueStrings([
    ...body.classes.map((item) => item.externalId),
    ...body.competitors.map((item) => item.classExternalId),
  ]);

  const classes =
    event && (classIds.length > 0 || classExternalIds.length > 0)
      ? await prismaClient.class.findMany({
          where: {
            eventId,
            OR: [
              ...(classIds.length > 0 ? [{ id: { in: classIds } }] : []),
              ...(classExternalIds.length > 0 ? [{ externalId: { in: classExternalIds } }] : []),
            ],
          },
          select: {
            id: true,
            externalId: true,
            name: true,
            eventId: true,
          },
        })
      : [];

  const classById = new Map(classes.map((item) => [item.id, item]));
  const classByExternalId = new Map(
    classes.filter((item) => item.externalId).map((item) => [item.externalId as string, item]),
  );

  const competitorIds = uniqueNumbers(body.competitors.map((item) => item.id));
  const competitorExternalIds = uniqueStrings(body.competitors.map((item) => item.externalId));

  const competitors =
    event && (competitorIds.length > 0 || competitorExternalIds.length > 0)
      ? await prismaClient.competitor.findMany({
          where: {
            class: { eventId },
            OR: [
              ...(competitorIds.length > 0 ? [{ id: { in: competitorIds } }] : []),
              ...(competitorExternalIds.length > 0
                ? [{ externalId: { in: competitorExternalIds } }]
                : []),
            ],
          },
          select: {
            id: true,
            externalId: true,
            firstname: true,
            lastname: true,
            classId: true,
            class: {
              select: {
                id: true,
                externalId: true,
                name: true,
              },
            },
          },
        })
      : [];

  const competitorById = new Map(competitors.map((item) => [item.id, item]));
  const competitorByExternalId = new Map(
    competitors.filter((item) => item.externalId).map((item) => [item.externalId as string, item]),
  );

  const classItems = body.classes.map((item) => {
    const match = resolveClassMatch(item, classById, classByExternalId);

    return {
      ref: item.ref ?? null,
      requested: {
        ...(item.id !== undefined ? { id: item.id } : {}),
        ...(item.externalId !== undefined ? { externalId: item.externalId } : {}),
      },
      valid: match.valid,
      status: match.status,
      reason: match.reason,
      resolved: toResolvedClass(match.resolved),
    };
  });

  const competitorItems = body.competitors.map((item) => {
    const match = resolveCompetitorMatch(
      item,
      competitorById,
      competitorByExternalId,
      classById,
      classByExternalId,
    );

    return {
      ref: item.ref ?? null,
      requested: {
        ...(item.id !== undefined ? { id: item.id } : {}),
        ...(item.externalId !== undefined ? { externalId: item.externalId } : {}),
        ...(item.classId !== undefined ? { classId: item.classId } : {}),
        ...(item.classExternalId !== undefined ? { classExternalId: item.classExternalId } : {}),
      },
      valid: match.valid,
      status: match.status,
      reason: match.reason,
      resolved: match.resolved,
      class: match.class,
    };
  });

  const classesValid = classItems.every((item) => item.valid);
  const competitorsValid = competitorItems.every((item) => item.valid);

  return {
    valid: Boolean(event) && credentials.valid && classesValid && competitorsValid,
    event: event
      ? {
          id: event.id,
          name: event.name,
        }
      : null,
    credentials: {
      valid: credentials.valid,
      reason: credentials.reason,
      authType: credentials.authType,
      expiresAt:
        credentials.valid && eventPassword?.expiresAt
          ? new Date(eventPassword.expiresAt).toISOString()
          : null,
    },
    classes: {
      valid: classesValid,
      items: classItems,
    },
    competitors: {
      valid: competitorsValid,
      items: competitorItems,
    },
  };
}
