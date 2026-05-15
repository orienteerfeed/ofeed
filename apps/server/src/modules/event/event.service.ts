import { DatabaseError, ValidationError } from '../../exceptions/index.js';
import type { AppPrismaClient } from '../../db/prisma-client.js';
import { Prisma, type Event as PrismaEvent } from '../../generated/prisma/client.js';
import type { Origin, ProtocolType, ResultStatus } from '../../generated/prisma/enums.js';
import { WINNER_UPDATED, pubsub as defaultPubsub } from '../../lib/pubsub.js';
import prisma from '../../utils/context.js';
import { decodeBase64, decrypt } from '../../lib/crypto/encryption.js';
import { createShortCompetitorHash } from '../../utils/hashUtils.js';
import { requireEventOwnerOrAdmin, type AuthzAuthContext } from '../../utils/authz.js';
import {
  publishUpdatedCompetitor,
  publishUpdatedCompetitors,
} from '../../utils/subscriptionUtils.js';
import {
  flattenOrganisation,
  organisationSelect,
  upsertOrganisation,
} from './organisation.helpers.js';
import {
  eventSlugMaxLength,
  eventSlugMinLength,
  eventSlugPattern,
  eventGeneratedIdSlugPattern,
  reservedEventSlugs,
  type EventFilter,
  type EventsInput,
} from './event.schema.js';
import type {
  StatusChangeInput,
  StoreCompetitorInput,
  UpdateCompetitorInput,
} from '../competitor/competitor.schema.js';

export type EventFindUniqueSelection = Omit<Prisma.EventFindUniqueArgs, 'where'>;
export type EventFindManySelection = Omit<Prisma.EventFindManyArgs, 'where'>;

export type EventConnectionNode =
  | Prisma.EventGetPayload<{
      include: {
        sport: true;
        country: true;
        classes: true;
      };
    }>
  | Record<string, unknown>;

export type EventConnection = {
  edges: Array<{
    node: EventConnectionNode;
    cursor: string;
  }>;
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor: string | null;
    endCursor: string | null;
  };
};

export type WinnerNotification = {
  eventId: string;
  classId: number;
  className: string;
  name: string;
};

export type EventVisibilityUpdateResult = {
  message: string;
  event: PrismaEvent | null;
};

export type EventSlugAvailabilityReason =
  | 'TOO_SHORT'
  | 'TOO_LONG'
  | 'INVALID_FORMAT'
  | 'RESERVED'
  | 'TAKEN';

export type EventSlugAvailability = {
  slug: string;
  available: boolean;
  reason: EventSlugAvailabilityReason | null;
};

export type WinnerUpdatedPayload = {
  winnerUpdated: WinnerNotification;
};

type ProtocolChange = {
  type: ProtocolType;
  previousValue: string | null;
  newValue: string;
};

type UpdateCompetitorData = Omit<UpdateCompetitorInput, 'eventId' | 'competitorId' | 'origin'> &
  Record<string, unknown>;

type StoreCompetitorData = Omit<StoreCompetitorInput, 'eventId' | 'origin'> &
  Record<string, unknown>;

type OrganisationSummary = {
  name?: string | null;
  shortName?: string | null;
};

type OrganisationBackedRecord = Record<string, unknown> & {
  organisation?: OrganisationSummary | null;
};

function toIntegerId(id: string | number): number {
  return typeof id === 'number' ? id : parseInt(id, 10);
}

function flattenOrganisationRecord(
  record: OrganisationBackedRecord | null | undefined,
): (Record<string, unknown> & { organisation: string | null; shortName: string | null }) | null {
  if (!record) return null;
  const { organisation, ...rest } = record;
  return {
    ...rest,
    organisation: organisation?.name ?? null,
    shortName: organisation?.shortName ?? null,
  };
}

export function findEventById(
  prisma: AppPrismaClient,
  id: string,
  query: EventFindUniqueSelection = {},
) {
  return prisma.event
    .findUnique({
      ...query,
      where: { id },
    })
    .then((event) => {
      if (event) {
        return event;
      }

      return prisma.event.findUnique({
        ...query,
        where: { slug: id },
      });
    });
}

