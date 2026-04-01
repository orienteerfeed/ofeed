import {
  adminCzechRankingClearResultSchema,
  adminCzechRankingEventDetailSchema,
  adminCzechRankingEventEntrySchema,
  adminCzechRankingEventDatasetSchema,
  adminCzechRankingOverviewSchema,
  adminCzechRankingSnapshotDetailSchema,
  adminCzechRankingSnapshotEntrySchema,
  adminCzechRankingSnapshotDatasetSchema,
  adminCzechRankingSyncResultSchema,
  adminCzechRankingUploadResultSchema,
} from '@repo/shared';

import { NotFoundError } from '../../exceptions/index.js';
import type { CzechRankingCategory, CzechRankingType } from '../../generated/prisma/client.js';
import { resolveCurrentCzechRankingWindowStart } from '../../utils/czech-ranking.js';
import { syncCzechRankingEventResultsFromOris } from '../../utils/czech-ranking-oris.js';
import {
  normalizeCzechRankingMonthInput,
  storeCzechRankingData,
} from '../upload/upload.service.js';

const SNAPSHOT_DETAIL_LIMIT = 200;
const EVENT_RESULT_DETAIL_LIMIT = 200;

export type AdminCzechRankingSyncScope = CzechRankingType | 'ALL';

type SnapshotDatasetFilter = {
  rankingType: CzechRankingType;
  rankingCategory: CzechRankingCategory;
  validForMonth: Date;
};

type EventDatasetFilter = {
  rankingType: CzechRankingType;
  rankingCategory: CzechRankingCategory;
  externalEventId: string;
};

function toUtcDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function sortSnapshotDatasets(
  left: {
    validForMonth: Date;
    rankingType: CzechRankingType;
    rankingCategory: CzechRankingCategory;
  },
  right: {
    validForMonth: Date;
    rankingType: CzechRankingType;
    rankingCategory: CzechRankingCategory;
  },
) {
  const monthDiff = right.validForMonth.getTime() - left.validForMonth.getTime();
  if (monthDiff !== 0) {
    return monthDiff;
  }

  const typeDiff = left.rankingType.localeCompare(right.rankingType);
  if (typeDiff !== 0) {
    return typeDiff;
  }

  return left.rankingCategory.localeCompare(right.rankingCategory);
}

function sortEventDatasets(
  left: {
    eventDate: Date;
    externalEventId: string;
    rankingType: CzechRankingType;
    rankingCategory: CzechRankingCategory;
  },
  right: {
    eventDate: Date;
    externalEventId: string;
    rankingType: CzechRankingType;
    rankingCategory: CzechRankingCategory;
  },
) {
  const dateDiff = right.eventDate.getTime() - left.eventDate.getTime();
  if (dateDiff !== 0) {
    return dateDiff;
  }

  const typeDiff = left.rankingType.localeCompare(right.rankingType);
  if (typeDiff !== 0) {
    return typeDiff;
  }

  const categoryDiff = left.rankingCategory.localeCompare(right.rankingCategory);
  if (categoryDiff !== 0) {
    return categoryDiff;
  }

  return left.externalEventId.localeCompare(right.externalEventId);
}

