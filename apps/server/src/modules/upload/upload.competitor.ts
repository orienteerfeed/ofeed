/**
 * Competitor write path for IOF imports — read-modify-write upserts including
 * change detection, batched protocol logging, and deferred organisation
 * resolution.
 *
 * Why a separate file: keeps `upload.handlers.ts` focused on HTTP / pipeline
 * orchestration and makes the per-row write logic independently testable.
 */

import { Prisma } from '../../generated/prisma/client.js';
import type { ProtocolType, ResultStatus } from '../../generated/prisma/enums.js';
import prisma from '../../utils/context.js';
import { createShortCompetitorHash } from '../../utils/hashUtils.js';
import { normalizeValue } from '../../utils/normalize.js';
import { organisationSelect, upsertOrganisation } from '../event/organisation.helpers.js';
import {
  SPLIT_WRITE_TRANSACTION_MAX_WAIT_MS,
  SPLIT_WRITE_TRANSACTION_TIMEOUT_MS,
} from './upload.constants.js';
import { getIofDateTime, toResultStatus } from './upload.iof.helpers.js';
import type { IofOrganisation, IofPerson, IofResult, IofStart } from './upload.iof.types.js';

export type CompetitorKeys = { registration: string; system: string };

/**
 * Single-pass extraction of both registration and system keys from person.Id.
 *
 * Why: previous implementation iterated person.Id up to six times across two
 * separate calls. For 10k-row startlists this is hot.
 *
 * - registration: prefers ATTR.type === "CZE", then first non-empty trimmed ID,
 *   otherwise fallbackToNameHash.
 * - system: prefers ATTR.type === "QuickEvent", then "ORIS", then the first ID
 *   value (even empty — preserves prior behaviour), otherwise fallbackToNameHash.
 */
export function getCompetitorKeys(classId: number, person: IofPerson): CompetitorKeys {
  const ids = person?.Id;
  if (!Array.isArray(ids) || ids.length === 0) {
    const fallback = fallbackToNameHash(classId, person);
    return { registration: fallback, system: fallback };
  }

  let cze: string | undefined;
  let quickEvent: string | undefined;
  let oris: string | undefined;
  let firstNonEmpty: string | undefined;
  let firstAny: string | undefined;

  for (const sourceId of ids) {
    const raw = sourceId?._;
    if (firstAny === undefined && raw !== undefined && raw !== null) {
      firstAny = raw;
    }
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    if (!trimmed) continue;
    if (firstNonEmpty === undefined) firstNonEmpty = trimmed;

    const type = sourceId?.ATTR?.type;
    if (type === 'CZE' && cze === undefined) cze = trimmed;
    else if (type === 'QuickEvent' && quickEvent === undefined) quickEvent = trimmed;
    else if (type === 'ORIS' && oris === undefined) oris = trimmed;
  }

  const registration = cze ?? firstNonEmpty ?? fallbackToNameHash(classId, person);
  const system = quickEvent ?? oris ?? firstAny ?? fallbackToNameHash(classId, person);

  return { registration, system };
}

export function fallbackToNameHash(classId: number, person: IofPerson): string {
  const familyName = person?.Name?.[0]?.Family?.[0] || '';
  const givenName = person?.Name?.[0]?.Given?.[0] || '';
  if (!familyName || !givenName) {
    console.warn('Missing family or given name for fallback hash generation:', person);
  }
  return createShortCompetitorHash(classId, familyName, givenName);
}

type CompetitorDiffField = {
  key: string;
  type: 'string' | 'number' | 'date';
  protocol: ProtocolType;
};

/**
 * Field comparison plan for change detection. Order is preserved in protocol
 * output. `key` references both the new snapshot and the DB row (or, for
 * organisation/shortName, the `previousFlat` mapping inside detectCompetitorChanges).
 */
