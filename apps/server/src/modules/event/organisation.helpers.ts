import prisma from '../../utils/context.js';

/**
 * Prisma `select` fragment that pulls everything needed to reconstruct the
 * legacy flat `{ organisation, shortName }` shape on REST/GraphQL responses
 * while keeping the new relational data accessible for callers that need it.
 */
export const organisationSelect = {
  id: true,
  externalId: true,
  name: true,
  nationality: true,
  shortName: true,
} as const;

type OrganisationRecord = {
  id: number;
  externalId: string | null;
  name: string;
  nationality: string | null;
  shortName: string | null;
};

type WithOrganisationRelation<T> = T & {
  organisationId?: number | null;
  organisation?: OrganisationRecord | null;
};

/**
 * Replace the nested `organisation` relation on a record with the legacy flat
 * fields (`organisation`, `shortName`) so existing REST/GraphQL contracts keep
 * working. Returns a shallow copy.
 */
export const flattenOrganisation = <T extends object>(
  record: WithOrganisationRelation<T> | null | undefined,
):
  | (Omit<WithOrganisationRelation<T>, 'organisation'> & {
      organisation: string | null;
      shortName: string | null;
    })
  | null => {
  if (!record) return null;
  const { organisation, ...rest } = record as WithOrganisationRelation<T>;
  return {
    ...(rest as Omit<WithOrganisationRelation<T>, 'organisation'>),
    organisation: organisation?.name ?? null,
    shortName: organisation?.shortName ?? null,
  };
};

export type OrganisationUpsertInput = {
  eventId: string;
  name?: string | null;
  shortName?: string | null;
  externalId?: string | null;
  nationality?: string | null;
};

/**
 * Find or create an Organisation for the given event. Lookup priority:
 *
 *  1. **Organisation.Id / externalId** — if the IOF XML carries an `<Id>`,
 *     that is the canonical identity. If a row with that externalId already
 *     exists for the event, it is returned immediately (descriptive fields are
 *     filled in non-destructively). This prevents duplicate org rows when the
 *     same club appears with slightly different display names across uploads.
 *
 *  2. **Name** — when no externalId is present (or no row matches it),
 *     we find-or-create by name. If name is absent or empty, `null` is
 *     returned — a shortName alone is not enough to create an org record.
 *     Callers that want shortName-only orgs must supply an externalId.
 *
 * Empty strings are normalised to `null`. Returns the organisation id, or
 * `null` when there is nothing to link.
 */
export const upsertOrganisation = async (
  input: OrganisationUpsertInput,
): Promise<number | null> => {
  const eventId = input.eventId;
  const name = normaliseString(input.name);
  const shortName = normaliseString(input.shortName)?.slice(0, 20) ?? null;
  const externalId = normaliseString(input.externalId);
  const nationality = normaliseString(input.nationality);

  if (!name && !externalId) return null;

  // Priority 1 — externalId match (Organisation.Id in IOF XML).
  if (externalId) {
    const byExternalId = await prisma.organisation.findFirst({
      where: { eventId, externalId },
      select: organisationSelect,
    });
    if (byExternalId) {
      const patch: Record<string, string | null> = {};
      if (name && !byExternalId.name) patch.name = name;
      if (name && shortName && !byExternalId.shortName) patch.shortName = shortName;
      if (nationality && !byExternalId.nationality) patch.nationality = nationality;
      if (Object.keys(patch).length > 0) {
        await prisma.organisation.update({ where: { id: byExternalId.id }, data: patch });
      }
      return byExternalId.id;
    }
  }

  // Priority 2 — name-based find-or-create.
  if (!name) return null;

  const existing = await findOrCreateOrganisation({
    eventId,
    externalId,
    name,
    nationality,
    shortName,
  });

  const patch: Record<string, string | null> = {};
  if (externalId && !existing.externalId) patch.externalId = externalId;
  if (nationality && !existing.nationality) patch.nationality = nationality;
  // Guard: only fill shortName when there is a distinct full name providing
  // the primary label. Without this guard, the patch would redundantly copy
  // shortName into the shortName column of an org whose name IS the shortName,
  // causing a permanent false-positive short_name_change on every re-import.
  if (name && shortName && !existing.shortName) patch.shortName = shortName;
  if (Object.keys(patch).length > 0) {
    await prisma.organisation.update({ where: { id: existing.id }, data: patch });
  }
  return existing.id;
};

const normaliseString = (value: string | null | undefined): string | null => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
};

const findOrCreateOrganisation = async (data: {
  eventId: string;
  externalId: string | null;
  name: string;
  nationality: string | null;
  shortName: string | null;
}): Promise<OrganisationRecord> => {
  try {
    return await prisma.organisation.upsert({
      where: { eventId_name: { eventId: data.eventId, name: data.name } },
      create: data,
      update: {},
      select: organisationSelect,
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;

    const existing = await prisma.organisation.findUnique({
      where: { eventId_name: { eventId: data.eventId, name: data.name } },
      select: organisationSelect,
    });
    if (!existing) throw error;

    return existing;
  }
};

const isUniqueConstraintError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
