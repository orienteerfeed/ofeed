import type { AppPrismaClient } from '../../db/prisma-client.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { GraphQLAuthContext } from '../../graphql/context.types.js';
import {
  COMPETITORS_BY_CLASS_UPDATED,
  COMPETITOR_UPDATED,
  pubsub as defaultPubsub,
} from '../../lib/pubsub.js';
import { requireEventOwnerOrAdmin } from '../../utils/authz.js';
import { normalizeCountryAlpha2 } from '../../utils/country-code.js';
import { decorateCompetitorsWithCurrentCzechRankingState } from '../../utils/czech-ranking.js';
import {
  changeCompetitorStatus as changeEventCompetitorStatus,
  storeCompetitor,
  updateCompetitor,
} from '../event/event.service.js';
import {
  assertSplitPublicationAccessible,
  assertSplitPublicationAccessibleForCompetitor,
} from '../event/split-publication.service.js';
import { flattenOrganisation, organisationSelect } from '../event/organisation.helpers.js';
import type {
  CompetitorsByOrganisationInput,
  OrganisationNamesInput,
  OrganisationsInput,
  SearchOrganisationNamesInput,
  StatusChangeInput,
  StoreCompetitorInput,
  UpdateCompetitorInput,
} from './competitor.schema.js';

export type CompetitorFindUniqueSelection = Omit<Prisma.CompetitorFindUniqueArgs, 'where'>;
export type CompetitorFindManySelection = Omit<Prisma.CompetitorFindManyArgs, 'where'>;
export type OrganisationFindManySelection = Omit<Prisma.OrganisationFindManyArgs, 'where'>;

export type CompetitorsByClassUpdatedPayload = {
  competitorsByClassUpdated: Awaited<ReturnType<typeof findCompetitorsByClassWithLegacyShape>>;
};

export type CompetitorUpdatedPayload = {
  competitorUpdated: unknown;
};

function isNonNull<T>(value: T): value is NonNullable<T> {
  return value !== null && value !== undefined;
}

const competitorByIdLegacyClassSelect = {
  id: true,
  externalId: true,
  name: true,
  length: true,
  climb: true,
  controlsCount: true,
} as const;

export function findCompetitorById(
  prisma: AppPrismaClient,
  id: number,
  query: CompetitorFindUniqueSelection = {},
) {
  return prisma.competitor.findUnique({
    ...query,
    where: { id },
  });
}

export async function findCompetitorByIdWithLegacyShape(prisma: AppPrismaClient, id: number) {
  const competitor = await findCompetitorById(prisma, id, {
    include: {
      class: { select: competitorByIdLegacyClassSelect },
      organisation: { select: organisationSelect },
    },
  });

  return flattenOrganisation(competitor);
}

export async function findCompetitorsByClass(
  prisma: AppPrismaClient,
  classId: number,
  query: CompetitorFindManySelection = {},
) {
  try {
    const competitors = await prisma.competitor.findMany({
      ...query,
      where: { classId },
    });

    return decorateCompetitorsWithCurrentCzechRankingState(classId, competitors);
  } catch (error) {
    console.error('Error fetching competitors by class:', error);
    throw new Error('Failed to fetch competitors');
  }
}

export async function findCompetitorsByClassWithLegacyShape(
  prisma: AppPrismaClient,
  classId: number,
  includeSplits = false,
) {
  const competitors = await findCompetitorsByClass(prisma, classId, {
    include: {
      organisation: { select: organisationSelect },
      ...(includeSplits
        ? {
            splits: {
              select: {
                controlCode: true,
                time: true,
              },
              orderBy: { id: 'asc' },
            },
          }
        : {}),
    },
  });

  return competitors.map((competitor) => flattenOrganisation(competitor)).filter(isNonNull);
}

export function findCompetitorsByTeam(
  prisma: AppPrismaClient,
  teamId: number,
  query: CompetitorFindManySelection = {},
) {
  return prisma.competitor.findMany({
    ...query,
    where: { teamId },
  });
}

export async function findCompetitorsByTeamWithLegacyShape(
  prisma: AppPrismaClient,
  teamId: number,
) {
  const competitors = await findCompetitorsByTeam(prisma, teamId, {
    include: { organisation: { select: organisationSelect } },
  });

  return competitors.map((competitor) => flattenOrganisation(competitor)).filter(isNonNull);
}