const COMPETITOR_DIFF_FIELDS: readonly CompetitorDiffField[] = [
  { key: 'classId', type: 'number', protocol: 'class_change' },
  { key: 'firstname', type: 'string', protocol: 'firstname_change' },
  { key: 'lastname', type: 'string', protocol: 'lastname_change' },
  { key: 'nationality', type: 'string', protocol: 'nationality_change' },
  { key: 'registration', type: 'string', protocol: 'registration_change' },
  { key: 'organisation', type: 'string', protocol: 'organisation_change' },
  { key: 'shortName', type: 'string', protocol: 'short_name_change' },
  { key: 'bibNumber', type: 'number', protocol: 'bibNumber_change' },
  { key: 'startTime', type: 'date', protocol: 'start_time_change' },
  { key: 'finishTime', type: 'date', protocol: 'finish_time_change' },
  { key: 'time', type: 'number', protocol: 'time_change' },
  { key: 'card', type: 'number', protocol: 'si_card_change' },
  { key: 'status', type: 'string', protocol: 'status_change' },
  { key: 'teamId', type: 'number', protocol: 'team_change' },
  { key: 'leg', type: 'number', protocol: 'leg_change' },
];

export type CompetitorChange = {
  type: ProtocolType;
  previousValue: string | null;
  newValue: string | null;
};

/**
 * Pure diff between an incoming competitor snapshot and the DB row. Skips a
 * field when the incoming value is `undefined` (i.e. payload didn't carry it).
 *
 * Note: behaviour mirrors the previous inline logic exactly, including the
 * legacy quirk that `teamId` is read off the incoming snapshot — so callers
 * must place `teamId` on the snapshot if they want team_change protocols.
 */
export function detectCompetitorChanges(
  previous: Record<string, unknown>,
  incoming: Record<string, unknown>,
  previousOverrides: { organisation?: string | null; shortName?: string | null } = {},
): CompetitorChange[] {
  const out: CompetitorChange[] = [];
  for (const { key, type, protocol } of COMPETITOR_DIFF_FIELDS) {
    const incomingValue = incoming[key];
    if (incomingValue === undefined) continue;

    const previousFlat =
      key === 'organisation'
        ? (previousOverrides.organisation ?? null)
        : key === 'shortName'
          ? (previousOverrides.shortName ?? null)
          : previous[key];

    if (normalizeValue(type, incomingValue) === normalizeValue(type, previousFlat)) continue;

    out.push({
      type: protocol,
      previousValue: previousFlat?.toString() ?? null,
      newValue: incomingValue?.toString() ?? null,
    });
  }
  return out;
}

const COMPETITOR_DIFF_SELECT = {
  id: true,
  classId: true,
  firstname: true,
  lastname: true,
  nationality: true,
  registration: true,
  license: true,
  organisationId: true,
  organisation: { select: organisationSelect },
  card: true,
  bibNumber: true,
  startTime: true,
  finishTime: true,
  time: true,
  status: true,
  lateStart: true,
  leg: true,
  note: true,
  externalId: true,
} as const;

function buildOrganisationInput(organisation: IofOrganisation) {
  const externalId =
    organisation?.Id?.[0]?._ ??
    organisation?.ATTR?.id ??
    (typeof organisation?.Id?.[0] === 'string'
      ? (organisation?.Id?.[0] as unknown as string)
      : undefined) ??
    null;
  return {
    externalId,
    name: organisation?.Name?.[0] ?? null,
    shortName: organisation?.ShortName?.[0] ?? null,
    nationality: organisation?.Country?.[0]?.ATTR?.code ?? null,
  };
}

/**
 * Normalizes raw IOF XML organisation data to the values that will actually be
 * stored after the import runs. Mirrors `upsertOrganisation`'s contract:
 *
 *  1. Trim whitespace and convert empty strings to null.
 *  2. `effectiveName = name` — a shortName alone (with no name and no externalId)
 *     is not enough to create an org row, so it must not influence change detection.
 *  3. `effectiveShortName` is set only when `name` provides the primary label.
 *     When name is absent, both fields are null (no org will be stored).
 *
 * These are the values `detectCompetitorChanges` compares against the DB state.
 * Using the raw XML values instead would cause false-positive protocol entries
 * whenever an XML field is empty but the DB holds null (or vice-versa).
 *
 * The raw `orgInput` is forwarded unchanged to `upsertOrganisation`, which
 * owns normalization and the externalId-priority lookup.
 */
export function normalizeOrganisationInput(orgInput: {
  name: string | null | undefined;
  shortName: string | null | undefined;
}): { effectiveName: string | null; effectiveShortName: string | null } {
  const name = typeof orgInput.name === 'string' ? orgInput.name.trim() || null : null;
  const shortName =
    typeof orgInput.shortName === 'string' ? orgInput.shortName.trim() || null : null;
  return {
    effectiveName: name,
    effectiveShortName: name ? shortName : null,
  };
}

