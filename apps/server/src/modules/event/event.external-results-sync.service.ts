import type { AppPrismaClient } from '../../db/prisma-client.js';
import type { ExternalSource, ExternalResultsSyncStatus } from '../../generated/prisma/client.js';
import {
  ExternalImportError,
  buildEventorUrl,
  buildOrisUrl,
  fetchExternalPayload,
  getEventorApiKey,
} from './event.import.service.js';
import { buildOfficialResultsUrl } from './event.status.service.js';

type SyncableExternalProvider = Extract<ExternalSource, 'ORIS' | 'EVENTOR'>;

type SyncableEvent = {
  id: string;
  externalSource: SyncableExternalProvider | null;
  externalEventId: string | null;
  resultsOfficialAt: Date | null;
  externalResultsSync: {
    lastDetectedOfficialAt: Date | null;
    lastSuccessfulCheckAt: Date | null;
  } | null;
};

export type OfficialResultsSyncOutcome = {
  provider: SyncableExternalProvider;
  status: Extract<ExternalResultsSyncStatus, 'OFFICIAL' | 'NOT_FOUND'>;
  officialResultsDetected: boolean;
  officialResultsUrl: string | null;
  lastCheckedAt: Date;
  lastSuccessfulCheckAt: Date;
  lastDetectedOfficialAt: Date | null;
  resultsOfficialAt: Date | null;
  lastError: null;
};

type SyncOfficialResultsOptions = {
  eventId: string;
  apiKey?: string;
  now?: Date;
};

type ProviderFetchResult = {
  provider: SyncableExternalProvider;
  payload: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getTrimmedRecordString(value: unknown, key: string): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const candidate = value[key];
  if (typeof candidate !== 'string') {
    return null;
  }

  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hasMeaningfulNode(value: unknown, visited = new Set<unknown>()): boolean {
  if (value === null || typeof value === 'undefined') {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasMeaningfulNode(item, visited));
  }

  if (!isRecord(value) || visited.has(value)) {
    return false;
  }

  visited.add(value);
  return Object.values(value).some((item) => hasMeaningfulNode(item, visited));
}

function containsNamedResultNode(
  value: unknown,
  matcher: (key: string, child: unknown) => boolean,
  visited = new Set<unknown>(),
): boolean {
  if (value === null || typeof value === 'undefined') {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsNamedResultNode(item, matcher, visited));
  }

  if (!isRecord(value) || visited.has(value)) {
    return false;
  }

  visited.add(value);

  for (const [key, child] of Object.entries(value)) {
    if (matcher(key, child)) {
      return true;
    }

    if (containsNamedResultNode(child, matcher, visited)) {
      return true;
    }
  }

  return false;
}

export function hasOfficialResultsInPayload(
  payload: unknown,
  provider: SyncableExternalProvider,
): boolean {
  if (provider === 'EVENTOR') {
    return containsNamedResultNode(
      payload,
      (key, child) => key.toLowerCase() === 'personresult' && hasMeaningfulNode(child),
    );
  }

  return containsNamedResultNode(
    payload,
    (key, child) => /^results?(_\d+)?$/i.test(key) && hasMeaningfulNode(child),
  );
}

function validateOrisResultsPayload(payload: unknown): unknown {
  const status = getTrimmedRecordString(payload, 'Status');
  if (!status || status === 'OK') {
    return payload;
  }

  if (/id not valid/i.test(status)) {
    throw new ExternalImportError('External event was not found.', 404);
  }

  throw new ExternalImportError(`ORIS returned unexpected status "${status}".`, 502);
}

async function fetchProviderPayload(
  event: SyncableEvent,
  apiKey?: string,
): Promise<ProviderFetchResult> {
  const externalEventId = event.externalEventId?.trim();
  const provider = event.externalSource;

  if (!provider || !externalEventId) {
    throw new ExternalImportError('External event link is not configured.', 422);
  }

  if (provider === 'ORIS') {
    const payload = await fetchExternalPayload(
      buildOrisUrl('getEventResults', { eventid: externalEventId }),
    );

    return {
      provider,
      payload: validateOrisResultsPayload(payload),
    };
  }

  const resolvedApiKey = getEventorApiKey({ apiKey });

  return {
    provider,
    payload: await fetchExternalPayload(
      buildEventorUrl('results/event', {
        eventId: externalEventId,
        includeSplitTimes: 'false',
        top: '1',
      }),
      {
        ApiKey: resolvedApiKey,
        'Api-Key': resolvedApiKey,
      },
    ),
  };
}