export function normalizeEventSlug(slug: string): string {
  return slug
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function getEventSlugValidationReason(slug: string): EventSlugAvailabilityReason | null {
  if (slug.length < eventSlugMinLength) {
    return 'TOO_SHORT';
  }

  if (slug.length > eventSlugMaxLength) {
    return 'TOO_LONG';
  }

  if (!eventSlugPattern.test(slug)) {
    return 'INVALID_FORMAT';
  }

  if (eventGeneratedIdSlugPattern.test(slug)) {
    return 'RESERVED';
  }

  if (reservedEventSlugs.has(slug)) {
    return 'RESERVED';
  }

  return null;
}

export async function getEventSlugAvailability(
  prisma: AppPrismaClient,
  rawSlug: string,
  currentEventId?: string,
): Promise<EventSlugAvailability> {
  const slug = normalizeEventSlug(rawSlug);
  const validationReason = getEventSlugValidationReason(slug);

  if (validationReason) {
    return {
      slug,
      available: false,
      reason: validationReason,
    };
  }

  const existingEvent = await prisma.event.findFirst({
    where: {
      OR: [{ slug, ...(currentEventId ? { id: { not: currentEventId } } : {}) }, { id: slug }],
    },
    select: { id: true },
  });

  return {
    slug,
    available: !existingEvent,
    reason: existingEvent ? 'TAKEN' : null,
  };
}

export async function updateEventSlug(
  prisma: AppPrismaClient,
  auth: AuthzAuthContext | null | undefined,
  eventId: string,
  rawSlug: string | null | undefined,
) {
  await requireEventOwnerOrAdmin(prisma, auth, eventId);

  if (!rawSlug) {
    return prisma.event.update({
      where: { id: eventId },
      data: { slug: null, updatedAt: new Date() },
    });
  }

  const availability = await getEventSlugAvailability(prisma, rawSlug, eventId);

  if (!availability.available) {
    throw new ValidationError(`Event slug is not available: ${availability.reason}`);
  }

  return prisma.event.update({
    where: { id: eventId },
    data: { slug: availability.slug, updatedAt: new Date() },
  });
}

export function findEventsBySport(
  prisma: AppPrismaClient,
  sportId: number,
  query: EventFindManySelection = {},
) {
  return prisma.event.findMany({
    ...query,
    where: { sportId },
  });
}

export function findEventsByUser(
  prisma: AppPrismaClient,
  userId: number,
  query: EventFindManySelection = {},
) {
  return prisma.event.findMany({
    ...query,
    where: { authorId: userId },
  });
}

export function searchPublishedEvents(prisma: AppPrismaClient, query: string) {
  return prisma.$queryRaw<PrismaEvent[]>`
    SELECT * FROM Event
    WHERE published = true
      AND MATCH(name, location, organizer) AGAINST(${query} IN BOOLEAN MODE);
  `;
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

  return undefined;
}

export async function updateEventVisibility(
  prisma: AppPrismaClient,
  auth: AuthzAuthContext | null | undefined,
  eventId: string,
  published: boolean,
): Promise<EventVisibilityUpdateResult> {
  try {
    await requireEventOwnerOrAdmin(prisma, auth, eventId);

    const event = await prisma.event.update({
      where: { id: eventId },
      data: { published, updatedAt: new Date() },
    });

    return {
      message: `Event visibility updated to ${published ? 'Public' : 'Private'}`,
      event,
    };
  } catch (error) {
    console.error('Error updating event visibility:', error);
    throw new Error(getErrorMessage(error) || 'Failed to update event visibility.');
  }
}

export function subscribeWinnerUpdated(
  eventId: string,
  pubsub: typeof defaultPubsub = defaultPubsub,
) {
  return pubsub.asyncIterableIterator(
    WINNER_UPDATED(eventId),
  ) as AsyncIterable<WinnerUpdatedPayload>;
}

export async function findEventsConnection(
  prisma: AppPrismaClient,
  input: EventsInput = {},
): Promise<EventConnection> {
  const normalizedInput: EventsInput = input ?? {};
  const filter = normalizedInput.filter ?? 'ALL';
  const sportId = normalizedInput.sportId ?? undefined;
  const search = normalizedInput.search ?? undefined;
  const first =
    typeof normalizedInput.first === 'number' && normalizedInput.first > 0
      ? normalizedInput.first
      : 12;
  const after =
    typeof normalizedInput.after === 'string' && normalizedInput.after.length > 0
      ? normalizedInput.after
      : undefined;

  const useMockData = process.env.USE_MOCK_EVENTS === 'true' || false;

  if (useMockData) {
    return generateMockEvents(first, after, filter);
  }

  const where: Prisma.EventWhereInput = {
    published: true,
  };

  if (sportId) {
    where.sportId = sportId;
  }

  if (search) {
    where.OR = [
      { name: { contains: search } },
      { location: { contains: search } },
      { organizer: { contains: search } },
    ];
  }

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  switch (filter) {
    case 'TODAY':
      where.date = {
        gte: todayStart,
        lte: todayEnd,
      };
      break;
    case 'UPCOMING':
      where.date = {
        gt: now,
      };
      break;
    case 'RECENT':
      where.date = {
        lt: now,
        gte: thirtyDaysAgo,
      };
      break;
  }

  let cursorClause: Pick<Prisma.EventFindManyArgs, 'cursor' | 'skip'> = {};
  if (after) {
    if (after.startsWith('cursor-')) {
      parseInt(after.split('-')[1]);
    } else {
      cursorClause = {
        cursor: { id: after },
        skip: 1,
      };
    }
  }

  try {
    const orderBy: Prisma.EventOrderByWithRelationInput[] =
      filter === 'UPCOMING' || filter === 'TODAY'
        ? [{ date: 'asc' }, { id: 'asc' }]
        : [{ date: 'desc' }, { id: 'desc' }];

    const events = await prisma.event.findMany({
      where,
      take: first + 1,
      ...cursorClause,
      orderBy,
      include: {
        sport: true,
        country: true,
        classes: true,
      },
    });

    const hasNextPage = events.length > first;
    if (hasNextPage) {
      events.pop();
    }

    const edges = events.map((event) => ({
      node: event,
      cursor: event.id,
    }));

    return {
      edges,
      pageInfo: {
        hasNextPage,
        hasPreviousPage: false,
        startCursor: edges.length > 0 ? edges[0].cursor : null,
        endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
      },
    };
  } catch (error) {
    console.error('Error fetching events:', error);
    throw new Error('Failed to fetch events');
  }
}

function generateMockEvents(first: number, after: string | undefined, filter: EventFilter) {
  const mockEvents: EventConnectionNode[] = [];
  const now = new Date();

  for (let i = 1; i <= 100; i++) {
    const eventDate = new Date(now);

    if (filter === 'TODAY') {
      eventDate.setDate(now.getDate());
    } else if (filter === 'UPCOMING') {
      eventDate.setDate(now.getDate() + Math.floor(Math.random() * 30) + 1);
    } else if (filter === 'RECENT') {
      eventDate.setDate(now.getDate() - Math.floor(Math.random() * 30));
    } else {
      eventDate.setDate(now.getDate() + Math.floor(Math.random() * 60) - 30);
    }

    mockEvents.push({
      id: `mock-event-${i}`,
      name: `Mock Event ${i} - ${['World Cup', 'Championship', 'Local Race', 'Training'][i % 4]}`,
      organizer: `Organizer ${(i % 10) + 1}`,
      date: eventDate.getTime().toString(),
      location: `Location ${(i % 20) + 1}, City`,
      countryId: ['CZ', 'SK', 'DE', 'PL', 'AT'][i % 5],
      sportId: 1,
      timezone: 'Europe/Prague',
      zeroTime: '09:00:00',
      discipline: 'MIDDLE',
      createdAt: new Date(now.getTime() - (100 - i) * 24 * 60 * 60 * 1000).getTime().toString(),
      updatedAt: new Date(now.getTime() - (100 - i) * 24 * 60 * 60 * 1000).getTime().toString(),
      sport: {
        id: 1,
        name: 'Orienteering',
      },
      classes: [
        { id: i * 10 + 1, name: 'H21E' },
        { id: i * 10 + 2, name: 'D21E' },
        { id: i * 10 + 3, name: 'H35' },
      ],
    });
  }

  mockEvents.sort((left, right) => {
    const leftDate = typeof left.date === 'string' ? parseInt(left.date) : 0;
    const rightDate = typeof right.date === 'string' ? parseInt(right.date) : 0;
    return leftDate - rightDate;
  });

  let startIndex = 0;
  if (after) {
    startIndex = mockEvents.findIndex((event) => event.id === after);
    if (startIndex === -1) {
      startIndex = 0;
    } else {
      startIndex += 1;
    }
  }

  const endIndex = Math.min(startIndex + first, mockEvents.length);
  const paginatedEvents = mockEvents.slice(startIndex, endIndex);

  const edges = paginatedEvents.map((event) => ({
    node: event,
    cursor: event.id as string,
  }));

  return {
    edges,
    pageInfo: {
      hasNextPage: endIndex < mockEvents.length,
      hasPreviousPage: startIndex > 0,
      startCursor: edges.length > 0 ? edges[0].cursor : null,
      endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
    },
  };
}

export const changeCompetitorStatus = async (
  eventId: string,
  competitorId: number,
  origin: StatusChangeInput['origin'],
  status: StatusChangeInput['status'],
  userId: number,
) => {
  let dbResponseCompetitor;
  try {
    dbResponseCompetitor = await prisma.competitor.findFirst({
      where: { id: competitorId },
      select: {
        id: true,
        classId: true,
        status: true,
        lateStart: true,
        card: true,
      },
    });
  } catch (err) {
    console.error(err);
    throw new DatabaseError(`An error occurred: ` + getErrorMessage(err));
  }

  if (!dbResponseCompetitor) {
    throw new ValidationError(`Competitor with ID ${competitorId} does not exist in the database`);
  }

  // Initialize competitorStatus to the provided status, and lateStart to false.
  // These variables will be adjusted based on the origin and other conditions later.
  let competitorStatus: ResultStatus = status === 'LateStart' ? 'Active' : status;
  let lateStart = false;
  if (origin === 'START') {
    //TODO: implement logic, to check if is it possible to make status change, what if the competitor has status NotCompeting??
    // It is forbidden to change the status of the runner after they have finished.
    if (!['Inactive', 'DidNotStart', 'Active'].includes(dbResponseCompetitor.status)) {
      throw new ValidationError(`Could not change status of runner that has already finished`);
    }
    // If the new status is 'LateStart', update the status to 'Active' and set lateStart to true.
    if (status === 'LateStart') {
      competitorStatus = 'Active';
      lateStart = true;
    }
  }
  try {
    await prisma.competitor.update({
      where: { id: competitorId },
      data: { status: competitorStatus, lateStart: lateStart },
    });
  } catch (err) {
    console.error('Failed to update competitor:', err);
    throw new DatabaseError('Error updating competitor');
  }

  const changes: ProtocolChange[] = [];

  if (dbResponseCompetitor.status !== competitorStatus) {
    changes.push({
      type: 'status_change',
      previousValue: dbResponseCompetitor.status,
      newValue: competitorStatus,
    });
  }

  if (dbResponseCompetitor.lateStart !== lateStart) {
    changes.push({
      type: 'late_start_change',
      previousValue: String(dbResponseCompetitor.lateStart),
      newValue: String(lateStart),
    });
  }

  // Add records to protocol only when the persisted values actually changed.
  if (changes.length > 0) {
    try {
      await prisma.protocol.createMany({
        data: changes.map((change) => ({
          eventId: eventId,
          competitorId: competitorId,
          origin: origin as Origin,
          type: change.type,
          previousValue: change.previousValue,
          newValue: change.newValue,
          authorId: userId,
        })),
      });
    } catch (err) {
      console.error('Failed to update competitor:', err);
      throw new DatabaseError('Error creating protocol record');
    }
  }

  // Select the current competitor from the database
  let updatedCompetitor: Awaited<ReturnType<typeof prisma.competitor.findUnique>>;
  try {
    updatedCompetitor = await prisma.competitor.findUnique({
      where: { id: competitorId },
      include: {
        class: true,
        team: true,
      },
    });
  } catch (err) {
    console.error('Failed to fetch updated competitor:', err);
    throw new DatabaseError('Error fetching updated competitor');
  }

  if (!updatedCompetitor) {
    throw new ValidationError(`Competitor with ID ${competitorId} does not exist in the database`);
  }

  // Publish changes to subscribers
  try {
    await publishUpdatedCompetitor(eventId, updatedCompetitor);
    await publishUpdatedCompetitors(dbResponseCompetitor.classId);
  } catch (err) {
    console.error('Error publishing competitors update:', err);
  }

  return `Competitor's status has been successfully changed to ${competitorStatus}`;
};

/**
 * Retrieves the event details and decrypts the event password if it exists and is not expired.
 *
 * @param {string} eventId - The ID of the event.
 * @returns {string|undefined} The decrypted event password if found and not expired, otherwise undefined.
 * @throws {ValidationError} If the event is not found or the user does not have permissions.
 * @throws {Error} If Prisma query fails or decryption encounters an error.
 */
export const getDecryptedEventPassword = async (eventId: string) => {
  try {
    // Fetch the event based on eventId
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        authorId: true,
        // Add any other fields you might want to fetch
      },
    });

    // Validate if the event exists and the current user has permission
    if (!event) {
      throw new ValidationError('Event not found or you don’t have the permissions.');
    }

    // Fetch the event password if available
    const eventPassword = await prisma.eventPassword.findUnique({
      where: { eventId: eventId },
      select: {
        id: true,
        eventId: true,
        password: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!eventPassword) return;

    if (new Date(eventPassword.expiresAt) <= new Date()) {
      return;
    }

    let decodedPasswordPayload;
    try {
      decodedPasswordPayload = decodeBase64(eventPassword.password);
    } catch (error) {
      throw new DatabaseError('Event password payload is corrupted.');
    }

    let decryptedPassword: string;
    try {
      decryptedPassword = decrypt(decodedPasswordPayload);
    } catch (error) {
      throw new DatabaseError(
        'Event password decryption failed. Check ENCRYPTION_SECRET_KEY configuration.',
      );
    }

    if (!decryptedPassword || decryptedPassword.trim() === '') {
      throw new DatabaseError(
        'Event password decryption returned an empty value. Check ENCRYPTION_SECRET_KEY configuration.',
      );
    }

    return { ...eventPassword, password: decryptedPassword };
  } catch (error) {
    console.error('Error fetching event or event password:', error);

    if (error instanceof ValidationError || error instanceof DatabaseError) {
      throw error;
    }

    throw new DatabaseError(
      error instanceof Error
        ? `Failed to retrieve or decrypt the event password: ${error.message}`
        : 'Failed to retrieve or decrypt the event password.',
    );
  }
};