/**
 * Cleans up an organisation row that no longer has any competitors or teams
 * pointing at it. Idempotent — safe to call after commit.
 */
async function deleteOrganisationIfUnused(organisationId: number | null | undefined) {
  if (!organisationId) return;

  await prisma.organisation.deleteMany({
    where: {
      id: organisationId,
      competitors: { none: {} },
      teams: { none: {} },
    },
  });
}

type DbCompetitor = Prisma.CompetitorGetPayload<{ select: typeof COMPETITOR_DIFF_SELECT }>;

/**
 * Per-class cache of existing competitors keyed by externalId.
 * Pre-loaded once before processing a class's competitors to avoid N+1
 * findUnique queries. Workers sharing the same class reuse this cache;
 * P2002 unique constraint remains the safety net for concurrent inserts.
 */
export type CompetitorCache = Map<string, DbCompetitor>;

/**
 * Loads all competitors for a class that have a non-null externalId into a
 * Map keyed by externalId. Call this once per class before the concurrent
 * competitor-write loop, then pass the cache to each upsertCompetitor call.
 */
export async function loadCompetitorCache(classId: number): Promise<CompetitorCache> {
  const rows = await prisma.competitor.findMany({
    where: { classId, externalId: { not: null } },
    select: COMPETITOR_DIFF_SELECT,
  });
  return new Map(rows.map((c) => [c.externalId!, c]));
}

async function findCompetitorForImport(
  eventId: string,
  classId: number,
  externalId: string,
  cache?: CompetitorCache,
): Promise<DbCompetitor | null> {
  const cached = cache?.get(externalId);
  if (cached) return cached;

  const sameClass = await prisma.competitor.findUnique({
    where: { classId_externalId: { classId, externalId } },
    select: COMPETITOR_DIFF_SELECT,
  });
  if (sameClass) return sameClass;

  return prisma.competitor.findFirst({
    where: { class: { eventId }, externalId },
    select: COMPETITOR_DIFF_SELECT,
  });
}

type CompetitorSnapshot = {
  competitorData: Record<string, unknown>;
  competitorWriteBase: Record<string, unknown>;
  orgInput: ReturnType<typeof buildOrganisationInput>;
  firstname: string;
  lastname: string;
  previousOrganisationName: string | null;
  previousOrganisationShortName: string | null;
};

type SnapshotInputs = {
  classId: number;
  person: IofPerson;
  organisation: IofOrganisation;
  start: IofStart | null;
  result: IofResult | null;
  eventTimeZone: string;
  teamId: number | null;
  leg: string | number | null;
  registration: string;
  externalId: string;
  dbCompetitor: DbCompetitor | null;
};

/**
 * Builds the in-memory snapshot used for both create and update branches.
 * Re-callable: on retry after a P2002 race, the snapshot must be rebuilt
 * against the racer's row so that preserved-from-DB fields (license, note,
 * lateStart, status fallback, name fallbacks) match the row we'll actually
 * touch.
 */