export function findCompetitorsByOrganisation(
  prisma: AppPrismaClient,
  input: CompetitorsByOrganisationInput,
  query: CompetitorFindManySelection = {},
) {
  if (typeof input.organisationId !== 'number' && !input.organisation) {
    return prisma.competitor.findMany({
      ...query,
      where: {
        id: { in: [] },
      },
    });
  }

  const organisation = input.organisation;
  const where: Prisma.CompetitorWhereInput = {
    class: { is: { eventId: input.eventId } },
  };

  if (typeof input.organisationId === 'number') {
    where.organisationId = input.organisationId;
  } else if (organisation) {
    where.organisation = {
      is: {
        eventId: input.eventId,
        OR: [{ name: { equals: organisation } }, { shortName: { equals: organisation } }],
      },
    };
  }

  return prisma.competitor.findMany({
    ...query,
    where,
    orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
  });
}

export async function findCompetitorsByOrganisationWithLegacyShape(
  prisma: AppPrismaClient,
  input: CompetitorsByOrganisationInput,
) {
  const competitors = await findCompetitorsByOrganisation(prisma, input, {
    include: {
      class: true,
      organisation: { select: organisationSelect },
    },
  });

  return competitors.map((competitor) => flattenOrganisation(competitor)).filter(isNonNull);
}

export async function findOrganisationNamesByEvent(
  prisma: AppPrismaClient,
  input: OrganisationNamesInput,
) {
  const { eventId } = input;

  const rows = await prisma.competitor.groupBy({
    by: ['organisationId'],
    where: {
      class: { is: { eventId } },
      organisationId: { not: null },
    },
    _count: { organisationId: true },
    orderBy: { _count: { organisationId: 'desc' } },
  });

  const ids = rows
    .map((row) => row.organisationId)
    .filter((id): id is number => typeof id === 'number');
  if (ids.length === 0) {
    return [];
  }

  const organisations = await prisma.organisation.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, nationality: true },
  });
  const countryCodes = [
    ...new Set(
      organisations
        .map((organisation) => normalizeCountryAlpha2(organisation.nationality))
        .filter(isNonNull),
    ),
  ];
  const countries =
    countryCodes.length > 0
      ? await prisma.country.findMany({
          where: { countryCode: { in: countryCodes } },
          select: { countryCode: true, countryName: true },
        })
      : [];
  const countryNameByCode = new Map(
    countries.map((country) => [country.countryCode, country.countryName]),
  );
  const organisationById = new Map(
    organisations.map((organisation) => {
      const countryCode = normalizeCountryAlpha2(organisation.nationality);
      return [
        organisation.id,
        {
          name: organisation.name,
          countryCode,
          country: countryCode ? (countryNameByCode.get(countryCode) ?? countryCode) : null,
        },
      ];
    }),
  );

  return rows
    .map((row) => {
      const organisation = row.organisationId ? organisationById.get(row.organisationId) : null;
      return {
        id: row.organisationId,
        name: organisation?.name ?? null,
        countryCode: organisation?.countryCode ?? null,
        country: organisation?.country ?? null,
        competitors: row._count.organisationId,
      };
    })
    .filter(
      (
        row,
      ): row is {
        id: number;
        name: string;
        countryCode: string | null;
        country: string | null;
        competitors: number;
      } => Boolean(row.name),
    );
}

export async function searchOrganisationNamesByEvent(
  prisma: AppPrismaClient,
  input: SearchOrganisationNamesInput,
) {
  const { eventId, q } = input;

  const rows = await prisma.organisation.findMany({
    where: { eventId, name: { contains: q } },
    select: { name: true },
    distinct: ['name'],
    orderBy: { name: 'asc' },
    take: 20,
  });

  return rows.map((row) => ({ name: row.name, competitors: 0 }));
}

export function findOrganisationsByEvent(
  prisma: AppPrismaClient,
  input: OrganisationsInput,
  query: OrganisationFindManySelection = {},
) {
  return prisma.organisation.findMany({
    ...query,
    where: { eventId: input.eventId },
    orderBy: { name: 'asc' },
  });
}

