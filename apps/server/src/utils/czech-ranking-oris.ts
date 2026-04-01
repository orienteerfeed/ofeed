import env from '../config/env.js';
import type {
  CzechRankingCategory,
  CzechRankingType,
  EventDiscipline,
} from '../generated/prisma/client.js';
import { logger } from '../lib/logging.js';
import prisma from './context.js';
import { loadOrisEventCandidatesByDateRange } from '../modules/event/event.import.service.js';

const ORIS_REQUEST_TIMEOUT_MS = 15_000;
const CZECH_RANKING_ORIS_SYNC_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CZECH_RANKING_ORIS_SYNC_FAILURE_COOLDOWN_MS = 10 * 60 * 1000;
const CZECH_RANKING_SPRINT_WINDOW_MONTHS = 24;

const czechRankingOrisSyncInFlight = new Map<CzechRankingType, Promise<boolean>>();
const czechRankingOrisSyncCooldownUntil = new Map<CzechRankingType, number>();

export function resetCzechRankingOrisSyncStateForTesting(): void {
  czechRankingOrisSyncInFlight.clear();
  czechRankingOrisSyncCooldownUntil.clear();
}

export async function waitForCzechRankingOrisSyncsForTesting(): Promise<void> {
  await Promise.allSettled(Array.from(czechRankingOrisSyncInFlight.values()));
}

type OrisRankingTypesResponse = {
  Data?: Record<
    string,
    {
      ID?: string;
      NameCZ?: string;
      NameEN?: string;
    }
  >;
};

type OrisEventRankResultsResponse = {
  Data?: Record<
    string,
    {
      ID?: string;
      ClassID?: string;
      ClassDesc?: string;
      Place?: string;
      Name?: string;
      RegNo?: string;
      Time?: string;
      Points?: string;
      UserKoef?: string;
      UserID?: string;
      Type?: string;
    }
  >;
};

function startOfUtcMonth(input: Date): Date {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), 1));
}

function addUtcMonths(input: Date, months: number): Date {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth() + months, 1));
}