function buildCompetitorSnapshot(input: SnapshotInputs): CompetitorSnapshot {
  const {
    classId,
    person,
    organisation,
    start,
    result,
    eventTimeZone,
    teamId,
    leg,
    registration,
    externalId,
    dbCompetitor,
  } = input;

  const previousOrganisationName = dbCompetitor?.organisation?.name ?? null;
  const previousOrganisationShortName = dbCompetitor?.organisation?.shortName ?? null;

  const firstname = person.Name?.[0]?.Given?.[0] ?? dbCompetitor?.firstname ?? '';
  const lastname = person.Name?.[0]?.Family?.[0] ?? dbCompetitor?.lastname ?? '';
  const hasFinishTime = Boolean(result?.FinishTime?.[0]);
  const fallbackStatus: ResultStatus = hasFinishTime ? 'OK' : (dbCompetitor?.status ?? 'Inactive');
  const normalizedStatus = toResultStatus(result?.Status, fallbackStatus);

  const orgInput = buildOrganisationInput(organisation);
  const { effectiveName, effectiveShortName } = normalizeOrganisationInput(orgInput);

  // When Organisation.Id (externalId) in the XML matches the externalId already
  // stored on the competitor's organisation row, the org identity is stable —
  // the same club regardless of how its display name appears in different XML
  // files (e.g. "2105BF" vs "Bourgogne-Franche-Comté"). Using the DB org values
  // for comparison prevents false-positive organisation_change entries on re-import.
  const incomingExternalId = orgInput.externalId?.trim() || null;
  const sameOrgByExternalId =
    incomingExternalId !== null && dbCompetitor?.organisation?.externalId === incomingExternalId;

  const competitorData = {
    classId,
    class: { connect: { id: classId } },
    firstname,
    lastname,
    nationality: person.Nationality?.[0].ATTR.code,
    registration,
    license: dbCompetitor?.license || null,
    organisation: sameOrgByExternalId ? (dbCompetitor?.organisation?.name ?? null) : effectiveName,
    shortName: sameOrgByExternalId
      ? (dbCompetitor?.organisation?.shortName ?? null)
      : effectiveShortName,
    bibNumber: result?.BibNumber
      ? parseInt(result.BibNumber.shift())
      : start?.BibNumber
        ? (parseInt(start.BibNumber.shift()) ?? dbCompetitor?.bibNumber)
        : null,
    startTime:
      getIofDateTime(result?.StartTime, eventTimeZone) ??
      getIofDateTime(start?.StartTime, eventTimeZone) ??
      (dbCompetitor?.startTime || null),
    finishTime:
      getIofDateTime(result?.FinishTime, eventTimeZone) ?? (dbCompetitor?.finishTime || null),
    time: result?.Time ? parseInt(result.Time[0]) : (dbCompetitor?.time ?? null),
    card: result?.ControlCard
      ? parseInt(result.ControlCard.shift())
      : start?.ControlCard
        ? parseInt(start.ControlCard.shift())
        : (dbCompetitor?.card ?? null),
    status: normalizedStatus,
    lateStart: dbCompetitor?.lateStart || false,
    team: teamId ? { connect: { id: teamId } } : undefined,
    leg: leg ? Number.parseInt(String(leg), 10) : undefined,
    externalId,
    note: dbCompetitor?.note || null,
  };

  const {
    classId: _flatClassId,
    organisation: _flatName,
    shortName: _flatShort,
    ...competitorWriteBase
  } = competitorData as Record<string, unknown>;

  return {
    competitorData,
    competitorWriteBase,
    orgInput,
    firstname,
    lastname,
    previousOrganisationName,
    previousOrganisationShortName,
  };
}

async function insertNewCompetitor(
  eventId: string,
  snapshot: CompetitorSnapshot,
  authorId: number,
): Promise<{ id: number; updated: boolean }> {
  const resolvedOrganisationId = await upsertOrganisation({ eventId, ...snapshot.orgInput });
  const created = await prisma.$transaction(
    async (tx) => {
      const c = await tx.competitor.create({
        data: {
          ...snapshot.competitorWriteBase,
          ...(resolvedOrganisationId
            ? { organisation: { connect: { id: resolvedOrganisationId } } }
            : {}),
        } as Prisma.CompetitorCreateInput,
        select: { id: true },
      });
      await tx.protocol.createMany({
        data: [
          {
            eventId,
            competitorId: c.id,
            origin: 'IT',
            type: 'competitor_create',
            previousValue: null,
            newValue: `${snapshot.lastname} ${snapshot.firstname}`,
            authorId,
          },
        ],
      });
      return c;
    },
    {
      maxWait: SPLIT_WRITE_TRANSACTION_MAX_WAIT_MS,
      timeout: SPLIT_WRITE_TRANSACTION_TIMEOUT_MS,
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    },
  );
  return { id: created.id, updated: true };
}