export const updateCompetitor = async (
  eventId: string,
  competitorId: string | number,
  origin: UpdateCompetitorInput['origin'],
  updateData: UpdateCompetitorData,
  userId: number,
) => {
  const competitorIdNumber = toIntegerId(competitorId);
  let dbResponseCompetitor;
  try {
    dbResponseCompetitor = await prisma.competitor.findFirst({
      where: { id: competitorIdNumber },
      select: {
        id: true,
        classId: true,
        class: { select: { eventId: true } },
        firstname: true,
        lastname: true,
        nationality: true,
        registration: true,
        license: true,
        organisationId: true,
        organisation: { select: organisationSelect },
        card: true,
        bibNumber: true,
        startTime: true,
        finishTime: true,
        time: true,
        status: true,
        lateStart: true,
        teamId: true,
        leg: true,
        note: true,
        externalId: true,
        splits: {
          select: {
            id: true,
            controlCode: true,
            time: true,
          },
        },
      },
    });
  } catch (err) {
    console.error(err);
    throw new DatabaseError(`An error occurred: ` + getErrorMessage(err));
  }

  if (!dbResponseCompetitor) {
    throw new ValidationError(`Competitor with ID ${competitorId} does not exist in the database`);
  }

  if (origin === 'START') {
    //TODO: implement logic, to check if is it possible to make status change, what if the competitor has status NotCompeting??
    // It is forbidden to change the state of the runner after he has finished
    if (!['Inactive', 'DidNotStart', 'Active'].includes(dbResponseCompetitor.status)) {
      throw new ValidationError(`Could not change status of runner that has already finished`);
    }
  }

  // Collect changes to be added to the protocol
  const changes: ProtocolChange[] = [];

  // Define a mapping of updateData keys to their corresponding protocol types
  const keyToTypeMap = {
    classId: 'class_change',
    firstname: 'firstname_change',
    lastname: 'lastname_change',
    bibNumber: 'bibNumber_change',
    nationality: 'nationality_change',
    registration: 'registration_change',
    license: 'license_change',
    rankingPoints: 'ranking_points_change',
    rankingReferenceValue: 'ranking_reference_value_change',
    organisation: 'organisation_change',
    shortName: 'short_name_change',
    card: 'si_card_change',
    startTime: 'start_time_change',
    finishTime: 'finish_time_change',
    time: 'time_change',
    teamId: 'team_change',
    leg: 'leg_change',
    status: 'status_change',
    lateStart: 'late_start_change',
    note: 'note_change',
    externalId: 'external_id_change',
  } satisfies Partial<Record<keyof UpdateCompetitorData, ProtocolType>>;

  type ProtocolTrackedField = keyof typeof keyToTypeMap;

  const isProtocolTrackedField = (key: string): key is ProtocolTrackedField =>
    Object.prototype.hasOwnProperty.call(keyToTypeMap, key);

  // Iterate over keys in updateData, log only actual changes
  const previousOrganisation = dbResponseCompetitor.organisation;
  Object.keys(updateData).forEach((key) => {
    if (isProtocolTrackedField(key)) {
      let previousValue: unknown;
      if (key === 'organisation') {
        previousValue = previousOrganisation?.name ?? null;
      } else if (key === 'shortName') {
        previousValue = previousOrganisation?.shortName ?? null;
      } else {
        previousValue = (dbResponseCompetitor as Record<string, unknown>)[key];
      }
      const nextValue = updateData[key];
      const prevStr =
        previousValue === null || previousValue === undefined ? null : previousValue.toString();
      const nextStr = nextValue === null || nextValue === undefined ? null : nextValue.toString();
      if (prevStr !== nextStr) {
        changes.push({
          type: keyToTypeMap[key],
          previousValue: prevStr,
          newValue: nextStr ?? 'null',
        });
      }
    }
  });

  const {
    splits,
    organisation: nextOrganisation,
    shortName: nextShortName,
    ...baseData
  } = updateData;

  // Resolve organisationId from new organisation/shortName values, scoped to event.
  let organisationIdUpdate: { organisationId: number | null } | undefined;
  if (
    Object.prototype.hasOwnProperty.call(updateData, 'organisation') ||
    Object.prototype.hasOwnProperty.call(updateData, 'shortName')
  ) {
    const targetName = Object.prototype.hasOwnProperty.call(updateData, 'organisation')
      ? nextOrganisation
      : previousOrganisation?.name;
    const targetShortName = Object.prototype.hasOwnProperty.call(updateData, 'shortName')
      ? nextShortName
      : previousOrganisation?.shortName;
    const newOrganisationId = await upsertOrganisation({
      eventId: dbResponseCompetitor.class?.eventId ?? eventId,
      name: targetName,
      shortName: targetShortName,
    });
    organisationIdUpdate = { organisationId: newOrganisationId };
  }

  try {
    const competitorUpdateData = {
      ...baseData,
      ...(organisationIdUpdate ?? {}),
    } as Prisma.CompetitorUncheckedUpdateInput;

    await prisma.competitor.update({
      where: { id: competitorIdNumber },
      data: competitorUpdateData,
    });

    if (splits && Array.isArray(splits)) {
      await prisma.split.deleteMany({
        where: { competitorId: competitorIdNumber },
      });

      await prisma.split.createMany({
        data: splits.map((split) => ({
          competitorId: competitorIdNumber,
          controlCode: Number((split as { controlCode: string | number }).controlCode),
          time: (split as { time?: number | null }).time,
        })),
      });
    }
  } catch (err) {
    console.error('Failed to update competitor:', err);
    throw new DatabaseError('Error updating competitor');
  }

  // Add records to protocol in a single batch insert
  if (changes.length > 0) {
    try {
      await prisma.protocol.createMany({
        data: changes.map((change) => ({
          eventId: eventId,
          competitorId: competitorIdNumber,
          origin: origin as Origin,
          type: change.type,
          previousValue: change.previousValue,
          newValue: change.newValue,
          authorId: userId,
        })),
      });
    } catch (err) {
      console.error('Failed to update competitor:', err);
      throw new DatabaseError('Error creating protocol record');
    }
  }

  // Select the current competitor from the database
  let updatedCompetitor;
  try {
    const raw = await prisma.competitor.findUnique({
      where: { id: competitorIdNumber },
      include: {
        class: true,
        team: { include: { organisation: { select: organisationSelect } } },
        organisation: { select: organisationSelect },
      },
    });
    if (raw) {
      const flat = flattenOrganisation(raw) as Record<string, unknown> | null;
      if (flat && raw.team) flat.team = flattenOrganisation(raw.team);
      updatedCompetitor = flat;
    }
  } catch (err) {
    console.error('Failed to fetch updated competitor:', err);
    throw new DatabaseError('Error fetching updated competitor');
  }

  if (!updatedCompetitor) {
    throw new ValidationError(`Competitor with ID ${competitorId} does not exist in the database`);
  }

  // Publish changes to subscribers
  try {
    await publishUpdatedCompetitor(eventId, updatedCompetitor);
    await publishUpdatedCompetitors(updatedCompetitor.classId);
  } catch (err) {
    console.error('Error publishing competitors update:', err);
  }

  return {
    message: 'Competitor has been successfully updated',
    updatedFields: updateData,
  };
};