export async function getAdminCzechRankingOverview(prisma) {
  const [snapshotDatasetRows, snapshotEntryCount, eventDatasetRows, eventResultCount] =
    await Promise.all([
      prisma.rankingCzech.groupBy({
        by: ['rankingType', 'rankingCategory', 'validForMonth'],
        _count: {
          _all: true,
        },
        _max: {
          updatedAt: true,
        },
      }),
      prisma.rankingCzech.count(),
      prisma.czechRankingEventResult.groupBy({
        by: ['externalEventId', 'eventDate', 'rankingType', 'rankingCategory'],
        _count: {
          _all: true,
        },
        _max: {
          syncedAt: true,
        },
      }),
      prisma.czechRankingEventResult.count(),
    ]);

  const snapshotDatasets = await Promise.all(
    snapshotDatasetRows.sort(sortSnapshotDatasets).map(async (dataset) => {
      const leader = await prisma.rankingCzech.findFirst({
        where: {
          rankingType: dataset.rankingType,
          rankingCategory: dataset.rankingCategory,
          validForMonth: dataset.validForMonth,
        },
        orderBy: {
          place: 'asc',
        },
        select: {
          firstName: true,
          lastName: true,
          registration: true,
        },
      });

      return adminCzechRankingSnapshotDatasetSchema.parse({
        rankingType: dataset.rankingType,
        rankingCategory: dataset.rankingCategory,
        validForMonth: dataset.validForMonth,
        entriesCount: dataset._count._all,
        updatedAt: dataset._max.updatedAt ?? dataset.validForMonth,
        leaderName: leader ? `${leader.firstName} ${leader.lastName}` : null,
        leaderRegistration: leader?.registration ?? null,
      });
    }),
  );

  const externalEventIds = Array.from(
    new Set(eventDatasetRows.map((dataset) => dataset.externalEventId)),
  );

  const localEvents =
    externalEventIds.length > 0
      ? await prisma.event.findMany({
          where: {
            externalEventId: {
              in: externalEventIds,
            },
          },
          select: {
            id: true,
            name: true,
            externalEventId: true,
          },
        })
      : [];

  const localEventByExternalId = new Map<string, { id: string; name: string }>();

  for (const event of localEvents) {
    if (!event.externalEventId) {
      continue;
    }

    localEventByExternalId.set(event.externalEventId, {
      id: event.id,
      name: event.name,
    });
  }

  const eventResultDatasets = eventDatasetRows.sort(sortEventDatasets).map((dataset) => {
    const localEvent = localEventByExternalId.get(dataset.externalEventId) ?? null;

    return adminCzechRankingEventDatasetSchema.parse({
      externalEventId: dataset.externalEventId,
      localEventId: localEvent?.id ?? null,
      localEventName: localEvent?.name ?? null,
      eventDate: dataset.eventDate,
      rankingType: dataset.rankingType,
      rankingCategory: dataset.rankingCategory,
      resultCount: dataset._count._all,
      syncedAt: dataset._max.syncedAt ?? dataset.eventDate,
    });
  });

  return adminCzechRankingOverviewSchema.parse({
    summary: {
      snapshotDatasetCount: snapshotDatasets.length,
      snapshotEntryCount,
      eventDatasetCount: eventResultDatasets.length,
      eventResultCount,
    },
    snapshotDatasets,
    eventResultDatasets,
  });
}

export async function getAdminCzechRankingSnapshotDetail(prisma, filter: SnapshotDatasetFilter) {
  const where = {
    rankingType: filter.rankingType,
    rankingCategory: filter.rankingCategory,
    validForMonth: filter.validForMonth,
  } as const;

  const [entriesCount, latestRow, rows] = await Promise.all([
    prisma.rankingCzech.count({ where }),
    prisma.rankingCzech.findFirst({
      where,
      orderBy: {
        updatedAt: 'desc',
      },
      select: {
        updatedAt: true,
      },
    }),
    prisma.rankingCzech.findMany({
      where,
      orderBy: {
        place: 'asc',
      },
      take: SNAPSHOT_DETAIL_LIMIT,
      select: {
        id: true,
        rankingType: true,
        rankingCategory: true,
        validForMonth: true,
        place: true,
        firstName: true,
        lastName: true,
        registration: true,
        points: true,
        rankIndex: true,
        updatedAt: true,
      },
    }),
  ]);

  if (entriesCount === 0) {
    throw new NotFoundError('Czech ranking snapshot dataset not found');
  }

  return adminCzechRankingSnapshotDetailSchema.parse({
    dataset: {
      rankingType: filter.rankingType,
      rankingCategory: filter.rankingCategory,
      validForMonth: filter.validForMonth,
      entriesCount,
      updatedAt: latestRow?.updatedAt ?? filter.validForMonth,
      leaderName: rows[0] != null ? `${rows[0].firstName} ${rows[0].lastName}` : null,
      leaderRegistration: rows[0]?.registration ?? null,
    },
    items: rows.map((row) => adminCzechRankingSnapshotEntrySchema.parse(row)),
  });
}

