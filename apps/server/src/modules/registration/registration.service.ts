import {
  parseBirthYearFromRegistration,
  parseSexFromRegistration,
  resolveTwoDigitYear,
  type ClubListItem,
  type RegistrationLookupItem,
  type RegistrationSport,
} from '@repo/shared';

import env from '../../config/env.js';
import type { AppPrismaClient } from '../../db/prisma-client.js';
import type {
  Club,
  ExternalSource,
  Registration,
  SyncStatus,
} from '../../generated/prisma/client.js';
import { logger } from '../../lib/logging.js';
import prisma from '../../utils/context.js';

const ORIS_REQUEST_TIMEOUT_MS = 15_000;
const REGISTRATION_SYNC_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CLUB_SYNC_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SYNC_FAILURE_COOLDOWN_MS = 10 * 60 * 1000;
const CREATE_MANY_CHUNK_SIZE = 1000;
const CLUBS_SYNC_KEY = 'ALL';

/** Only place in this module where ORIS's own numeric sport codes appear. */
const ORIS_SPORT_CODES: Record<RegistrationSport, number> = {
  OB: 1,
  LOB: 2,
  MTBO: 3,
  TRAIL: 4,
};

const registrationSyncInFlight = new Map<string, Promise<boolean>>();
const registrationSyncCooldownUntil = new Map<string, number>();
const clubSyncInFlight = new Map<string, Promise<boolean>>();
const clubSyncCooldownUntil = new Map<string, number>();

export function resetRegistrationSyncStateForTesting(): void {
  registrationSyncInFlight.clear();
  registrationSyncCooldownUntil.clear();
  clubSyncInFlight.clear();
  clubSyncCooldownUntil.clear();
}