export const storeCompetitor = async (
  eventId: string,
  competitorData: StoreCompetitorData,
  userId: number,
  origin: string,
) => {
  const { classId, firstname, lastname, registration, status, card, note, splits } = competitorData;
  const classIdNumber = toIntegerId(classId);

  // Check if the class exists before proceeding
  let existingClass;
  try {
    existingClass = await prisma.class.findUnique({
      where: { id: classIdNumber },
      select: { id: true, eventId: true },
    });
  } catch (err) {
    console.error('Database error:', err);
    throw new DatabaseError('Error retrieving class information.');
  }

  if (!existingClass) {
    throw new ValidationError(`Class with ID ${classId} does not exist.`);
  }

  // Resolve organisation relation (event-scoped) for the new competitor
  const organisationId = await upsertOrganisation({
    eventId: existingClass.eventId,
    name: competitorData.organisation,
    shortName: competitorData.shortName,
    nationality: competitorData.nationality,
  });

  let newCompetitor;
  try {
    newCompetitor = await prisma.competitor.create({
      data: {
        classId: classIdNumber,
        firstname,
        lastname,
        nationality: competitorData.nationality || null,
        registration: registration || createShortCompetitorHash(classId, lastname, firstname),
        license: competitorData.license || null,
        rankingPoints: competitorData.rankingPoints ?? null,
        rankingReferenceValue: competitorData.rankingReferenceValue ?? null,
        organisationId: organisationId,
        card: card ? toIntegerId(card) : null,
        bibNumber: competitorData.bibNumber ? toIntegerId(competitorData.bibNumber) : null,
        startTime: competitorData.startTime ? new Date(competitorData.startTime) : null,
        finishTime: competitorData.finishTime ? new Date(competitorData.finishTime) : null,
        time: competitorData.time || null,
        teamId:
          competitorData.teamId === undefined || competitorData.teamId === null
            ? null
            : parseInt(String(competitorData.teamId), 10),
        leg:
          competitorData.leg === undefined || competitorData.leg === null
            ? null
            : parseInt(String(competitorData.leg), 10),
        status: (status as ResultStatus | undefined) || 'Inactive', // Default to Inactive if not provided
        lateStart: competitorData.lateStart || false,
        note: note || null,
        externalId: competitorData.externalId || null,
      },
    });
  } catch (err) {
    console.error('Error creating competitor:', err);
    throw new DatabaseError('Error storing competitor.');
  }

  // Handle splits if provided
  if (splits && Array.isArray(splits)) {
    try {
      await prisma.$transaction(
        splits.map(({ controlCode, time }) =>
          prisma.split.create({
            data: {
              competitorId: newCompetitor.id,
              controlCode,
              time: time ?? null,
            },
          }),
        ),
        {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        },
      );
    } catch (err) {
      console.error('Error storing splits:', err);
      throw new DatabaseError('Error storing competitor splits.');
    }
  }

  // Add a protocol record for each changed field
  try {
    await prisma.protocol.createMany({
      data: {
        eventId: eventId,
        competitorId: newCompetitor.id,
        origin: origin as Origin,
        type: 'competitor_create',
        previousValue: null,
        newValue: lastname + ' ' + firstname,
        authorId: userId,
      },
    });
  } catch (err) {
    console.error('Error creating protocol record:', err);
    throw new DatabaseError('Error creating protocol record.');
  }

  // Select the current competitor from the database
  let updatedCompetitor;
  try {
    const raw = await prisma.competitor.findUnique({
      where: { id: newCompetitor.id },
      include: {
        class: true,
        team: { include: { organisation: { select: organisationSelect } } },
        organisation: { select: organisationSelect },
      },
    });
    if (raw) {
      const flat = flattenOrganisation(raw) as Record<string, unknown> | null;
      if (flat && raw.team) flat.team = flattenOrganisation(raw.team);
      updatedCompetitor = flat;
    }
  } catch (err) {
    console.error('Failed to fetch updated competitor:', err);
    throw new DatabaseError('Error fetching updated competitor');
  }

  if (!updatedCompetitor) {
    throw new ValidationError(
      `Competitor with ID ${newCompetitor.id} does not exist in the database`,
    );
  }

  // Publish event updates
  try {
    await publishUpdatedCompetitor(eventId, updatedCompetitor);
    await publishUpdatedCompetitors(newCompetitor.classId);
  } catch (err) {
    console.error('Error publishing competitors update:', err);
  }

  return {
    message: 'Competitor has been successfully created',
    competitor: newCompetitor,
  };
};

