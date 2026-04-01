import { DatabaseError, NotFoundError } from '../exceptions/index.js';
import type { EventDiscipline, ResultStatus, StartMode } from '../generated/prisma/client.js';
import prisma from './context.js';
import { ensureCzechRankingEventResultsSynchronized } from './czech-ranking-oris.js';

const CZECH_RANKING_REGISTRATION_REGEX = /^[A-Z]{3}\d{4}$/;
const CZECH_RANKING_ELIGIBLE_CLASS_REGEX = /^(H20|H21|D20|D21)/i;
const CZECH_RANKING_EXCLUDED_STATUSES: ResultStatus[] = [
  'NotCompeting',
  'DidNotStart',
  'DidNotEnter',
  'Cancelled',
];
const CZECH_RANKING_FINISHED_STATUS: ResultStatus = 'OK';
const CZECH_RANKING_FIELD_STRENGTH_COUNT = 4;
const CZECH_RANKING_RESULTS_TO_COUNT = 5;
const CZECH_RANKING_FOREST_WINDOW_MONTHS = 12;
const CZECH_RANKING_SPRINT_WINDOW_MONTHS = 24;
const CZECH_RANKING_WRITE_CONFLICT_MAX_RETRIES = 3;
const CZECH_RANKING_WRITE_CONFLICT_RETRY_DELAY_MS = 100;

type CzechRankingBucket = 'FOREST' | 'SPRINT' | 'NONE';
type CzechRankingType = 'FOREST' | 'SPRINT';
type CzechRankingCategory = 'M' | 'F';
type CzechRankingCountReason =
  | 'counts'
  | 'event_not_eligible'
  | 'class_not_eligible'
  | 'discipline_not_eligible'
  | 'invalid_registration'
  | 'missing_points'
  | 'outside_time_window'
  | 'outside_top_five';

type EventClassWithCompetitors = {
  id: number;
  name: string;
  competitors: Array<{
    id: number;
    registration: string;
    time: number | null;
    status: ResultStatus;
  }>;
};

type RankedCompetitor = {
  id: number;
  registration: string;
  rankingPoints: number | null;
  rankingReferenceValue?: number | null;
};

type DecoratedCompetitor = {
  rankingPoints?: number | null;
  rankingReferenceValue?: number | null;
  countsTowardsRanking: boolean;
  countsTowardsRankingReason: CzechRankingCountReason;
};

type RankingResultCandidate = {
  key: string;
  registration: string;
  rankingPoints: number;
  rankingReferenceValue: number | null;
  eventDate: Date;
  source: 'OFFICIAL' | 'LIVE';
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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function isCzechRankingWriteConflict(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("record has changed since last read in table 'competitor'") ||
    message.includes('record has changed since last read in table "competitor"') ||
    message.includes('write conflict') ||
    message.includes('deadlock') ||
    message.includes('unable to start a transaction in the given time') ||
    message.includes('transaction api error') ||
    message.includes('p2034')
  );
}