export async function waitForRegistrationSyncsForTesting(): Promise<void> {
  await Promise.allSettled([...registrationSyncInFlight.values(), ...clubSyncInFlight.values()]);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function registrationSyncKey(sport: RegistrationSport, year: number): string {
  return `${sport}:${year}`;
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
      headers: { Accept: 'application/json, text/plain;q=0.9, */*;q=0.5' },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`ORIS request ${method} failed with status ${response.status}.`);
    }

    return JSON.parse(await response.text()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

type OrisRegistrationItem = {
  RegNo?: string;
  UserID?: string;
  Lic?: string;
  FirstName?: string;
  LastName?: string;
  SI?: string;
  ClubID?: string;
  Gender?: string;
  Born?: string;
};

type OrisRegistrationResponse = {
  Data?: Record<string, OrisRegistrationItem>;
};

type OrisClubItem = {
  ID?: string;
  Name?: string;
  Abbr?: string;
  Region?: string;
};

type OrisClubListResponse = {
  Data?: Record<string, OrisClubItem>;
};

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/** Fetch the full ČSOS club directory from ORIS and replace the local cache. */
export async function syncClubsFromOris(): Promise<number> {
  const payload = await fetchOrisJson<OrisClubListResponse>('getCSOSClubList', {});
  const now = new Date();

  const rows = Object.values(payload.Data ?? {})
    .map((item) => {
      const externalId = item.ID?.trim();
      const name = item.Name?.trim();
      const abbr = item.Abbr?.trim();
      if (!externalId || !name || !abbr) return null;

      return {
        source: 'ORIS' as ExternalSource,
        externalId,
        name,
        abbr,
        region: item.Region?.trim() || null,
        syncedAt: now,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  await prisma.$transaction([
    prisma.club.deleteMany({ where: { source: 'ORIS' } }),
    ...chunk(rows, CREATE_MANY_CHUNK_SIZE).map((batch) => prisma.club.createMany({ data: batch })),
  ]);

  return rows.length;
}

/**
 * Fetch the full registration list for a sport+year from ORIS and replace
 * the local cache. The club is resolved to our internal `Club.id` via ORIS's
 * `ClubID` (assumed synced separately — see {@link ensureClubsSynchronized}),
 * mirroring how `Competitor.organisationId` links to `Organisation`. A club
 * that isn't in the local cache yet simply leaves `clubId` null rather than
 * failing the whole sync.
 */
export async function syncRegistrationsFromOris(params: {
  sport: RegistrationSport;
  year: number;
}): Promise<number> {
  const { sport, year } = params;
  const payload = await fetchOrisJson<OrisRegistrationResponse>('getRegistration', {
    sport: String(ORIS_SPORT_CODES[sport]),
    year: String(year),
  });

  const clubs = await prisma.club.findMany({
    where: { source: 'ORIS' },
    select: { id: true, externalId: true },
  });
  const clubIdByExternalId = new Map(clubs.map((club) => [club.externalId, club.id]));

  const now = new Date();
  const rows = Object.values(payload.Data ?? {})
    .map((item) => {
      const registration = item.RegNo?.trim().toUpperCase();
      const externalId = item.UserID?.trim();
      const firstname = item.FirstName?.trim();
      const lastname = item.LastName?.trim();
      if (!registration || !externalId || !firstname || !lastname) return null;

      const clubExternalId = item.ClubID?.trim() || null;
      const card = item.SI ? Number.parseInt(item.SI, 10) : null;
      const orisGender = item.Gender?.trim().toUpperCase();
      const gender =
        orisGender === 'M' || orisGender === 'F'
          ? orisGender
          : parseSexFromRegistration(registration);
      const twoDigitBornYear = item.Born ? Number.parseInt(item.Born, 10) : null;
      const birthYear =
        twoDigitBornYear !== null && Number.isFinite(twoDigitBornYear)
          ? resolveTwoDigitYear(twoDigitBornYear, year)
          : parseBirthYearFromRegistration(registration, year);

      return {
        source: 'ORIS' as ExternalSource,
        externalId,
        registration,
        firstname,
        lastname,
        birthYear,
        license: item.Lic?.trim().slice(0, 1) || null,
        gender,
        clubId: clubExternalId ? (clubIdByExternalId.get(clubExternalId) ?? null) : null,
        card: card !== null && Number.isFinite(card) ? card : null,
        sport,
        year,
        syncedAt: now,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  await prisma.$transaction([
    prisma.registration.deleteMany({ where: { source: 'ORIS', sport, year } }),
    ...chunk(rows, CREATE_MANY_CHUNK_SIZE).map((batch) =>
      prisma.registration.createMany({ data: batch }),
    ),
  ]);

  return rows.length;
}

/**
 * Persist a registration sync attempt (success or failure). On failure,
 * `lastSuccessfulSyncAt`/`recordCount` are intentionally omitted from the
 * `update` clause so a prior success stays visible — same discipline as
 * `updateSyncState()` in `event.external-results-sync.service.ts`.
 */
async function upsertRegistrationSyncState(params: {
  sport: RegistrationSport;
  year: number;
  lastCheckedAt: Date;
  lastStatus: SyncStatus;
  lastError: string | null;
  lastSuccessfulSyncAt?: Date;
  recordCount?: number;
}): Promise<void> {
  const { sport, year, lastCheckedAt, lastStatus, lastError, lastSuccessfulSyncAt, recordCount } =
    params;
  const source: ExternalSource = 'ORIS';

  await prisma.registrationSyncState.upsert({
    where: { source_sport_year: { source, sport, year } },
    create: {
      source,
      sport,
      year,
      lastCheckedAt,
      lastStatus,
      lastError,
      lastSuccessfulSyncAt: lastSuccessfulSyncAt ?? null,
      recordCount: recordCount ?? null,
    },
    update: {
      lastCheckedAt,
      lastStatus,
      lastError,
      ...(lastSuccessfulSyncAt ? { lastSuccessfulSyncAt, recordCount } : {}),
    },
  });
}

/** Same upsert discipline as {@link upsertRegistrationSyncState}, for the (source-scoped, not sport/year-scoped) club directory. */
async function upsertClubSyncState(params: {
  lastCheckedAt: Date;
  lastStatus: SyncStatus;
  lastError: string | null;
  lastSuccessfulSyncAt?: Date;
  recordCount?: number;
}): Promise<void> {
  const { lastCheckedAt, lastStatus, lastError, lastSuccessfulSyncAt, recordCount } = params;
  const source: ExternalSource = 'ORIS';

  await prisma.clubSyncState.upsert({
    where: { source },
    create: {
      source,
      lastCheckedAt,
      lastStatus,
      lastError,
      lastSuccessfulSyncAt: lastSuccessfulSyncAt ?? null,
      recordCount: recordCount ?? null,
    },
    update: {
      lastCheckedAt,
      lastStatus,
      lastError,
      ...(lastSuccessfulSyncAt ? { lastSuccessfulSyncAt, recordCount } : {}),
    },
  });
}

/**
 * Run the registration sync and persist the outcome (success or failure) to
 * `RegistrationSyncState`, so an admin overview can show it. Used by both the
 * lazy `ensureRegistrationsSynchronized` path and the admin force-trigger —
 * neither duplicates this try/catch.
 */
export async function runRegistrationSync(params: {
  sport: RegistrationSport;
  year: number;
}): Promise<number> {
  const now = new Date();
  try {
    const count = await syncRegistrationsFromOris(params);
    await upsertRegistrationSyncState({
      ...params,
      lastCheckedAt: now,
      lastSuccessfulSyncAt: now,
      lastStatus: 'SUCCESS',
      lastError: null,
      recordCount: count,
    });
    return count;
  } catch (error) {
    await upsertRegistrationSyncState({
      ...params,
      lastCheckedAt: now,
      lastStatus: 'ERROR',
      lastError: getErrorMessage(error),
    });
    throw error;
  }
}

/** Same shape as {@link runRegistrationSync}, for the club directory. */
export async function runClubSync(): Promise<number> {
  const now = new Date();
  try {
    const count = await syncClubsFromOris();
    await upsertClubSyncState({
      lastCheckedAt: now,
      lastSuccessfulSyncAt: now,
      lastStatus: 'SUCCESS',
      lastError: null,
      recordCount: count,
    });
    return count;
  } catch (error) {
    await upsertClubSyncState({
      lastCheckedAt: now,
      lastStatus: 'ERROR',
      lastError: getErrorMessage(error),
    });
    throw error;
  }
}

/**
 * Lazily refresh the club directory: skip when a recent sync already exists,
 * respect a failure cooldown, and dedup concurrent callers onto one in-flight
 * fetch — same discipline as `ensureCzechRankingEventResultsSynchronized`.
 */
export async function ensureClubsSynchronized(
  options: {
    now?: Date;
    blocking?: boolean;
  } = {},
): Promise<boolean> {
  const now = options.now ?? new Date();
  const blocking = options.blocking ?? true;

  const latest = await prisma.club.findFirst({
    where: { source: 'ORIS' },
    orderBy: { syncedAt: 'desc' },
    select: { syncedAt: true },
  });

  if (latest && now.getTime() - new Date(latest.syncedAt).getTime() < CLUB_SYNC_TTL_MS) {
    return false;
  }

  const cooldownUntil = clubSyncCooldownUntil.get(CLUBS_SYNC_KEY);
  if (cooldownUntil && cooldownUntil > now.getTime()) {
    logger.warn('Club ORIS sync skipped because failure cooldown is active', {
      cooldownAppliedUntil: new Date(cooldownUntil).toISOString(),
    });
    return false;
  }

  const inFlight = clubSyncInFlight.get(CLUBS_SYNC_KEY);
  if (inFlight) {
    return blocking ? inFlight : false;
  }

  const syncPromise = runClubSync()
    .then(() => {
      clubSyncCooldownUntil.delete(CLUBS_SYNC_KEY);
      return true;
    })
    .catch((error) => {
      const cooldownAppliedUntil = Date.now() + SYNC_FAILURE_COOLDOWN_MS;
      clubSyncCooldownUntil.set(CLUBS_SYNC_KEY, cooldownAppliedUntil);
      logger.warn('Club ORIS sync failed and cooldown was applied', {
        failureReason: getErrorMessage(error),
        cooldownAppliedUntil: new Date(cooldownAppliedUntil).toISOString(),
      });
      throw error;
    })
    .finally(() => {
      clubSyncInFlight.delete(CLUBS_SYNC_KEY);
    });

  clubSyncInFlight.set(CLUBS_SYNC_KEY, syncPromise);

  if (!blocking) {
    syncPromise.catch((): void => undefined);
    return false;
  }

  return syncPromise;
}

/** Same lazy-refresh discipline as {@link ensureClubsSynchronized}, keyed by sport+year. */
export async function ensureRegistrationsSynchronized(options: {
  sport: RegistrationSport;
  year: number;
  now?: Date;
  blocking?: boolean;
}): Promise<boolean> {
  const { sport, year } = options;
  const now = options.now ?? new Date();
  const blocking = options.blocking ?? true;
  const key = registrationSyncKey(sport, year);

  const latest = await prisma.registration.findFirst({
    where: { source: 'ORIS', sport, year },
    orderBy: { syncedAt: 'desc' },
    select: { syncedAt: true },
  });

  if (latest && now.getTime() - new Date(latest.syncedAt).getTime() < REGISTRATION_SYNC_TTL_MS) {
    return false;
  }

  const cooldownUntil = registrationSyncCooldownUntil.get(key);
  if (cooldownUntil && cooldownUntil > now.getTime()) {
    logger.warn('Registration ORIS sync skipped because failure cooldown is active', {
      sport,
      year,
      cooldownAppliedUntil: new Date(cooldownUntil).toISOString(),
    });
    return false;
  }

  const inFlight = registrationSyncInFlight.get(key);
  if (inFlight) {
    return blocking ? inFlight : false;
  }

  const syncPromise = (async () => {
    await ensureClubsSynchronized({ now, blocking: true });
    return runRegistrationSync({ sport, year });
  })()
    .then(() => {
      registrationSyncCooldownUntil.delete(key);
      return true;
    })
    .catch((error) => {
      const cooldownAppliedUntil = Date.now() + SYNC_FAILURE_COOLDOWN_MS;
      registrationSyncCooldownUntil.set(key, cooldownAppliedUntil);
      logger.warn('Registration ORIS sync failed and cooldown was applied', {
        sport,
        year,
        failureReason: getErrorMessage(error),
        cooldownAppliedUntil: new Date(cooldownAppliedUntil).toISOString(),
      });
      throw error;
    })
    .finally(() => {
      registrationSyncInFlight.delete(key);
    });

  registrationSyncInFlight.set(key, syncPromise);

  if (!blocking) {
    syncPromise.catch((): void => undefined);
    return false;
  }

  return syncPromise;
}

type RegistrationWithClub = Registration & { club: Club | null };

function toLookupItem(row: RegistrationWithClub): RegistrationLookupItem {
  return {
    source: row.source,
    externalId: row.externalId,
    registration: row.registration,
    firstname: row.firstname,
    lastname: row.lastname,
    birthYear: row.birthYear,
    license: row.license,
    organisation: row.club?.name ?? null,
    gender: row.gender,
    card: row.card,
  };
}

function toClubItem(row: Club): ClubListItem {
  return {
    source: row.source,
    externalId: row.externalId,
    name: row.name,
    abbr: row.abbr,
    region: row.region,
  };
}

export async function lookupByRegistration(
  registration: string,
  scope: { source?: ExternalSource; sport: RegistrationSport; year: number },
): Promise<RegistrationLookupItem[]> {
  const source = scope.source ?? 'ORIS';
  const rows = await prisma.registration.findMany({
    where: { source, registration, sport: scope.sport, year: scope.year },
    include: { club: true },
  });
  return rows.map(toLookupItem);
}

export async function lookupByCard(
  card: number,
  scope: { source?: ExternalSource; sport: RegistrationSport; year: number },
): Promise<RegistrationLookupItem[]> {
  const source = scope.source ?? 'ORIS';
  const rows = await prisma.registration.findMany({
    where: { source, card, sport: scope.sport, year: scope.year },
    include: { club: true },
  });
  // The caller already knows the card number (they searched by it) — never
  // echo it back, unlike a registration-code lookup which does include it.
  return rows.map((row) => ({ ...toLookupItem(row), card: null }));
}

export async function searchClubs(q: string | undefined, limit: number): Promise<ClubListItem[]> {
  const trimmed = q?.trim();
  const rows = await prisma.club.findMany({
    where: trimmed
      ? { OR: [{ name: { contains: trimmed } }, { abbr: { contains: trimmed } }] }
      : undefined,
    orderBy: { name: 'asc' },
    take: limit,
  });
  return rows.map(toClubItem);
}

// ---------------------------------------------------------------------------
// Admin-facing reads: sync status/history and paginated lists. The admin
// list items intentionally include the SI card number (unlike the public
// `toLookupItem`/`toClubItem` mappers above) since the admin zone already
// exposes full PII for users/events.
// ---------------------------------------------------------------------------

export interface RegistrationSyncStateSummary {
  source: ExternalSource;
  sport: RegistrationSport;
  year: number;
  lastCheckedAt: Date | null;
  lastSuccessfulSyncAt: Date | null;
  lastStatus: SyncStatus;
  lastError: string | null;
  recordCount: number | null;
}

export interface ClubSyncStateSummary {
  source: ExternalSource;
  lastCheckedAt: Date | null;
  lastSuccessfulSyncAt: Date | null;
  lastStatus: SyncStatus;
  lastError: string | null;
  recordCount: number | null;
}

/** All registration sync-state rows (typically one per actively-synced sport+year), newest first. */
export async function getRegistrationSyncStates(): Promise<RegistrationSyncStateSummary[]> {
  const rows = await prisma.registrationSyncState.findMany({
    orderBy: { updatedAt: 'desc' },
  });
  return rows.map((row) => ({
    source: row.source,
    sport: row.sport,
    year: row.year,
    lastCheckedAt: row.lastCheckedAt,
    lastSuccessfulSyncAt: row.lastSuccessfulSyncAt,
    lastStatus: row.lastStatus,
    lastError: row.lastError,
    recordCount: row.recordCount,
  }));
}

/** The single club sync-state row for ORIS, or null if a sync has never been attempted. */
export async function getClubSyncState(): Promise<ClubSyncStateSummary | null> {
  const row = await prisma.clubSyncState.findUnique({ where: { source: 'ORIS' } });
  if (!row) return null;

  return {
    source: row.source,
    lastCheckedAt: row.lastCheckedAt,
    lastSuccessfulSyncAt: row.lastSuccessfulSyncAt,
    lastStatus: row.lastStatus,
    lastError: row.lastError,
    recordCount: row.recordCount,
  };
}

export interface AdminRegistrationListItem {
  id: number;
  source: ExternalSource;
  registration: string;
  firstname: string;
  lastname: string;
  birthYear: number | null;
  license: string | null;
  gender: string | null;
  organisation: string | null;
  card: number | null;
  sport: RegistrationSport;
  year: number;
  syncedAt: Date;
}

function toAdminRegistrationListItem(row: RegistrationWithClub): AdminRegistrationListItem {
  return {
    id: row.id,
    source: row.source,
    registration: row.registration,
    firstname: row.firstname,
    lastname: row.lastname,
    birthYear: row.birthYear,
    license: row.license,
    gender: row.gender,
    organisation: row.club?.name ?? null,
    card: row.card,
    sport: row.sport,
    year: row.year,
    syncedAt: row.syncedAt,
  };
}

/** Paginated, optionally free-text-filtered list of cached registrations, for the admin overview. */
export async function listRegistrationsPaged(params: {
  page: number;
  limit: number;
  q?: string;
}): Promise<{ total: number; items: AdminRegistrationListItem[] }> {
  const trimmed = params.q?.trim();
  const where = trimmed
    ? {
        OR: [
          { registration: { contains: trimmed.toUpperCase() } },
          { firstname: { contains: trimmed } },
          { lastname: { contains: trimmed } },
        ],
      }
    : undefined;

  const skip = (params.page - 1) * params.limit;
  const [total, rows] = await Promise.all([
    prisma.registration.count({ where }),
    prisma.registration.findMany({
      where,
      include: { club: true },
      orderBy: { syncedAt: 'desc' },
      skip,
      take: params.limit,
    }),
  ]);

  return { total, items: rows.map(toAdminRegistrationListItem) };
}

export interface AdminClubListItem {
  id: number;
  source: ExternalSource;
  externalId: string;
  name: string;
  abbr: string;
  region: string | null;
  syncedAt: Date;
}

/** Paginated, optionally free-text-filtered list of cached clubs, for the admin overview. */
export async function listClubsPaged(params: {
  page: number;
  limit: number;
  q?: string;
}): Promise<{ total: number; items: AdminClubListItem[] }> {
  const trimmed = params.q?.trim();
  const where = trimmed
    ? { OR: [{ name: { contains: trimmed } }, { abbr: { contains: trimmed } }] }
    : undefined;

  const skip = (params.page - 1) * params.limit;
  const [total, rows] = await Promise.all([
    prisma.club.count({ where }),
    prisma.club.findMany({
      where,
      orderBy: { name: 'asc' },
      skip,
      take: params.limit,
    }),
  ]);

  return {
    total,
    items: rows.map((row) => ({
      id: row.id,
      source: row.source,
      externalId: row.externalId,
      name: row.name,
      abbr: row.abbr,
      region: row.region,
      syncedAt: row.syncedAt,
    })),
  };
}