/**
 * Deletes all protocols, splits, competitors, teams, and organisations related to event classes.
 *
 * @param {string} eventId - The event ID.
 * @throws {DatabaseError} If any deletion fails.
 */
export const deleteEventCompetitorsAndProtocols = async (eventId: string) => {
  try {
    // 1. Find all class IDs associated with the eventId
    const classIds = await prisma.class.findMany({
      where: { eventId: eventId },
      select: { id: true },
    });

    const classIdList = classIds.map((cls) => cls.id);

    if (classIdList.length === 0) {
      console.warn(`No classes found for event ${eventId}.`);
      await prisma.organisation.deleteMany({
        where: { eventId: eventId },
      });
      return;
    }

    // 2. Find all competitors under these classes
    const competitors = await prisma.competitor.findMany({
      where: { classId: { in: classIdList } },
      select: { id: true },
    });

    const competitorIdList = competitors.map((c) => c.id);

    if (competitorIdList.length > 0) {
      // 3. Delete Protocols linked to competitors
      await prisma.protocol.deleteMany({
        where: { competitorId: { in: competitorIdList } },
      });

      // 4. Delete Splits linked to competitors
      await prisma.split.deleteMany({
        where: { competitorId: { in: competitorIdList } },
      });

      // 5. Delete Competitors
      await prisma.competitor.deleteMany({
        where: { id: { in: competitorIdList } },
      });
    }

    // Teams reference classId, so remove them here
    await prisma.team.deleteMany({
      where: { classId: { in: classIdList } },
    });

    await prisma.organisation.deleteMany({
      where: { eventId: eventId },
    });
  } catch (err) {
    console.error('Failed to delete competitors or protocols:', err);
    throw new DatabaseError('Error deleting competitors or related data');
  }
};

