import type { Prisma } from '../../generated/prisma/client.js';
import prisma from '../../utils/context.js';

import type { MipDocument, MipEntry } from './mip.xml.js';

const SUPPORTED_MIP_PROTOCOL_TYPES = [
  'competitor_create',
  'class_change',
  'firstname_change',
  'lastname_change',
  'bibNumber_change',
  'nationality_change',
  'organisation_change',
  'short_name_change',
  'si_card_change',
  'status_change',
] as const;

const DEFAULT_MIP_BATCH_SIZE = 500;

const PROTOCOL_SELECT = {
  id: true,
  competitorId: true,
} as const;

const COMPETITOR_SELECT = {
  id: true,
  externalId: true,
  firstname: true,
  lastname: true,
  nationality: true,
  card: true,
  bibNumber: true,
  rankingPoints: true,
  note: true,
  status: true,
  organisation: {
    select: { name: true },
  },
  class: {
    select: {
      externalId: true,
      name: true,
    },
  },
} as const;

type ProtocolCursorRow = Prisma.ProtocolGetPayload<{ select: typeof PROTOCOL_SELECT }>;
type MipCompetitorRow = Prisma.CompetitorGetPayload<{ select: typeof COMPETITOR_SELECT }>;

function parsePositiveInteger(value: string | null | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function competitorToMipEntry(competitor: MipCompetitorRow): MipEntry {
  const localId = parsePositiveInteger(competitor.externalId);
  const classId = parsePositiveInteger(competitor.class.externalId);

  return {
    id: competitor.id,
    localId,
    extId: localId === undefined ? competitor.externalId ?? undefined : undefined,
    classId,
    className: classId === undefined ? competitor.class.name : undefined,
    firstname: competitor.firstname,
    lastname: competitor.lastname,
    nationality: competitor.nationality,
    club: competitor.organisation?.name ?? null,
    card: competitor.card,
    bibNumber: competitor.bibNumber,
    rank: competitor.rankingPoints,
    note: competitor.note,
    status: competitor.status,
  };
}

function uniqueCompetitorIds(protocols: ProtocolCursorRow[]): number[] {
  return [...new Set(protocols.map((protocol) => protocol.competitorId))];
}

export async function buildMipDocumentForEvent(
  eventId: string,
  lastId: number,
  batchSize = DEFAULT_MIP_BATCH_SIZE,
): Promise<MipDocument> {
  const protocols = await prisma.protocol.findMany({
    where: {
      eventId,
      id: { gt: lastId },
      origin: { not: 'IT' },
      type: { in: [...SUPPORTED_MIP_PROTOCOL_TYPES] },
    },
    orderBy: { id: 'asc' },
    take: batchSize,
    select: PROTOCOL_SELECT,
  });

  if (protocols.length === 0) {
    return { lastId, entries: [] };
  }

  const competitorIds = uniqueCompetitorIds(protocols);
  const competitors = await prisma.competitor.findMany({
    where: {
      id: { in: competitorIds },
      class: { eventId },
    },
    select: COMPETITOR_SELECT,
  });
  const competitorById = new Map(
    competitors.map((competitor) => [competitor.id, competitorToMipEntry(competitor)]),
  );

  return {
    firstId: protocols[0].id,
    lastId: protocols[protocols.length - 1].id,
    entries: competitorIds.flatMap((competitorId) => {
      const entry = competitorById.get(competitorId);
      return entry ? [entry] : [];
    }),
  };
}
