import {
  changeCompetitorStatus,
  storeCompetitor,
  updateCompetitor,
} from '../../modules/event/event.service.js';
import { requireEventOwner } from '../../utils/authz.js';

export const competitorStatusChange = async (_, { input }, context) => {
  const { eventId, competitorId, origin, status } = input;
  const { prisma, auth } = context;
  const { userId } = await requireEventOwner(prisma, auth, eventId);

  try {
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
  const { eventId, competitorId, origin } = input;
  const { prisma, auth } = context;
  const { userId } = await requireEventOwner(prisma, auth, eventId);

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
  const { eventId, origin, ...competitorData } = input;
  const { prisma, auth } = context;
  const { userId } = await requireEventOwner(prisma, auth, eventId);

  try {
    const storeCompetitorResponse = await storeCompetitor(eventId, competitorData, userId, origin);

    return {
      message: 'Competitor successfully added',
      competitor: storeCompetitorResponse.competitor,
    };
  } catch (error) {
    throw new Error(error.message);
  }
};
