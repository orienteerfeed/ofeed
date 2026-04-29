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
 * Find or create an Organisation for the given event. The canonical identity is
 * `(eventId, name)`; shortName and externalId are descriptive attributes.
 * Empty strings are normalised to `null`. Returns the organisation id, or
 * `null` if there is nothing to link.
 *
 * If a row exists, missing fields (externalId, nationality, shortName) are
 * filled in non-destructively – existing non-null values are not overwritten.
 */
export const upsertOrganisation = async (
  input: OrganisationUpsertInput,
): Promise<number | null> => {
  const eventId = input.eventId;
  const name = normaliseString(input.name);
  const shortName = normaliseString(input.shortName);
  const externalId = normaliseString(input.externalId);
  const nationality = normaliseString(input.nationality);

  if (!name && !externalId) {
    return null;
  }

  if (!name && externalId) {
    const existing = await prisma.organisation.findFirst({
      where: { eventId, externalId },
      select: { id: true },
    });
    return existing?.id ?? null;
  }

  if (!name) return null;

  const externalIdOwner = externalId
    ? await prisma.organisation.findFirst({
        where: { eventId, externalId },
        select: { id: true, name: true },
      })
    : null;
  const externalIdForCreate = externalIdOwner && externalIdOwner.name !== name ? null : externalId;

  const existing = await findOrCreateOrganisation({
    eventId,
    externalId: externalIdForCreate,
    name,
    nationality,
    shortName,
  });

  const data: Record<string, string | null> = {};
  if (externalId && !existing.externalId) {
    if (!externalIdOwner) data.externalId = externalId;
  }
  if (nationality && !existing.nationality) data.nationality = nationality;
  if (shortName && !existing.shortName) data.shortName = shortName;
  if (Object.keys(data).length > 0) {
    await prisma.organisation.update({ where: { id: existing.id }, data });
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
