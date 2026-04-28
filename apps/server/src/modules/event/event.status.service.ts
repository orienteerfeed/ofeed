import type { ExternalSource } from '../../generated/prisma/client.js';
import type { AppPrismaClient } from '../../db/prisma-client.js';

export type EventLifecycleStatus = 'DRAFT' | 'UPCOMING' | 'LIVE' | 'DONE';
export type EventPrimaryStatus = EventLifecycleStatus;
export type EventResultsStatus = 'NONE' | 'LIVE' | 'UNOFFICIAL' | 'OFFICIAL';
export type EventEntriesStatus = 'CLOSED' | 'OPEN';
export type EventOfficialResultsSource = 'ORIS' | 'EVENTOR' | 'LOCAL';

export type EventStatusSummary = {
  primary: EventPrimaryStatus;
  lifecycle: EventLifecycleStatus;
  results: EventResultsStatus;
  entries: EventEntriesStatus;
  entriesConfigured: boolean;
  officialResultsUrl: string | null;
  officialResultsSource: EventOfficialResultsSource | null;
  resultsOfficialAt: Date | null;
  resultsOfficialCheckedAt: Date | null;
};

type EventStatusComputationInput = {
  published: boolean;
  date: Date;
  timezone: string;
  entriesOpenAt?: Date | null;
  entriesCloseAt?: Date | null;
  resultsOfficialAt?: Date | null;
  resultsOfficialManuallySetAt?: Date | null;
  externalSource?: ExternalSource | null;
  externalEventId?: string | null;
  hasResultData: boolean;
  resultsOfficialCheckedAt?: Date | null;
  now?: Date;
};

type StatusSummaryEvent = {
  id: string;
  published: boolean;
  date: Date;
  timezone: string;
  entriesOpenAt: Date | null;
  entriesCloseAt: Date | null;
  resultsOfficialAt: Date | null;
  resultsOfficialManuallySetAt: Date | null;
  externalSource: ExternalSource | null;
  externalEventId: string | null;
};

const RESULT_DATA_STATUSES = [
  'OK',
  'Finished',
  'MissingPunch',
  'Disqualified',
  'DidNotFinish',
  'OverTime',
  'SportingWithdrawal',
  'NotCompeting',
  'Moved',
  'MovedUp',
  'Cancelled',
] as const;

function getDateKeyInTimeZone(date: Date, timeZone: string): string | null {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(date);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;

    if (!year || !month || !day) {
      return null;
    }

    return `${year}-${month}-${day}`;
  } catch {
    return null;
  }
}

function getStoredEventDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}


export function buildOfficialResultsUrl(
  externalSource: ExternalSource | null | undefined,
  externalEventId: string | null | undefined,
): string | null {
  const normalizedExternalEventId = externalEventId?.trim();

  if (!externalSource || !normalizedExternalEventId) {
    return null;
  }

  if (externalSource === 'ORIS') {
    return `https://oris.ceskyorientak.cz/Vysledky?id=${encodeURIComponent(normalizedExternalEventId)}`;
  }

  return `https://eventor.orienteering.sport/Events/ResultList?eventId=${encodeURIComponent(normalizedExternalEventId)}&groupBy=EventClass`;
}

export function computeEventStatusSummary(input: EventStatusComputationInput): EventStatusSummary {
  const now = input.now ?? new Date();
  const eventDateKey =
    getDateKeyInTimeZone(input.date, input.timezone) ?? getStoredEventDateKey(input.date);
  const nowDateKey = getDateKeyInTimeZone(now, input.timezone) ?? getStoredEventDateKey(now);

  let lifecycle: EventLifecycleStatus;
  if (!input.published) {
    lifecycle = 'DRAFT';
  } else if (nowDateKey < eventDateKey) {
    lifecycle = 'UPCOMING';
  } else if (nowDateKey === eventDateKey) {
    lifecycle = now < input.date ? 'UPCOMING' : 'LIVE';
  } else {
    lifecycle = 'DONE';
  }

  const entriesConfigured = Boolean(input.entriesOpenAt || input.entriesCloseAt);
  const isAfterEntriesOpen = !input.entriesOpenAt || now >= input.entriesOpenAt;
  const isBeforeEntriesClose = !input.entriesCloseAt || now <= input.entriesCloseAt;
  const entries: EventEntriesStatus =
    entriesConfigured && isAfterEntriesOpen && isBeforeEntriesClose ? 'OPEN' : 'CLOSED';

  const resultsOfficialAt = input.resultsOfficialAt ?? input.resultsOfficialManuallySetAt ?? null;
  const officialResultsSource: EventOfficialResultsSource | null = resultsOfficialAt
    ? input.externalSource
      ? input.externalSource
      : input.resultsOfficialManuallySetAt
        ? 'LOCAL'
        : null
    : null;
  const officialResultsUrl =
    officialResultsSource && officialResultsSource !== 'LOCAL'
      ? buildOfficialResultsUrl(input.externalSource, input.externalEventId)
      : null;

  let results: EventResultsStatus = 'NONE';
  if (resultsOfficialAt) {
    results = 'OFFICIAL';
  } else if (input.hasResultData) {
    results = lifecycle === 'DONE' ? 'UNOFFICIAL' : 'LIVE';
  }

  const primary: EventPrimaryStatus = resultsOfficialAt ? 'DONE' : lifecycle;

  return {
    primary,
    lifecycle,
    results,
    entries,
    entriesConfigured,
    officialResultsUrl,
    officialResultsSource,
    resultsOfficialAt,
    resultsOfficialCheckedAt: input.resultsOfficialCheckedAt ?? null,
  };
}

export async function getEventStatusSummary(
  prisma: AppPrismaClient,
  event: StatusSummaryEvent,
  options?: {
    now?: Date;
  },
): Promise<EventStatusSummary> {
  const [resultDataCount, syncState] = await Promise.all([
    prisma.competitor.count({
      where: {
        class: {
          eventId: event.id,
        },
        OR: [
          { time: { not: null } },
          { finishTime: { not: null } },
          {
            status: {
              in: [...RESULT_DATA_STATUSES],
            },
          },
        ],
      },
    }),
    prisma.eventExternalResultsSyncState.findUnique({
      where: {
        eventId: event.id,
      },
      select: {
        lastCheckedAt: true,
      },
    }),
  ]);

  return computeEventStatusSummary({
    ...event,
    hasResultData: resultDataCount > 0,
    resultsOfficialCheckedAt: syncState?.lastCheckedAt ?? null,
    now: options?.now,
  });
}