export function resolveCzechRankingCategoryFromClassName(
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

export function isCzechRankingEligibleRegistration(registration?: string | null): boolean {
  const normalized = normalizeRegistration(registration);
  return normalized ? CZECH_RANKING_REGISTRATION_REGEX.test(normalized) : false;
}

export function isCzechRankingEligibleClassName(className?: string | null): boolean {
  if (!className) {
    return false;
  }

  return CZECH_RANKING_ELIGIBLE_CLASS_REGEX.test(className.trim());
}

export function resolveCzechRankingBucket(discipline?: EventDiscipline | null): CzechRankingBucket {
  switch (discipline) {
    case 'MIDDLE':
    case 'LONG':
    case 'NIGHT':
      return 'FOREST';
    case 'SPRINT':
      return 'SPRINT';
    default:
      return 'NONE';
  }
}

function resolveCzechRankingType(bucket: CzechRankingBucket): CzechRankingType | null {
  if (bucket === 'NONE') {
    return null;
  }

  return bucket;
}

function resolveCzechRankingStartFactor(startMode: StartMode): number {
  return startMode === 'Mass' ? 0.15 : 0;
}

export function resolveCzechRankingSnapshotMonth(eventDate: Date): Date {
  const eventMonthStart = startOfUtcMonth(eventDate);
  return addUtcMonths(eventMonthStart, -1);
}

export function resolveEffectiveCzechRankingSnapshotMonth(
  targetMonth: Date,
  availableMonths: Date[],
): Date | null {
  const normalizedTargetMonth = startOfUtcMonth(targetMonth).getTime();

  return (
    availableMonths
      .map((availableMonth) => startOfUtcMonth(availableMonth))
      .filter((availableMonth) => availableMonth.getTime() <= normalizedTargetMonth)
      .sort((left, right) => right.getTime() - left.getTime())
      .at(0) ?? null
  );
}

export function resolveCurrentCzechRankingWindowStart(
  bucket: CzechRankingBucket,
  now: Date = new Date(),
): Date | null {
  const currentMonthStart = startOfUtcMonth(now);

  if (bucket === 'FOREST') {
    return addUtcMonths(currentMonthStart, -(CZECH_RANKING_FOREST_WINDOW_MONTHS - 1));
  }

  if (bucket === 'SPRINT') {
    return addUtcMonths(currentMonthStart, -(CZECH_RANKING_SPRINT_WINDOW_MONTHS - 1));
  }

  return null;
}

function calculatePerformanceCenter(
  competitors: Array<{ registration: string; time: number | null; status: ResultStatus }>,
): number | null {
  const topThreeTimes = competitors
    .filter(
      (competitor) =>
        competitor.time !== null &&
        competitor.status === CZECH_RANKING_FINISHED_STATUS &&
        isCzechRankingEligibleRegistration(competitor.registration),
    )
    .map((competitor) => competitor.time as number)
    .sort((left, right) => left - right)
    .slice(0, 3);

  if (topThreeTimes.length < 3) {
    return null;
  }

  return topThreeTimes[1];
}

function calculateFieldStrength(
  competitors: Array<{ registration: string; status: ResultStatus }>,
  rankingMap: Map<string, number>,
): number | null {
  const topRankingValues = competitors
    .filter(
      (competitor) =>
        !CZECH_RANKING_EXCLUDED_STATUSES.includes(competitor.status) &&
        isCzechRankingEligibleRegistration(competitor.registration),
    )
    .map(
      (competitor) =>
        rankingMap.get(normalizeRegistration(competitor.registration) as string) ?? null,
    )
    .filter((value): value is number => value !== null)
    .sort((left, right) => right - left)
    .slice(0, CZECH_RANKING_FIELD_STRENGTH_COUNT);

  if (topRankingValues.length < CZECH_RANKING_FIELD_STRENGTH_COUNT) {
    return null;
  }

  return (
    topRankingValues.reduce((sum, value) => sum + value, 0) / CZECH_RANKING_FIELD_STRENGTH_COUNT
  );
}

function calculateRatedCompetitorPositions(
  competitors: Array<{ id: number; time: number | null; status: ResultStatus }>,
): Map<number, { position: number; time: number }> {
  return new Map(
    competitors
      .filter(
        (competitor): competitor is { id: number; time: number; status: ResultStatus } =>
          competitor.time !== null && competitor.status === CZECH_RANKING_FINISHED_STATUS,
      )
      .sort((left, right) => left.time - right.time)
      .map((competitor, index) => [
        competitor.id,
        {
          position: index + 1,
          time: competitor.time,
        },
      ]),
  );
}

export function calculateCzechRankingPointsForResult(params: {
  competitorTime: number;
  performanceCenter: number;
  fieldStrength: number;
  position: number;
  ratedCompetitorsCount: number;
  startFactor: number;
  eventCoefficient: number;
}): number {
  const {
    competitorTime,
    performanceCenter,
    fieldStrength,
    position,
    ratedCompetitorsCount,
    startFactor,
    eventCoefficient,
  } = params;

  const placementFactor =
    ratedCompetitorsCount > 1
      ? 1 - (startFactor * (position - 1)) / (ratedCompetitorsCount - 1)
      : 1;

  const result =
    (2 - competitorTime / performanceCenter) * fieldStrength * placementFactor * eventCoefficient;

  return result > 0 ? Math.round(result) : 0;
}

async function clearEventCzechRankingValues(eventId: string): Promise<void> {
  await prisma.competitor.updateMany({
    where: {
      class: {
        is: {
          eventId,
        },
      },
    },
    data: {
      rankingPoints: null,
      rankingReferenceValue: null,
    },
  });
}

async function loadCzechRankingSnapshotMap(params: {
  rankingType: CzechRankingType;
  rankingCategory: CzechRankingCategory;
  targetMonth: Date;
}): Promise<Map<string, number>> {
  const availableSnapshotMonths = await prisma.rankingCzech.findMany({
    where: {
      rankingType: params.rankingType,
      rankingCategory: params.rankingCategory,
      validForMonth: {
        lte: params.targetMonth,
      },
    },
    select: {
      validForMonth: true,
    },
    distinct: ['validForMonth'],
    orderBy: {
      validForMonth: 'desc',
    },
  });

  const resolvedSnapshotMonth = resolveEffectiveCzechRankingSnapshotMonth(
    params.targetMonth,
    availableSnapshotMonths.map((row) => row.validForMonth),
  );

  if (!resolvedSnapshotMonth) {
    return new Map();
  }

  const snapshotRows = await prisma.rankingCzech.findMany({
    where: {
      rankingType: params.rankingType,
      rankingCategory: params.rankingCategory,
      validForMonth: resolvedSnapshotMonth,
    },
    select: {
      registration: true,
      rankIndex: true,
    },
  });

  return new Map(
    snapshotRows.map((row) => [normalizeRegistration(row.registration) as string, row.rankIndex]),
  );
}

async function calculateCzechRankingPointsForEventOnce(eventId: string): Promise<boolean> {
  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        countryId: true,
        ranking: true,
        relay: true,
        discipline: true,
        startMode: true,
        coefRanking: true,
        date: true,
        classes: {
          select: {
            id: true,
            name: true,
            competitors: {
              select: {
                id: true,
                registration: true,
                time: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundError(`Event with ID ${eventId} was not found in the database.`);
    }

    await clearEventCzechRankingValues(eventId);

    const bucket = resolveCzechRankingBucket(event.discipline);
    const rankingType = resolveCzechRankingType(bucket);

    if (!event.ranking || event.countryId !== 'CZ' || event.relay || !rankingType) {
      return true;
    }

    const snapshotMonth = resolveCzechRankingSnapshotMonth(event.date);
    const eventCoefficient = Number(event.coefRanking) || 1;
    const startFactor = resolveCzechRankingStartFactor(event.startMode);
    const snapshotCache = new Map<CzechRankingCategory, Map<string, number>>();

    for (const eventClass of event.classes.filter((eventClass) =>
      isCzechRankingEligibleClassName(eventClass.name),
    )) {
      const rankingCategory = resolveCzechRankingCategoryFromClassName(eventClass.name);
      if (!rankingCategory) {
        continue;
      }

      let rankingMap = snapshotCache.get(rankingCategory);
      if (!rankingMap) {
        rankingMap = await loadCzechRankingSnapshotMap({
          rankingType,
          rankingCategory,
          targetMonth: snapshotMonth,
        });
        snapshotCache.set(rankingCategory, rankingMap);
      }

      const performanceCenter = calculatePerformanceCenter(eventClass.competitors);
      const fieldStrength = calculateFieldStrength(eventClass.competitors, rankingMap);

      const registeredFinishers = eventClass.competitors.filter(
        (competitor) =>
          competitor.time !== null &&
          competitor.status === CZECH_RANKING_FINISHED_STATUS &&
          isCzechRankingEligibleRegistration(competitor.registration),
      );

      const ratedCompetitors = calculateRatedCompetitorPositions(eventClass.competitors);
      const ratedCompetitorsCount = ratedCompetitors.size;

      const updates = eventClass.competitors.map((competitor) => {
        const normalizedRegistration = normalizeRegistration(competitor.registration);
        const rankingReferenceValue =
          normalizedRegistration && rankingMap.has(normalizedRegistration)
            ? (rankingMap.get(normalizedRegistration) ?? null)
            : null;

        let rankingPoints: number | null = null;
        const ratedCompetitor = ratedCompetitors.get(competitor.id);

        if (
          normalizedRegistration &&
          ratedCompetitor &&
          performanceCenter !== null &&
          fieldStrength !== null &&
          registeredFinishers.length >= 4 &&
          isCzechRankingEligibleRegistration(normalizedRegistration)
        ) {
          rankingPoints = calculateCzechRankingPointsForResult({
            competitorTime: ratedCompetitor.time,
            performanceCenter,
            fieldStrength,
            position: ratedCompetitor.position,
            ratedCompetitorsCount,
            startFactor,
            eventCoefficient,
          });
        }

        return prisma.competitor.update({
          where: { id: competitor.id },
          data: {
            rankingPoints,
            rankingReferenceValue,
          },
        });
      });

      if (updates.length > 0) {
        await prisma.$transaction(updates);
      }
    }

    return true;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }

    throw new DatabaseError(`An error occurred: ${error instanceof Error ? error.message : error}`);
  }
}

export async function calculateCzechRankingPointsForEvent(eventId: string): Promise<boolean> {
  for (let attempt = 1; attempt <= CZECH_RANKING_WRITE_CONFLICT_MAX_RETRIES; attempt += 1) {
    try {
      return await calculateCzechRankingPointsForEventOnce(eventId);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }

      const shouldRetry =
        isCzechRankingWriteConflict(error) && attempt < CZECH_RANKING_WRITE_CONFLICT_MAX_RETRIES;

      console.error('Failed to calculate Czech ranking points:', error);

      if (!shouldRetry) {
        throw error;
      }

      await wait(CZECH_RANKING_WRITE_CONFLICT_RETRY_DELAY_MS * attempt);
    }
  }

  return false;
}

async function buildCurrentCzechRankingDecorationsForClass(
  classId: number,
): Promise<Map<number, DecoratedCompetitor>> {
  const currentClass = await prisma.class.findUnique({
    where: { id: classId },
    select: {
      id: true,
      name: true,
      event: {
        select: {
          id: true,
          date: true,
          countryId: true,
          externalSource: true,
          externalEventId: true,
          ranking: true,
          relay: true,
          discipline: true,
        },
      },
      competitors: {
        select: {
          id: true,
          registration: true,
          rankingPoints: true,
          rankingReferenceValue: true,
        },
      },
    },
  });

  if (!currentClass) {
    return new Map();
  }

  const baseDecorations = new Map<number, DecoratedCompetitor>(
    currentClass.competitors.map((competitor) => [
      competitor.id,
      {
        countsTowardsRanking: false,
        countsTowardsRankingReason: 'event_not_eligible',
      },
    ]),
  );

  if (
    !currentClass.event.ranking ||
    currentClass.event.countryId !== 'CZ' ||
    currentClass.event.relay
  ) {
    return baseDecorations;
  }

  if (!isCzechRankingEligibleClassName(currentClass.name)) {
    for (const competitor of currentClass.competitors) {
      baseDecorations.set(competitor.id, {
        countsTowardsRanking: false,
        countsTowardsRankingReason: 'class_not_eligible',
      });
    }
    return baseDecorations;
  }

  const bucket = resolveCzechRankingBucket(currentClass.event.discipline);
  if (bucket === 'NONE') {
    for (const competitor of currentClass.competitors) {
      baseDecorations.set(competitor.id, {
        countsTowardsRanking: false,
        countsTowardsRankingReason: 'discipline_not_eligible',
      });
    }
    return baseDecorations;
  }

  const now = new Date();
  const windowStart = resolveCurrentCzechRankingWindowStart(bucket, now);
  if (!windowStart) {
    return baseDecorations;
  }

  const rankingType = resolveCzechRankingType(bucket);
  if (!rankingType) {
    return baseDecorations;
  }

  const eventDate = new Date(currentClass.event.date);
  if (eventDate < windowStart || eventDate > now) {
    for (const competitor of currentClass.competitors) {
      baseDecorations.set(competitor.id, {
        countsTowardsRanking: false,
        countsTowardsRankingReason: 'outside_time_window',
      });
    }
    return baseDecorations;
  }

  await ensureCzechRankingEventResultsSynchronized({
    rankingType,
    windowStart,
    now,
    blocking: false,
  });

  const validRegistrations = Array.from(
    new Set(
      currentClass.competitors
        .map((competitor) => normalizeRegistration(competitor.registration))
        .filter((registration): registration is string =>
          Boolean(registration && isCzechRankingEligibleRegistration(registration)),
        ),
    ),
  );

  const officialRankingResults = validRegistrations.length
    ? await prisma.czechRankingEventResult.findMany({
        where: {
          registration: {
            in: validRegistrations,
          },
          rankingType,
          eventDate: {
            gte: windowStart,
            lte: now,
          },
        },
        select: {
          id: true,
          externalEventId: true,
          registration: true,
          rankingPoints: true,
          rankingReferenceValue: true,
          eventDate: true,
        },
      })
    : [];

  const officialCurrentEventResultsByRegistration = new Map<
    string,
    {
      id: number;
      rankingPoints: number;
      rankingReferenceValue: number | null;
      eventDate: Date;
      externalEventId: string;
    }
  >();

  if (
    currentClass.event.externalSource === 'ORIS' &&
    currentClass.event.externalEventId &&
    officialRankingResults.length > 0
  ) {
    for (const result of officialRankingResults) {
      if (result.externalEventId !== currentClass.event.externalEventId) {
        continue;
      }

      const normalizedRegistration = normalizeRegistration(result.registration);
      if (!normalizedRegistration) {
        continue;
      }

      officialCurrentEventResultsByRegistration.set(normalizedRegistration, result);
    }
  }

  const topResultKeysByRegistration = new Map<string, Set<string>>();

  for (const registration of validRegistrations) {
    const resultCandidates: RankingResultCandidate[] = officialRankingResults
      .filter((result) => normalizeRegistration(result.registration) === registration)
      .map((result) => ({
        key: `official:${result.id}`,
        registration,
        rankingPoints: result.rankingPoints,
        rankingReferenceValue: result.rankingReferenceValue,
        eventDate: new Date(result.eventDate),
        source: 'OFFICIAL' as const,
      }));

    const currentCompetitor = currentClass.competitors.find(
      (competitor) => normalizeRegistration(competitor.registration) === registration,
    );
    const officialCurrentEventResult = officialCurrentEventResultsByRegistration.get(registration);

    if (!officialCurrentEventResult && currentCompetitor?.rankingPoints !== null) {
      resultCandidates.push({
        key: `live:${currentCompetitor.id}`,
        registration,
        rankingPoints: currentCompetitor.rankingPoints,
        rankingReferenceValue: currentCompetitor.rankingReferenceValue ?? null,
        eventDate,
        source: 'LIVE',
      });
    }

    const topKeys = resultCandidates
      .sort((left, right) => {
        const pointsDelta = right.rankingPoints - left.rankingPoints;
        if (pointsDelta !== 0) {
          return pointsDelta;
        }

        const dateDelta = right.eventDate.getTime() - left.eventDate.getTime();
        if (dateDelta !== 0) {
          return dateDelta;
        }

        if (left.source !== right.source) {
          return left.source === 'OFFICIAL' ? -1 : 1;
        }

        return right.key.localeCompare(left.key);
      })
      .slice(0, CZECH_RANKING_RESULTS_TO_COUNT)
      .map((result) => result.key);

    topResultKeysByRegistration.set(registration, new Set(topKeys));
  }

  for (const competitor of currentClass.competitors) {
    const normalizedRegistration = normalizeRegistration(competitor.registration);

    if (!normalizedRegistration || !isCzechRankingEligibleRegistration(normalizedRegistration)) {
      baseDecorations.set(competitor.id, {
        countsTowardsRanking: false,
        countsTowardsRankingReason: 'invalid_registration',
      });
      continue;
    }

    const officialCurrentEventResult =
      officialCurrentEventResultsByRegistration.get(normalizedRegistration);
    const effectiveRankingPoints =
      officialCurrentEventResult?.rankingPoints ?? competitor.rankingPoints ?? null;
    const effectiveRankingReferenceValue =
      officialCurrentEventResult?.rankingReferenceValue ?? competitor.rankingReferenceValue ?? null;

    if (effectiveRankingPoints === null) {
      baseDecorations.set(competitor.id, {
        rankingPoints: null,
        rankingReferenceValue: effectiveRankingReferenceValue,
        countsTowardsRanking: false,
        countsTowardsRankingReason: 'missing_points',
      });
      continue;
    }

    const currentResultKey = officialCurrentEventResult
      ? `official:${officialCurrentEventResult.id}`
      : `live:${competitor.id}`;
    const topResultKeys = topResultKeysByRegistration.get(normalizedRegistration);
    const countsTowardsRanking = Boolean(topResultKeys?.has(currentResultKey));

    baseDecorations.set(competitor.id, {
      rankingPoints: effectiveRankingPoints,
      rankingReferenceValue: effectiveRankingReferenceValue,
      countsTowardsRanking,
      countsTowardsRankingReason: countsTowardsRanking ? 'counts' : 'outside_top_five',
    });
  }

  return baseDecorations;
}

export async function decorateCompetitorsWithCurrentCzechRankingState<T extends RankedCompetitor>(
  classId: number,
  competitors: T[],
): Promise<Array<T & DecoratedCompetitor>> {
  const decorations = await buildCurrentCzechRankingDecorationsForClass(classId);

  return competitors.map((competitor) => ({
    ...competitor,
    ...(decorations.get(competitor.id) ?? {
      countsTowardsRanking: false,
      countsTowardsRankingReason: 'event_not_eligible' as CzechRankingCountReason,
    }),
  }));
}