async function updateExistingCompetitor(
  eventId: string,
  dbCompetitor: DbCompetitor,
  snapshot: CompetitorSnapshot,
  authorId: number,
): Promise<{ id: number; updated: boolean }> {
  const fieldChanges = detectCompetitorChanges(
    dbCompetitor as unknown as Record<string, unknown>,
    snapshot.competitorData,
    {
      organisation: snapshot.previousOrganisationName,
      shortName: snapshot.previousOrganisationShortName,
    },
  );

  if (fieldChanges.length === 0) {
    // Fast path: no DB write, no organisation upsert, no protocol, no publish.
    return { id: dbCompetitor.id, updated: false };
  }

  // Only resolve (and potentially create/update) the organisation when the
  // org-related fields actually changed. Saves 1–3 DB queries per competitor
  // update when the competitor's club is stable across uploads.
  const orgChanged = fieldChanges.some(
    (c) => c.type === 'organisation_change' || c.type === 'short_name_change',
  );
  const resolvedOrganisationId = orgChanged
    ? await upsertOrganisation({ eventId, ...snapshot.orgInput })
    : (dbCompetitor.organisationId ?? null);

  await prisma.$transaction(
    async (tx) => {
      await tx.competitor.update({
        where: { id: dbCompetitor.id },
        data: {
          ...snapshot.competitorWriteBase,
          ...(orgChanged
            ? {
                organisation: resolvedOrganisationId
                  ? { connect: { id: resolvedOrganisationId } }
                  : { disconnect: true },
              }
            : {}),
          updatedAt: new Date(),
        } as Prisma.CompetitorUpdateInput,
      });
      await tx.protocol.createMany({
        data: fieldChanges.map((change) => ({
          eventId,
          competitorId: dbCompetitor.id,
          origin: 'IT',
          type: change.type,
          previousValue: change.previousValue,
          newValue: change.newValue ?? '',
          authorId,
        })),
      });
    },
    {
      maxWait: SPLIT_WRITE_TRANSACTION_MAX_WAIT_MS,
      timeout: SPLIT_WRITE_TRANSACTION_TIMEOUT_MS,
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    },
  );

  if (orgChanged && dbCompetitor.organisationId !== resolvedOrganisationId) {
    await deleteOrganisationIfUnused(dbCompetitor.organisationId);
  }

  return { id: dbCompetitor.id, updated: true };
}

const MAX_UPSERT_ATTEMPTS = 3;

/**
 * P2002 (unique violation on classId+externalId) is treated as a benign race —
 * another concurrent worker created the row first. We retry: re-read the
 * racer's row and fall through to the update branch with their data as the
 * preserved-fields baseline.
 */
function isCompetitorUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  if ((error as { code: unknown }).code !== 'P2002') return false;

  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  // Competitor has only one unique constraint (classId + externalId), so any
  // P2002 from competitor.create must be a classId+externalId race. Treat a
  // missing target (MariaDB adapter sometimes omits it) as matching.
  if (target === undefined || target === null) return true;
  if (Array.isArray(target)) {
    return target.includes('classId') && target.includes('externalId');
  }
  return target.toString().includes('Competitor_class_external_uq');
}

export async function upsertCompetitor(
  eventId: string,
  classId: number,
  person: IofPerson,
  organisation: IofOrganisation,
  start: IofStart | null = null,
  result: IofResult | null = null,
  eventTimeZone = 'UTC',
  teamId: number | null = null,
  leg: string | number | null = null,
  authorId: number,
  cache?: CompetitorCache,
): Promise<{ id: number; updated: boolean }> {
  const { registration, system: externalId } = getCompetitorKeys(classId, person);

  for (let attempt = 1; attempt <= MAX_UPSERT_ATTEMPTS; attempt++) {
    // First attempt: prefer cache to skip one DB round-trip per competitor.
    // On cache miss, fall back to event-scoped lookup so category changes are
    // represented as class_change updates instead of duplicate competitors.
    // Retry attempts always query the DB to pick up the racer's row.
    const dbCompetitor: DbCompetitor | null =
      attempt === 1
        ? await findCompetitorForImport(eventId, classId, externalId, cache)
        : await prisma.competitor.findUnique({
            where: { classId_externalId: { classId, externalId } },
            select: COMPETITOR_DIFF_SELECT,
          });

    const snapshot = buildCompetitorSnapshot({
      classId,
      person,
      organisation,
      start,
      result,
      eventTimeZone,
      teamId,
      leg,
      registration,
      externalId,
      dbCompetitor,
    });

    if (!dbCompetitor) {
      try {
        return await insertNewCompetitor(eventId, snapshot, authorId);
      } catch (err) {
        if (isCompetitorUniqueViolation(err) && attempt < MAX_UPSERT_ATTEMPTS) {
          // Race lost — another worker inserted between our findUnique and create.
          // Loop back, this time findUnique will return the racer's row and we'll
          // go down the update branch.
          continue;
        }
        throw err;
      }
    }

    return await updateExistingCompetitor(eventId, dbCompetitor, snapshot, authorId);
  }

  throw new Error(
    `upsertCompetitor exhausted ${MAX_UPSERT_ATTEMPTS} attempts for classId=${classId} externalId=${externalId}`,
  );
}
