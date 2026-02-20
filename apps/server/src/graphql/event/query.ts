import prisma from '../../utils/context.js';
import type { Prisma } from '../../generated/prisma/client';

type EventFilter = 'ALL' | 'TODAY' | 'UPCOMING' | 'RECENT';

type EventsInput = {
  filter?: EventFilter;
  sportId?: number;
  search?: string;
  first?: number;
  after?: string;
};

export const events = async (_: unknown, { input = {} }: { input?: EventsInput }) => {
  const normalizedInput: EventsInput = input ?? {};
  const filter = normalizedInput.filter ?? 'ALL';
  const sportId = normalizedInput.sportId ?? undefined;
  const search = normalizedInput.search ?? undefined;
  const first =
    typeof normalizedInput.first === "number" && normalizedInput.first > 0
      ? normalizedInput.first
      : 12;
  const after =
    typeof normalizedInput.after === "string" && normalizedInput.after.length > 0
      ? normalizedInput.after
      : undefined;

  const useMockData = process.env.USE_MOCK_EVENTS === 'true' || false;

  if (useMockData) {
    return generateMockEvents(first, after, filter);
  }

  // Build where clause based on filters
  const where: Prisma.EventWhereInput = {
    published: true,
  };

  // Apply sport filter if provided
  if (sportId) {
    where.sportId = sportId;
  }

  // Apply search filter if provided
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { location: { contains: search } },
      { organizer: { contains: search } },
    ];
  }

  // Date filters configuration
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
    // 'ALL' shows all events without date filtering
  }

  // Cursor-based pagination configuration
  let cursorClause: Pick<Prisma.EventFindManyArgs, 'cursor' | 'skip'> = {};
  if (after) {
    // If cursor is in format "cursor-11", extract offset
    if (after.startsWith('cursor-')) {
      const offset = parseInt(after.split('-')[1]);
      // For mock data - skip directly to offset
      // For real data we need a different approach
    } else {
      // For real data use ID as cursor
      cursorClause = {
        cursor: { id: after },
        skip: 1,
      };
    }
  }

  try {
    // Get events with pagination
    const events = await prisma.event.findMany({
      where,
      take: first + 1, // Get one extra to check if there's more
      ...cursorClause,
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
      include: {
        sport: true,
        country: true,
        classes: true,
      },
    });

    // Check if there are more events
    const hasNextPage = events.length > first;
    if (hasNextPage) {
      events.pop(); // Remove the extra event
    }

    // Create edges with cursors
    const edges = events.map((event) => ({
      node: event,
      cursor: event.id, // Use actual ID as cursor
    }));

    // Page info for pagination
    const pageInfo = {
      hasNextPage,
      hasPreviousPage: false,
      startCursor: edges.length > 0 ? edges[0].cursor : null,
      endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
    };

    return {
      edges,
      pageInfo,
    };
  } catch (error) {
    console.error('Error fetching events:', error);
    throw new Error('Failed to fetch events');
  }
};

export const event = (_, { id }, context) => {
  return prisma.event.findUnique({
    where: { id: id },
  });
};

export const eventsBySport = (_, { sportId }, context) => {
  return prisma.event.findMany({
    where: { sportId: sportId },
  });
};

export const eventsByUser = (_, { userId }, context) => {
  return prisma.event.findMany({
    where: { authorId: userId },
  });
};

export const searchEvents = async (_, { query }) => {
  return prisma.$queryRaw`
    SELECT * FROM Event
    WHERE MATCH(name, location, organizer) AGAINST(${query} IN BOOLEAN MODE);
  `;
};

// Function for generating mock events
function generateMockEvents(first, after, filter) {
  const mockEvents = [];
  const now = new Date();

  // Create 100 mock events
  for (let i = 1; i <= 100; i++) {
    const eventDate = new Date(now);

    // Distribute dates for different filters
    if (filter === 'TODAY') {
      eventDate.setDate(now.getDate());
    } else if (filter === 'UPCOMING') {
      eventDate.setDate(now.getDate() + Math.floor(Math.random() * 30) + 1);
    } else if (filter === 'RECENT') {
      eventDate.setDate(now.getDate() - Math.floor(Math.random() * 30));
    } else {
      // ALL - mix of past and future events
      eventDate.setDate(now.getDate() + Math.floor(Math.random() * 60) - 30);
    }

    const event = {
      id: `mock-event-${i}`, // ID will be used as cursor
      name: `Mock Event ${i} - ${['World Cup', 'Championship', 'Local Race', 'Training'][i % 4]}`,
      organizer: `Organizer ${(i % 10) + 1}`,
      date: eventDate.getTime().toString(), // timestamp as string
      location: `Location ${(i % 20) + 1}, City`,
      countryId: ['CZ', 'SK', 'DE', 'PL', 'AT'][i % 5],
      sportId: 1,
      timezone: 'Europe/Prague',
      zeroTime: '09:00:00',
      createdAt: new Date(now.getTime() - (100 - i) * 24 * 60 * 60 * 1000).getTime().toString(),
      updatedAt: new Date(now.getTime() - (100 - i) * 24 * 60 * 60 * 1000).getTime().toString(),
      sport: {
        id: 1,
        name: 'Orienteering', // Note: must match frontend converter
      },
      classes: [
        { id: i * 10 + 1, name: 'H21E' },
        { id: i * 10 + 2, name: 'D21E' },
        { id: i * 10 + 3, name: 'H35' },
      ],
    };

    mockEvents.push(event);
  }

  // Sort events by date for consistent pagination
  mockEvents.sort((a, b) => parseInt(a.date) - parseInt(b.date));

  // Apply pagination based on cursor
  let startIndex = 0;
  if (after) {
    // Find event index by cursor (ID)
    startIndex = mockEvents.findIndex((event) => event.id === after);
    if (startIndex === -1) startIndex = 0;
    else startIndex += 1; // Skip the cursor itself
  }

  const endIndex = Math.min(startIndex + first, mockEvents.length);
  const paginatedEvents = mockEvents.slice(startIndex, endIndex);

  const edges = paginatedEvents.map((event) => ({
    node: event,
    cursor: event.id, // Use ID as cursor
  }));

  const pageInfo = {
    hasNextPage: endIndex < mockEvents.length,
    hasPreviousPage: startIndex > 0,
    startCursor: edges.length > 0 ? edges[0].cursor : null,
    endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
  };

  return {
    edges,
    pageInfo,
  };
}
