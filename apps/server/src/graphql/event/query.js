import prisma from '../../utils/context.js';
export const events = async (_, { input = {} }) => {
  const { filter = 'ALL', sportId, search, first = 12, after } = input;

  const useMockData = process.env.USE_MOCK_EVENTS === 'true' || false;

  if (useMockData) {
    return generateMockEvents(first, after, filter);
  }

  // Build where clause based on filters
  const where = {
    published: true,
  };

  // Sport filter
  if (sportId) {
    where.sportId = sportId;
  }

  // Search filter
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { location: { contains: search, mode: 'insensitive' } },
      { organizer: { contains: search, mode: 'insensitive' } },
    ];
  }

  // Date filters
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
    // ALL shows all events without date filtering
  }

  // Cursor-based pagination
  let cursorClause = {};
  if (after) {
    // Pokud je cursor ve formátu "cursor-11", extrahujeme offset
    if (after.startsWith('cursor-')) {
      const offset = parseInt(after.split('-')[1]);
      // Pro mock data - přeskočíme přímo na offset
      // Pro reálná data potřebujeme jiný přístup
    } else {
      // Pro reálná data použijeme ID jako cursor
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

    // Get edges with cursors
    const edges = events.map(event => ({
      node: event,
      cursor: event.id, // Použijeme skutečné ID jako cursor
    }));

    // Page info
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

// Funkce pro generování mock událostí
function generateMockEvents(first, after, filter) {
  const mockEvents = [];
  const now = new Date();

  // Vytvoříme 100 mock událostí
  for (let i = 1; i <= 100; i++) {
    const eventDate = new Date(now);

    // Rozložení dat pro různé filtry
    if (filter === 'TODAY') {
      eventDate.setDate(now.getDate());
    } else if (filter === 'UPCOMING') {
      eventDate.setDate(now.getDate() + Math.floor(Math.random() * 30) + 1);
    } else if (filter === 'RECENT') {
      eventDate.setDate(now.getDate() - Math.floor(Math.random() * 30));
    } else {
      // ALL - mix minulých a budoucích
      eventDate.setDate(now.getDate() + Math.floor(Math.random() * 60) - 30);
    }

    const event = {
      id: `mock-event-${i}`, // ID bude použito jako cursor
      name: `Mock Event ${i} - ${['World Cup', 'Championship', 'Local Race', 'Training'][i % 4]}`,
      organizer: `Organizer ${(i % 10) + 1}`,
      date: eventDate.getTime().toString(), // timestamp jako string
      location: `Location ${(i % 20) + 1}, City`,
      countryId: ['CZ', 'SK', 'DE', 'PL', 'AT'][i % 5],
      sportId: 1,
      timezone: 'Europe/Prague',
      zeroTime: new Date(eventDate.getTime() + 9 * 60 * 60 * 1000).getTime().toString(),
      createdAt: new Date(now.getTime() - (100 - i) * 24 * 60 * 60 * 1000).getTime().toString(),
      updatedAt: new Date(now.getTime() - (100 - i) * 24 * 60 * 60 * 1000).getTime().toString(),
      sport: {
        id: 1,
        name: 'Orienteering', // Pozor: musí sedět s konvertorem na frontendu
      },
      classes: [
        { id: i * 10 + 1, name: 'H21E' },
        { id: i * 10 + 2, name: 'D21E' },
        { id: i * 10 + 3, name: 'H35' },
      ],
    };

    mockEvents.push(event);
  }

  // Seřadit události podle data pro konzistentní paginaci
  mockEvents.sort((a, b) => parseInt(a.date) - parseInt(b.date));

  // Aplikovat paginaci podle cursoru
  let startIndex = 0;
  if (after) {
    // Najdeme index události podle cursoru (ID)
    startIndex = mockEvents.findIndex(event => event.id === after);
    if (startIndex === -1) startIndex = 0;
    else startIndex += 1; // Skip the cursor itself
  }

  const endIndex = Math.min(startIndex + first, mockEvents.length);
  const paginatedEvents = mockEvents.slice(startIndex, endIndex);

  const edges = paginatedEvents.map(event => ({
    node: event,
    cursor: event.id, // Použijeme ID jako cursor
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
