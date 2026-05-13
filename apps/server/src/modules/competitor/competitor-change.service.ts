import { Prisma } from '../../generated/prisma/client.js';
import type { Origin } from '../../generated/prisma/enums.js';
import prisma from '../../utils/context.js';
import {
  publishUpdatedCompetitor,
  publishUpdatedCompetitors,
} from '../../utils/subscriptionUtils.js';
import type { CompetitorChange } from './competitor-change.helpers.js';
import { findCompetitorByIdWithLegacyShape } from './competitor.service.js';

type ProtocolClient = {
  protocol: {
    createMany(args: { data: Prisma.ProtocolCreateManyInput[] }): Promise<unknown>;
  };
};

export async function createCompetitorProtocolEntries(
  client: ProtocolClient,
  input: {
    eventId: string;
    competitorId: number;
    origin: Origin;
    authorId: number;
    changes: CompetitorChange[];
  },
): Promise<void> {
  if (input.changes.length === 0) return;

  await client.protocol.createMany({
    data: input.changes.map((change) => ({
      eventId: input.eventId,
      competitorId: input.competitorId,
      origin: input.origin,
      type: change.type,
      previousValue: change.previousValue,
      newValue: change.newValue ?? '',
      authorId: input.authorId,
    })),
  });
}

export async function publishUpdatedClasses(
  classIds: Iterable<number>,
  onError?: (classId: number, error: unknown) => void,
): Promise<void> {
  for (const classId of new Set(classIds)) {
    try {
      await publishUpdatedCompetitors(classId);
    } catch (error) {
      onError?.(classId, error);
    }
  }
}

export async function publishUpdatedCompetitorsById(
  eventId: string,
  competitorIds: Iterable<number>,
  onError?: (competitorId: number, error: unknown) => void,
): Promise<void> {
  for (const competitorId of new Set(competitorIds)) {
    try {
      const competitor = await findCompetitorByIdWithLegacyShape(prisma, competitorId);
      if (competitor) {
        await publishUpdatedCompetitor(eventId, competitor);
      }
    } catch (error) {
      onError?.(competitorId, error);
    }
  }
}