/**
 * Delete single competitor.
 *
 * @param {string} eventId - The event ID.
 * @param {number} competitorId - The competitor ID.
 * @throws {DatabaseError} If any deletion fails.
 */
export const deleteEventCompetitorAndProtocols = async (eventId: string, competitorId: number) => {
  try {
    // 1. Verify that the competitor belongs to the given event
    const competitor = await prisma.competitor.findUnique({
      where: { id: competitorId },
      select: { classId: true },
    });

    if (!competitor) {
      console.warn(`Competitor ${competitorId} not found.`);
      return;
    }

    // 2. Check if the competitor's class is associated with the event
    const classExists = await prisma.class.findFirst({
      where: { id: competitor.classId, eventId: eventId },
    });

    if (!classExists) {
      console.warn(`Competitor ${competitorId} does not belong to event ${eventId}.`);
      return;
    }

    // 3. Delete Protocols linked to the competitor
    await prisma.protocol.deleteMany({
      where: { competitorId: competitorId },
    });

    // 4. Delete Splits linked to the competitor
    await prisma.split.deleteMany({
      where: { competitorId: competitorId },
    });

    // 5. Delete the Competitor
    await prisma.competitor.delete({
      where: { id: competitorId },
    });

    // Publish changes to subscribers
    try {
      await publishUpdatedCompetitor(eventId, competitor);
      await publishUpdatedCompetitors(competitor.classId);
    } catch (err) {
      console.error('Error publishing competitors update:', err);
    }
  } catch (err) {
    console.error('Failed to delete competitor or protocols:', err);
    throw new DatabaseError('Error deleting competitor or related data');
  }
};

