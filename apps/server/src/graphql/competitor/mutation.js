import {
  changeCompetitorStatus,
  updateCompetitor,
  storeCompetitor,
} from '../../modules/event/eventService.js';
import { verifyToken, verifyBasicAuth } from '../../utils/jwtToken.js';

export const competitorStatusChange = async (_, { input }, context) => {
  if (!context.token && !context.basicAuthCredentials) {
    throw new Error('Unauthorized: No token provided');
  }
  let jwtDecoded;
  if (context.token) {
    jwtDecoded = verifyToken(context.token);
    if (!jwtDecoded) {
      throw new Error('Unauthorized: Invalid or expired token');
    }
  } else if (context.basicAuthCredentials) {
    jwtDecoded = await verifyBasicAuth(
      context.basicAuthCredentials.username,
      context.basicAuthCredentials.password,
      input.eventId,
    );
    if (!jwtDecoded) {
      throw new Error('Unauthorized: Invalid or expired password');
    }
  }
  // Implement signin logic here
  const { eventId, competitorId, origin, status } = input;
  const { userId } = jwtDecoded;

  try {
    // Check if event exists and user is authorized
    const event = await context.prisma.event.findUnique({
      where: { id: eventId },
      select: { authorId: true },
    });

    if (!event) {
      throw new Error('Event not found');
    }

    if (event.authorId !== userId) {
      throw new Error('Not authorized to add a competitor');
    }
    const statusChangeMessage = await changeCompetitorStatus(
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
    throw new Error(error.message);
  }
};

export const competitorUpdate = async (_, { input }, context) => {
  if (!context.token) {
    throw new Error('Unauthorized: No token provided');
  }
  const jwtDecoded = verifyToken(context.token);
  if (!jwtDecoded) {
    throw new Error('Unauthorized: Invalid or expired token');
  }
  // Implement signin logic here
  const { eventId, competitorId, origin } = input;
  const { userId } = jwtDecoded;

  // Build update object conditionally
  const fieldTypes = {
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

  const updateData = Object.keys(input).reduce((acc, field) => {
    if (input[field] !== undefined && fieldTypes[field]) {
      switch (fieldTypes[field]) {
        case 'number':
          acc[field] = parseInt(input[field], 10);
          break;
        case 'boolean':
          acc[field] = Boolean(input[field]);
          break;
        case 'date':
          acc[field] = new Date(input[field]);
          break;
        default:
          acc[field] = input[field];
      }
    }
    return acc;
  }, {});

  try {
    // Check if event exists and user is authorized
    const event = await context.prisma.event.findUnique({
      where: { id: eventId },
      select: { authorId: true },
    });

    if (!event) {
      throw new Error('Event not found');
    }

    if (event.authorId !== userId) {
      throw new Error('Not authorized to add a competitor');
    }

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
    throw new Error(error.message);
  }
};

export const competitorCreate = async (_, { input }, context) => {
  // Verify JWT token
  if (!context.token) {
    throw new Error('Unauthorized: No token provided');
  }

  const jwtDecoded = verifyToken(context.token);
  if (!jwtDecoded) {
    throw new Error('Unauthorized: Invalid or expired token');
  }

  const { eventId, origin, ...competitorData } = input;
  const { userId } = jwtDecoded;

  try {
    // Check if event exists and user is authorized
    const event = await context.prisma.event.findUnique({
      where: { id: eventId },
      select: { authorId: true },
    });

    if (!event) {
      throw new Error('Event not found');
    }

    if (event.authorId !== userId) {
      throw new Error('Not authorized to add a competitor');
    }

    // Store competitor
    const storeCompetitorResponse = await storeCompetitor(
      eventId,
      competitorData,
      userId,
      origin,
    );

    return {
      message: 'Competitor successfully added',
      competitor: storeCompetitorResponse.competitor,
    };
  } catch (error) {
    throw new Error(error.message);
  }
};