export async function getAdminCzechRankingEventDetail(prisma, filter: EventDatasetFilter) {
  const where = {
    externalEventId: filter.externalEventId,
    rankingType: filter.rankingType,
    rankingCategory: filter.rankingCategory,
  } as const;

  const [resultCount, latestRow, localEvent, rows] = await Promise.all([
    prisma.czechRankingEventResult.count({ where }),
    prisma.czechRankingEventResult.findFirst({
      where,
      orderBy: {
        syncedAt: 'desc',
      },
      select: {
        eventDate: true,
        syncedAt: true,
      },
    }),
    prisma.event.findFirst({
      where: {
        externalEventId: filter.externalEventId,
      },
      select: {
        id: true,
        name: true,
      },
    }),
    prisma.czechRankingEventResult.findMany({
      where,
      orderBy: [{ className: 'asc' }, { place: 'asc' }, { registration: 'asc' }],
      take: EVENT_RESULT_DETAIL_LIMIT,
      select: {
        id: true,
        externalEventId: true,
        eventDate: true,
        rankingType: true,
        rankingCategory: true,
        className: true,
        competitorName: true,
        registration: true,
        place: true,
        time: true,
        rankingPoints: true,
        rankingReferenceValue: true,
        syncedAt: true,
      },
    }),
  ]);

  if (resultCount === 0 || !latestRow) {
    throw new NotFoundError('Czech ranking event result dataset not found');
  }

  return adminCzechRankingEventDetailSchema.parse({
    dataset: {
      externalEventId: filter.externalEventId,
      localEventId: localEvent?.id ?? null,
      localEventName: localEvent?.name ?? null,
      eventDate: latestRow.eventDate,
      rankingType: filter.rankingType,
      rankingCategory: filter.rankingCategory,
      resultCount,
      syncedAt: latestRow.syncedAt,
    },
    items: rows.map((row) => adminCzechRankingEventEntrySchema.parse(row)),
  });
}

export async function uploadAdminCzechRankingSnapshot(params: {
  csvData: string;
  rankingType: CzechRankingType;
  rankingCategory: CzechRankingCategory;
  validForMonthInput: string;
}) {
  const validForMonth = normalizeCzechRankingMonthInput(params.validForMonthInput);
  if (!validForMonth) {
    throw new Error('Invalid validForMonth. Expected YYYY-MM');
  }

  const importedEntries = await storeCzechRankingData({
    csvData: params.csvData,
    rankingType: params.rankingType,
    rankingCategory: params.rankingCategory,
    validForMonth,
  });

  return adminCzechRankingUploadResultSchema.parse({
    rankingType: params.rankingType,
    rankingCategory: params.rankingCategory,
    validForMonth,
    importedEntries,
  });
}

export async function syncAdminCzechRankingEventResults(
  scope: AdminCzechRankingSyncScope,
  now: Date = new Date(),
) {
  const startedAt = new Date();
  const rankingTypes: CzechRankingType[] = scope === 'ALL' ? ['FOREST', 'SPRINT'] : [scope];

  let syncedEvents = 0;

  for (const rankingType of rankingTypes) {
    const windowStart = resolveCurrentCzechRankingWindowStart(rankingType, now);
    if (!windowStart) {
      continue;
    }

    syncedEvents += await syncCzechRankingEventResultsFromOris({
      rankingType,
      dateFrom: windowStart,
      dateTo: now,
    });
  }

  return adminCzechRankingSyncResultSchema.parse({
    scope,
    syncedTypes: rankingTypes,
    syncedEvents,
    startedAt,
    finishedAt: new Date(),
  });
}

export async function clearAdminCzechRankingSnapshots(
  prisma,
  filter?: Partial<SnapshotDatasetFilter>,
) {
  const deleted = await prisma.rankingCzech.deleteMany({
    where: filter
      ? {
          ...(filter.rankingType ? { rankingType: filter.rankingType } : {}),
          ...(filter.rankingCategory ? { rankingCategory: filter.rankingCategory } : {}),
          ...(filter.validForMonth ? { validForMonth: toUtcDateOnly(filter.validForMonth) } : {}),
        }
      : undefined,
  });

  return adminCzechRankingClearResultSchema.parse({
    scope: 'SNAPSHOTS',
    deletedCount: deleted.count,
  });
}

export async function clearAdminCzechRankingEventResults(
  prisma,
  filter?: Partial<EventDatasetFilter>,
) {
  const deleted = await prisma.czechRankingEventResult.deleteMany({
    where: filter
      ? {
          ...(filter.externalEventId ? { externalEventId: filter.externalEventId } : {}),
          ...(filter.rankingType ? { rankingType: filter.rankingType } : {}),
          ...(filter.rankingCategory ? { rankingCategory: filter.rankingCategory } : {}),
        }
      : undefined,
  });

  return adminCzechRankingClearResultSchema.parse({
    scope: 'EVENT_RESULTS',
    deletedCount: deleted.count,
  });
}