/**
 * Deletes all records from the protocol table for a given eventId
 * and removes all competitors associated with that eventId.
 *
 * @param {string} eventId - The ID of the event for which records should be deleted.
 * @throws {DatabaseError} If there is an error deleting records from the database.
 * @returns {string} Success message indicating the data has been deleted.
 */
export const deleteEventCompetitors = async (eventId: string) => {
  try {
    await deleteEventCompetitorsAndProtocols(eventId);
    await prisma.eventImportState.deleteMany({
      where: { eventId: eventId },
    });
  } catch (err) {
    throw err; // already handled inside
  }
  return `All competitors for event ${eventId} have been successfully deleted.`;
};

/**
 * Rremoves single competitor associated with that eventId
 *
 * @param {string} eventId - The ID of the event for which record should be deleted.
 * @param {number} competitorId - The ID of the competitor for which record should be deleted.
 * @throws {DatabaseError} If there is an error deleting record from the database.
 * @returns {string} Success message indicating the data has been deleted.
 */
export const deleteEventCompetitor = async (eventId: string, competitorId: number) => {
  try {
    await deleteEventCompetitorAndProtocols(eventId, competitorId);
  } catch (err) {
    throw err; // already handled inside
  }
  return `The competitor ${competitorId} for event ${eventId} has been successfully deleted.`;
};

