/**
 * Competitor write path for IOF imports — read-modify-write upserts including
 * change detection, batched protocol logging, and deferred organisation
 * resolution.
 *
 * Why a separate file: keeps `upload.handlers.ts` focused on HTTP / pipeline
 * orchestration and makes the per-row write logic independently testable.
 */

import {
  eventPunchTransaction,
  publishPunchChanges,
  supersedeCompetitorPunches,
  type PunchTx,
} from '../punch/punch-write.js';
import { reconcileEventPunches } from '../punch/punch.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { ResultStatus } from '../../generated/prisma/enums.js';
import prisma from '../../utils/context.js';
import { normalizeCountryAlpha3 } from '../../utils/country-code.js';
import { createShortCompetitorHash } from '../../utils/hashUtils.js';
import { upsertOrganisation } from '../event/organisation.helpers.js';
import {
  COMPETITOR_DIFF_SELECT,
  detectCompetitorChanges,
} from '../competitor/competitor-change.helpers.js';
import { createCompetitorProtocolEntries } from '../competitor/competitor-change.service.js';
import { getIofDateTime, toResultStatus } from './upload.iof.helpers.js';
import type { IofOrganisation, IofPerson, IofResult, IofStart } from './upload.iof.types.js';

export { detectCompetitorChanges } from '../competitor/competitor-change.helpers.js';

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
    nationality: normalizeCountryAlpha3(organisation?.Country?.[0]?.ATTR?.code),
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
async function deleteOrganisationIfUnused(
  organisationId: number | null | undefined,
  prisma: PunchTx,
) {
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
  cache: CompetitorCache | undefined,
  prisma: PunchTx,
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

  const xmlStartTime =
    getIofDateTime(result?.StartTime, eventTimeZone) ??
    getIofDateTime(start?.StartTime, eventTimeZone);

  const isInactive = (dbCompetitor?.status ?? 'Inactive') === 'Inactive';
  const dbStartTime = dbCompetitor?.startTime ?? null;

  // StartTime resolution rules (in priority order):
  //
  // 1. StartList re-import guard: if the competitor has already run
  //    (non-Inactive) and has a recorded startTime, preserve it regardless of
  //    what the StartList XML says. Some exporters write the event zero-time as
  //    <StartTime> for free-start competitors; the real chip time arrives only
  //    via ResultList and must not be overwritten on the next StartList cycle.
  //    This guard is intentionally skipped for ResultList imports (result !== null)
  //    so that result re-imports can always correct the startTime.
  //
  // 2. XML value present → use it (ResultList always lands here; StartList lands
  //    here only when guard above did not apply).
  //
  // 3. No XML value, Inactive → null (competitor not yet assigned a start time).
  //
  // 4. No XML value, non-Inactive, no DB value → null.
  const resolvedStartTime =
    !isInactive && result === null && dbStartTime !== null
      ? dbStartTime
      : xmlStartTime !== undefined
        ? xmlStartTime
        : isInactive
          ? null
          : dbStartTime;

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
      ? parseInt(result.BibNumber[0])
      : start?.BibNumber
        ? (parseInt(start.BibNumber[0]) ?? dbCompetitor?.bibNumber)
        : null,
    startTime: resolvedStartTime,
    finishTime:
      getIofDateTime(result?.FinishTime, eventTimeZone) ?? (dbCompetitor?.finishTime || null),
    time: result?.Time ? parseInt(result.Time[0]) : (dbCompetitor?.time ?? null),
    card: result?.ControlCard
      ? parseInt(result.ControlCard[0])
      : start?.ControlCard
        ? parseInt(start.ControlCard[0])
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
  prisma: PunchTx,
): Promise<{ id: number; updated: boolean }> {
  const resolvedOrganisationId = await upsertOrganisation(
    { eventId, ...snapshot.orgInput },
    prisma,
  );
  const c = await prisma.competitor.create({
    data: {
      ...snapshot.competitorWriteBase,
      ...(resolvedOrganisationId
        ? { organisation: { connect: { id: resolvedOrganisationId } } }
        : {}),
    } as Prisma.CompetitorCreateInput,
    select: { id: true },
  });
  await createCompetitorProtocolEntries(prisma, {
    eventId,
    competitorId: c.id,
    origin: 'IT',
    authorId,
    changes: [
      {
        type: 'competitor_create',
        previousValue: null,
        newValue: `${snapshot.lastname} ${snapshot.firstname}`,
      },
    ],
  });
  return { id: c.id, updated: true };
}

async function updateExistingCompetitor(
  eventId: string,
  dbCompetitor: DbCompetitor,
  snapshot: CompetitorSnapshot,
  authorId: number,
  prisma: PunchTx,
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
    ? await upsertOrganisation({ eventId, ...snapshot.orgInput }, prisma)
    : (dbCompetitor.organisationId ?? null);

  await prisma.competitor.update({
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
  await createCompetitorProtocolEntries(prisma, {
    eventId,
    competitorId: dbCompetitor.id,
    origin: 'IT',
    authorId,
    changes: fieldChanges,
  });

  if (orgChanged && dbCompetitor.organisationId !== resolvedOrganisationId) {
    await deleteOrganisationIfUnused(dbCompetitor.organisationId, prisma);
  }

  return { id: dbCompetitor.id, updated: true };
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
  // The preload cache may be stale after another dongle or assignment write.
  void cache;
  const written = await eventPunchTransaction(prisma, eventId, async (tx) => {
    const dbCompetitor = await findCompetitorForImport(eventId, classId, externalId, undefined, tx);
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
    const value = dbCompetitor
      ? await updateExistingCompetitor(eventId, dbCompetitor, snapshot, authorId, tx)
      : await insertNewCompetitor(eventId, snapshot, authorId, tx);
    await supersedeCompetitorPunches(tx, [value.id], {
      eventId,
      cards: [dbCompetitor?.card, snapshot.competitorData.card as number | null],
    });
    const changes = await reconcileEventPunches(tx, eventId, new Map(), {
      cards: [dbCompetitor?.card, snapshot.competitorData.card as number | null],
      competitorIds: [value.id],
    });
    return { value, changes };
  });
  await publishPunchChanges(eventId, written.changes);
  return written.value;
}