function normalizeRegistration(registration?: string | null): string | null {
  if (!registration) {
    return null;
  }

  const normalized = registration.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

function isCzechRankingEligibleClassName(className?: string | null): boolean {
  if (!className) {
    return false;
  }

  return /^(H20|H21|D20|D21)/i.test(className.trim());
}

function resolveCzechRankingCategoryFromClassName(
  className?: string | null,
): CzechRankingCategory | null {
  if (!className) {
    return null;
  }

  const normalized = className.trim().toUpperCase();
  if (normalized.startsWith('H')) {
    return 'M';
  }
  if (normalized.startsWith('D')) {
    return 'F';
  }

  return null;
}

function resolveCzechRankingTypeForDiscipline(
  discipline?: EventDiscipline,
): CzechRankingType | null {
  switch (discipline) {
    case 'MIDDLE':
    case 'LONG':
    case 'NIGHT':
      return 'FOREST';
    case 'SPRINT':
      return 'SPRINT';
    default:
      return null;
  }
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDateTimeIso(date: Date): string {
  return date.toISOString();
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function parseInteger(value?: string): number | null {
  if (typeof value !== 'string') {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchOrisJson<T>(method: string, params: Record<string, string>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ORIS_REQUEST_TIMEOUT_MS);

  try {
    const url = new URL(env.ORIS_API_BASE_URL);
    url.searchParams.set('format', 'json');
    url.searchParams.set('method', method);

    for (const [key, value] of Object.entries(params)) {
      if (value.trim().length > 0) {
        url.searchParams.set(key, value);
      }
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json, text/plain;q=0.9, */*;q=0.5',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`ORIS request ${method} failed with status ${response.status}.`);
    }

    const text = await response.text();
    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveOrisCzechRankingTypeId(rankingType: CzechRankingType): Promise<string> {
  const payload = await fetchOrisJson<OrisRankingTypesResponse>('getRankingTypes', { sport: '1' });
  const rankingTypes = Object.values(payload.Data ?? {});

  const match = rankingTypes.find((item) => {
    const english = item.NameEN?.toLowerCase() ?? '';
    const czech = item.NameCZ?.toLowerCase() ?? '';

    if (rankingType === 'FOREST') {
      return english.includes('forest') || czech.includes('lesní');
    }

    return english.includes('sprint') || czech.includes('sprint');
  });

  if (!match?.ID) {
    throw new Error(`Unable to resolve ORIS ranking type for ${rankingType}.`);
  }

  return match.ID;
}

function mapEventRankResults(
  payload: OrisEventRankResultsResponse,
  params: {
    externalEventId: string;
    eventDate: Date;
    rankingType: CzechRankingType;
  },
) {
  return Object.values(payload.Data ?? {})
    .map((item) => {
      const className = item.ClassDesc?.trim();
      const rankingCategory = resolveCzechRankingCategoryFromClassName(className);
      const registration = normalizeRegistration(item.RegNo);
      const rankingPoints = parseInteger(item.Points);

      if (
        !className ||
        !rankingCategory ||
        !registration ||
        rankingPoints === null ||
        !isCzechRankingEligibleClassName(className)
      ) {
        return null;
      }

      return {
        externalEventId: params.externalEventId,
        eventDate: params.eventDate,
        rankingType: params.rankingType,
        rankingCategory,
        classExternalId: item.ClassID?.trim() || null,
        className,
        competitorName: item.Name?.trim() || null,
        registration,
        place: parseInteger(item.Place),
        time: item.Time?.trim() || null,
        rankingPoints,
        rankingReferenceValue: parseInteger(item.UserKoef),
        orisResultId: item.ID?.trim() || null,
        orisUserId: item.UserID?.trim() || null,
        syncedAt: new Date(),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

async function syncSingleOrisCzechRankingEvent(params: {
  externalEventId: string;
  eventDate: Date;
  rankingType: CzechRankingType;
  orisRankingTypeId: string;
}): Promise<void> {
  const payload = await fetchOrisJson<OrisEventRankResultsResponse>('getEventRankResults', {
    eventid: params.externalEventId,
    type: params.orisRankingTypeId,
  });

  const rows = mapEventRankResults(payload, {
    externalEventId: params.externalEventId,
    eventDate: params.eventDate,
    rankingType: params.rankingType,
  });

  const transactionSteps = [
    prisma.czechRankingEventResult.deleteMany({
      where: {
        externalEventId: params.externalEventId,
        rankingType: params.rankingType,
      },
    }),
  ];

  if (rows.length > 0) {
    transactionSteps.push(
      prisma.czechRankingEventResult.createMany({
        data: rows,
      }),
    );
  }

  await prisma.$transaction(transactionSteps);
}

export async function pruneObsoleteCzechRankingEventResults(now: Date = new Date()): Promise<void> {
  const sprintWindowStart = addUtcMonths(
    startOfUtcMonth(now),
    -(CZECH_RANKING_SPRINT_WINDOW_MONTHS - 1),
  );

  await prisma.czechRankingEventResult.deleteMany({
    where: {
      eventDate: {
        lt: sprintWindowStart,
      },
    },
  });
}

export async function syncCzechRankingEventResultsFromOris(params: {
  rankingType: CzechRankingType;
  dateFrom: Date;
  dateTo?: Date;
}): Promise<number> {
  const dateTo = params.dateTo ?? new Date();
  const startedAt = Date.now();

  logger.info('Czech ranking ORIS sync started', {
    rankingType: params.rankingType,
    dateFrom: formatDateOnly(params.dateFrom),
    dateTo: formatDateOnly(dateTo),
  });

  const orisRankingTypeId = await resolveOrisCzechRankingTypeId(params.rankingType);
  const candidates = await loadOrisEventCandidatesByDateRange({
    dateFrom: formatDateOnly(params.dateFrom),
    dateTo: formatDateOnly(dateTo),
  });

  const rankingEventCandidates = candidates.filter((candidate) => {
    if (!candidate.ranking || candidate.relay || !candidate.date) {
      return false;
    }

    return resolveCzechRankingTypeForDiscipline(candidate.discipline) === params.rankingType;
  });

  const syncedEventIds: string[] = [];

  for (const candidate of rankingEventCandidates) {
    const eventDate = new Date(candidate.date);
    if (Number.isNaN(eventDate.getTime())) {
      continue;
    }

    await syncSingleOrisCzechRankingEvent({
      externalEventId: candidate.externalEventId,
      eventDate,
      rankingType: params.rankingType,
      orisRankingTypeId,
    });

    syncedEventIds.push(candidate.externalEventId);
  }

  await prisma.czechRankingEventResult.deleteMany({
    where: {
      rankingType: params.rankingType,
      eventDate: {
        gte: params.dateFrom,
        lte: dateTo,
      },
      ...(syncedEventIds.length > 0
        ? {
            externalEventId: {
              notIn: syncedEventIds,
            },
          }
        : {}),
    },
  });

  await pruneObsoleteCzechRankingEventResults(dateTo);

  logger.info('Czech ranking ORIS sync completed', {
    rankingType: params.rankingType,
    dateFrom: formatDateOnly(params.dateFrom),
    dateTo: formatDateOnly(dateTo),
    eventsFound: rankingEventCandidates.length,
    eventsSynced: syncedEventIds.length,
    durationMs: Date.now() - startedAt,
  });

  return syncedEventIds.length;
}

export async function ensureCzechRankingEventResultsSynchronized(params: {
  rankingType: CzechRankingType;
  windowStart: Date;
  now?: Date;
  blocking?: boolean;
}): Promise<boolean> {
  const now = params.now ?? new Date();
  const blocking = params.blocking ?? true;

  const latestSyncedRow = await prisma.czechRankingEventResult.findFirst({
    where: {
      rankingType: params.rankingType,
      eventDate: {
        gte: params.windowStart,
        lte: now,
      },
    },
    orderBy: {
      syncedAt: 'desc',
    },
    select: {
      syncedAt: true,
    },
  });

  if (
    latestSyncedRow &&
    now.getTime() - new Date(latestSyncedRow.syncedAt).getTime() < CZECH_RANKING_ORIS_SYNC_TTL_MS
  ) {
    await pruneObsoleteCzechRankingEventResults(now);
    logger.info('Czech ranking ORIS sync skipped because recent data already exists', {
      rankingType: params.rankingType,
      dateFrom: formatDateOnly(params.windowStart),
      dateTo: formatDateOnly(now),
      latestSyncedAt: formatDateTimeIso(new Date(latestSyncedRow.syncedAt)),
    });
    return false;
  }

  const cooldownUntil = czechRankingOrisSyncCooldownUntil.get(params.rankingType);
  if (cooldownUntil && cooldownUntil > now.getTime()) {
    logger.warn('Czech ranking ORIS sync skipped because failure cooldown is active', {
      rankingType: params.rankingType,
      dateFrom: formatDateOnly(params.windowStart),
      dateTo: formatDateOnly(now),
      cooldownAppliedUntil: formatDateTimeIso(new Date(cooldownUntil)),
    });
    return false;
  }

  const inFlightSync = czechRankingOrisSyncInFlight.get(params.rankingType);
  if (inFlightSync) {
    return blocking ? inFlightSync : false;
  }

  const syncPromise = syncCzechRankingEventResultsFromOris({
    rankingType: params.rankingType,
    dateFrom: params.windowStart,
    dateTo: now,
  })
    .then(async () => {
      czechRankingOrisSyncCooldownUntil.delete(params.rankingType);
      await pruneObsoleteCzechRankingEventResults(now);
      return true;
    })
    .catch((error) => {
      const cooldownAppliedUntil = Date.now() + CZECH_RANKING_ORIS_SYNC_FAILURE_COOLDOWN_MS;
      czechRankingOrisSyncCooldownUntil.set(params.rankingType, cooldownAppliedUntil);
      logger.warn('Czech ranking ORIS sync failed and cooldown was applied', {
        rankingType: params.rankingType,
        dateFrom: formatDateOnly(params.windowStart),
        dateTo: formatDateOnly(now),
        failureReason: getErrorMessage(error),
        cooldownAppliedUntil: formatDateTimeIso(new Date(cooldownAppliedUntil)),
      });
      throw error;
    })
    .finally(() => {
      czechRankingOrisSyncInFlight.delete(params.rankingType);
    });

  czechRankingOrisSyncInFlight.set(params.rankingType, syncPromise);

  if (!blocking) {
    syncPromise.catch(() => undefined);
    return false;
  }

  return syncPromise;
}