async function updateSyncState(
  prisma: AppPrismaClient,
  params: {
    eventId: string;
    provider: SyncableExternalProvider;
    lastCheckedAt: Date;
    lastSuccessfulCheckAt: Date | null;
    lastDetectedOfficialAt: Date | null;
    lastStatus: ExternalResultsSyncStatus;
    lastError: string | null;
  },
) {
  await prisma.eventExternalResultsSyncState.upsert({
    where: {
      eventId: params.eventId,
    },
    create: {
      eventId: params.eventId,
      provider: params.provider,
      lastCheckedAt: params.lastCheckedAt,
      lastSuccessfulCheckAt: params.lastSuccessfulCheckAt,
      lastDetectedOfficialAt: params.lastDetectedOfficialAt,
      lastStatus: params.lastStatus,
      lastError: params.lastError,
    },
    update: {
      provider: params.provider,
      lastCheckedAt: params.lastCheckedAt,
      lastSuccessfulCheckAt: params.lastSuccessfulCheckAt,
      lastDetectedOfficialAt: params.lastDetectedOfficialAt,
      lastStatus: params.lastStatus,
      lastError: params.lastError,
    },
  });
}

export async function syncOfficialResultsForEvent(
  prisma: AppPrismaClient,
  options: SyncOfficialResultsOptions,
): Promise<OfficialResultsSyncOutcome> {
  const event = await prisma.event.findUnique({
    where: {
      id: options.eventId,
    },
    select: {
      id: true,
      externalSource: true,
      externalEventId: true,
      resultsOfficialAt: true,
      externalResultsSync: {
        select: {
          lastDetectedOfficialAt: true,
          lastSuccessfulCheckAt: true,
        },
      },
    },
  });

  if (!event) {
    throw new ExternalImportError('Event not found.', 404);
  }

  const now = options.now ?? new Date();

  try {
    const { provider, payload } = await fetchProviderPayload(event, options.apiKey);
    const officialResultsDetected = hasOfficialResultsInPayload(payload, provider);
    const status: OfficialResultsSyncOutcome['status'] = officialResultsDetected
      ? 'OFFICIAL'
      : 'NOT_FOUND';
    const resultsOfficialAt = officialResultsDetected
      ? (event.resultsOfficialAt ?? now)
      : event.resultsOfficialAt;
    const lastDetectedOfficialAt = officialResultsDetected
      ? now
      : (event.externalResultsSync?.lastDetectedOfficialAt ?? null);

    if (officialResultsDetected && !event.resultsOfficialAt) {
      await prisma.event.update({
        where: {
          id: event.id,
        },
        data: {
          resultsOfficialAt: now,
        },
      });
    }

    await updateSyncState(prisma, {
      eventId: event.id,
      provider,
      lastCheckedAt: now,
      lastSuccessfulCheckAt: now,
      lastDetectedOfficialAt,
      lastStatus: status,
      lastError: null,
    });

    return {
      provider,
      status,
      officialResultsDetected,
      officialResultsUrl: buildOfficialResultsUrl(provider, event.externalEventId),
      lastCheckedAt: now,
      lastSuccessfulCheckAt: now,
      lastDetectedOfficialAt,
      resultsOfficialAt,
      lastError: null,
    };
  } catch (error) {
    const normalizedError =
      error instanceof ExternalImportError
        ? error
        : new ExternalImportError('Failed to synchronize official results.', 502);

    const provider = event.externalSource;
    if (provider) {
      await updateSyncState(prisma, {
        eventId: event.id,
        provider,
        lastCheckedAt: now,
        lastSuccessfulCheckAt: event.externalResultsSync?.lastSuccessfulCheckAt ?? null,
        lastDetectedOfficialAt: event.externalResultsSync?.lastDetectedOfficialAt ?? null,
        lastStatus: normalizedError.statusCode === 404 ? 'NOT_FOUND' : 'ERROR',
        lastError: normalizedError.message,
      });
    }

    throw normalizedError;
  }
}