export async function findCompetitorSplits(
  prisma: AppPrismaClient,
  auth: GraphQLAuthContext,
  competitor: { id: number; classId?: number | null },
) {
  const splitPublicationAuth = auth as Parameters<typeof assertSplitPublicationAccessible>[1];

  if (typeof competitor.classId === 'number') {
    await assertSplitPublicationAccessible(prisma, splitPublicationAuth, competitor.classId);
  } else {
    await assertSplitPublicationAccessibleForCompetitor(
      prisma,
      splitPublicationAuth,
      competitor.id,
    );
  }

  return prisma.split.findMany({
    where: { competitorId: competitor.id },
    orderBy: { time: 'asc' },
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  return 'Unexpected error';
}

export async function changeCompetitorStatusForGraphQL(
  prisma: AppPrismaClient,
  auth: GraphQLAuthContext,
  input: StatusChangeInput,
) {
  const { eventId, competitorId, origin, status } = input;
  const { userId } = await requireEventOwnerOrAdmin(prisma, auth, eventId);

  try {
    const statusChangeMessage = await changeEventCompetitorStatus(
      eventId,
      competitorId,
      origin,
      status,
      userId,
    );

    return {
      message: statusChangeMessage,
    };
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function updateCompetitorForGraphQL(
  prisma: AppPrismaClient,
  auth: GraphQLAuthContext,
  input: UpdateCompetitorInput,
) {
  const { eventId, competitorId, origin } = input;
  const { userId } = await requireEventOwnerOrAdmin(prisma, auth, eventId);

  const fieldTypes: Record<string, 'number' | 'string' | 'boolean' | 'date'> = {
    classId: 'number',
    firstname: 'string',
    lastname: 'string',
    nationality: 'string',
    registration: 'string',
    license: 'string',
    organisation: 'string',
    shortName: 'string',
    card: 'number',
    bibNumber: 'number',
    startTime: 'date',
    finishTime: 'date',
    time: 'number',
    status: 'string',
    lateStart: 'boolean',
    teamId: 'number',
    leg: 'number',
    note: 'string',
    externalId: 'string',
  };

  const updateData = Object.keys(input).reduce<Record<string, unknown>>((acc, field) => {
    const inputValue = input[field as keyof UpdateCompetitorInput];
    const fieldType = fieldTypes[field];

    if (inputValue !== undefined && fieldType) {
      switch (fieldType) {
        case 'number':
          acc[field] = parseInt(String(inputValue), 10);
          break;
        case 'boolean':
          acc[field] = Boolean(inputValue);
          break;
        case 'date':
          acc[field] = new Date(inputValue as string | Date);
          break;
        default:
          acc[field] = inputValue;
      }
    }

    return acc;
  }, {});

  try {
    const updateCompetitorMessage = await updateCompetitor(
      eventId,
      competitorId,
      origin,
      updateData,
      userId,
    );

    return {
      message: updateCompetitorMessage.message,
    };
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function createCompetitorForGraphQL(
  prisma: AppPrismaClient,
  auth: GraphQLAuthContext,
  input: StoreCompetitorInput,
) {
  const { eventId, origin, ...competitorData } = input;
  const { userId } = await requireEventOwnerOrAdmin(prisma, auth, eventId);

  try {
    const storeCompetitorResponse = await storeCompetitor(eventId, competitorData, userId, origin);

    return {
      message: 'Competitor successfully added',
      competitor: storeCompetitorResponse.competitor,
    };
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function* subscribeCompetitorsByClassUpdated(
  prisma: AppPrismaClient,
  classId: number,
  pubsub: typeof defaultPubsub = defaultPubsub,
): AsyncIterable<CompetitorsByClassUpdatedPayload> {
  yield {
    competitorsByClassUpdated: await findCompetitorsByClassWithLegacyShape(prisma, classId, false),
  };

  const topic = `${COMPETITORS_BY_CLASS_UPDATED}_${classId}`;
  const asyncIterableIterator = pubsub.asyncIterableIterator([
    topic,
  ]) as AsyncIterable<CompetitorsByClassUpdatedPayload>;

  for await (const payload of asyncIterableIterator) {
    yield payload;
  }
}

export function subscribeCompetitorUpdated(
  eventId: string,
  pubsub: typeof defaultPubsub = defaultPubsub,
) {
  return pubsub.asyncIterableIterator(
    `${COMPETITOR_UPDATED}_${eventId}`,
  ) as AsyncIterable<CompetitorUpdatedPayload>;
}