/**
 * Deletes all records from the protocol table for a given eventId
 * and removes all competitors, classes, and event password associated with that eventId.
 *
 * @param {string} eventId - The ID of the event for which records should be deleted.
 * @throws {DatabaseError} If there is an error deleting records from the database.
 * @returns {Promise<string>} Success message indicating the data has been deleted.
 */
export const deleteAllEventData = async (eventId: string) => {
  try {
    // Step 1: Delete competitors, protocols, splits
    await deleteEventCompetitorsAndProtocols(eventId);

    // Step 2: Delete Classes linked to event
    await prisma.class.deleteMany({
      where: { eventId: eventId },
    });

    // Step 3: Delete Event Passwords
    await prisma.eventPassword.deleteMany({
      where: { eventId: eventId },
    });

    // Step 4: Delete IOF import state so the same XML can be processed again
    await prisma.eventImportState.deleteMany({
      where: { eventId: eventId },
    });
  } catch (err) {
    console.error('Failed to delete all event data:', err);
    throw new DatabaseError('Error deleting all event data');
  }
  return `All event data for event ${eventId} have been successfully deleted.`;
};

export const getEventCompetitorDetail = async (
  eventId: string,
  competitorId: string | number,
  dbResponseEvent: Pick<PrismaEvent, 'relay'>,
) => {
  const competitorIdNumber = toIntegerId(competitorId);
  let competitorData;
  if (!dbResponseEvent.relay) {
    // Return data for an individual competition
    let dbIndividualResponse;
    try {
      dbIndividualResponse = await prisma.competitor.findFirst({
        where: {
          id: competitorIdNumber,
          class: {
            eventId: eventId, // Ensure this matches the structure and type of your eventId
          },
        },
        select: {
          id: true,
          classId: true,
          firstname: true,
          lastname: true,
          bibNumber: true,
          nationality: true,
          registration: true,
          license: true,
          rankingPoints: true,
          rankingReferenceValue: true,
          organisationId: true,
          organisation: { select: organisationSelect },
          card: true,
          startTime: true,
          finishTime: true,
          time: true,
          teamId: true,
          leg: true,
          status: true,
          lateStart: true,
          note: true,
          externalId: true,
          updatedAt: true,
          splits: {
            select: { controlCode: true, time: true },
          },
          class: {
            select: {
              id: true,
              externalId: true,
              name: true,
              startName: true,
              length: true,
              climb: true,
              controlsCount: true,
            },
          },
        },
      });
    } catch (err) {
      console.error(err);
      throw new DatabaseError(
        `Competitor with ID ${competitorId} in the event with ID ${eventId} does not exist in the database`,
      );
    }
    competitorData = dbIndividualResponse;
  } else {
    // Return data for an relay competition
    let dbRelayResponse;
    try {
      dbRelayResponse = await prisma.competitor.findFirst({
        where: {
          id: competitorIdNumber,
          class: {
            eventId: eventId, // Ensure this matches the structure and type of your eventId
          },
        },
        select: {
          id: true,
          classId: true,
          firstname: true,
          lastname: true,
          nationality: true,
          registration: true,
          license: true,
          rankingPoints: true,
          rankingReferenceValue: true,
          organisationId: true,
          organisation: { select: organisationSelect },
          card: true,
          startTime: true,
          finishTime: true,
          time: true,
          teamId: true,
          leg: true,
          status: true,
          note: true,
          externalId: true,
          updatedAt: true,
          splits: {
            select: { controlCode: true, time: true },
          },
          class: {
            select: {
              id: true,
              externalId: true,
              name: true,
              length: true,
              climb: true,
              controlsCount: true,
            },
          },
          team: {
            select: {
              name: true,
              organisationId: true,
              organisation: { select: organisationSelect },
              bibNumber: true,
            },
          },
        },
      });
    } catch (err) {
      console.error(err);
      throw new DatabaseError(
        `Competitor with ID ${competitorId} in the event with ID ${eventId} does not exist in the database`,
      );
    }
    competitorData = dbRelayResponse;
  }
  if (!competitorData) return competitorData;
  const flat = flattenOrganisationRecord(competitorData as OrganisationBackedRecord);
  if (flat && (competitorData as { team?: OrganisationBackedRecord | null }).team) {
    flat.team = flattenOrganisationRecord(
      (competitorData as { team: OrganisationBackedRecord }).team,
    );
  }
  return flat;
};
