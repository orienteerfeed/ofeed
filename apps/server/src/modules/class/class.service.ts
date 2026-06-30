import { classUpdateInputSchema } from '@repo/shared';

import type { AppPrismaClient } from '../../db/prisma-client.js';
import { ValidationError } from '../../exceptions/index.js';
import type { GraphQLAuthContext } from '../../graphql/context.types.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Sex } from '../../generated/prisma/enums.js';
import { requireEventOwnerOrAdmin } from '../../utils/authz.js';
import {
  ExternalImportError,
  buildEventorUrl,
  buildOrisUrl,
  fetchExternalPayload,
  getEventorApiKey,
} from '../event/event.import.service.js';

export type ClassFindUniqueSelection = Omit<Prisma.ClassFindUniqueArgs, 'where'>;
export type ClassFindManySelection = Omit<Prisma.ClassFindManyArgs, 'where'>;

export function findClassById(
  prisma: AppPrismaClient,
  id: number,
  query: ClassFindUniqueSelection = {},
) {
  return prisma.class.findUnique({
    ...query,
    where: { id },
  });
}

export function findEventClasses(
  prisma: AppPrismaClient,
  eventId: string,
  query: ClassFindManySelection = {},
) {
  return prisma.class.findMany({
    ...query,
    where: { eventId },
  });
}

export function findEventClassesByIds(
  prisma: AppPrismaClient,
  eventId: string,
  ids: number[] | null | undefined,
  query: ClassFindManySelection = {},
) {
  return prisma.class.findMany({
    ...query,
    where: { eventId, id: { in: ids ?? undefined } },
  });
}

export function findClassCompetitors(prisma: AppPrismaClient, classId: number) {
  return prisma.competitor.findMany({
    where: { classId },
  });
}

export function findClassTeams(prisma: AppPrismaClient, classId: number) {
  return prisma.team.findMany({
    where: { classId },
  });
}

export interface UpdateClassFeeInput {
  classId: number;
  /** Gross entry fee (incl. VAT), or null to clear the fee. */
  fee: number | null;
}

type GenericRecord = Record<string, unknown>;

type ExternalClassDefinition = {
  externalId: string | null;
  name: string | null;
  fee: number | null;
  minAge: number | null;
  maxAge: number | null;
  sex: Sex;
  lateEntryFeeDisabled: boolean;
};

type LoadExternalClassDefinitionsResult = {
  updatedCount: number;
};

const CLASS_ID_KEYS = [
  'ID',
  'Id',
  'id',
  'ClassID',
  'ClassId',
  'classId',
  'EventClassID',
  'EventClassId',
  'eventClassId',
] as const;
const CLASS_NAME_KEYS = [
  'Name',
  'name',
  'ClassName',
  'className',
  'ShortName',
  'shortName',
] as const;
const FEE_KEYS = ['Fee', 'fee', 'BaseFee', 'baseFee', 'EntryFee', 'entryFee'] as const;
const AGE_FROM_KEYS = ['AgeFrom', 'ageFrom', 'MinAge', 'minAge', 'MinimumAge'] as const;
const AGE_TO_KEYS = ['AgeTo', 'ageTo', 'MaxAge', 'maxAge', 'MaximumAge'] as const;
const GENDER_KEYS = ['Gender', 'gender', 'Sex', 'sex', 'ClassType', 'classType'] as const;
const NO_EXTRA_FEE_KEYS = [
  'NoExtraFee',
  'noExtraFee',
  'LateEntryFeeDisabled',
  'lateEntryFeeDisabled',
  'NoLateEntryFee',
  'noLateEntryFee',
] as const;

function validateClassFee(fee: number | null): void {
  if (fee === null) return;

  if (!Number.isFinite(fee)) {
    throw new ValidationError('Class fee must be a finite number.');
  }

  if (fee < 0) {
    throw new ValidationError('Class fee must be greater than or equal to 0.');
  }

  if (!Number.isInteger(fee * 100)) {
    throw new ValidationError('Class fee can have at most 2 decimal places.');
  }
}

function isRecord(value: unknown): value is GenericRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toStringValue(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = toStringValue(item);
      if (parsed) {
        return parsed;
      }
    }
    return undefined;
  }

  if (isRecord(value)) {
    const preferred = [
      value._,
      value['#text'],
      value.value,
      value.text,
      value.Amount,
      value.amount,
      value.Name,
      value.name,
      value.ShortName,
      value.shortName,
      value.ID,
      value.Id,
      value.id,
    ];

    for (const item of preferred) {
      const parsed = toStringValue(item);
      if (parsed) {
        return parsed;
      }
    }
  }

  return undefined;
}

function toNumberValue(value: unknown): number | undefined {
  const parsedValue = toStringValue(value);
  if (!parsedValue) {
    return undefined;
  }

  const parsed = Number.parseFloat(parsedValue.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toIntValue(value: unknown): number | undefined {
  const parsed = toNumberValue(value);
  return parsed !== undefined && Number.isInteger(parsed) ? parsed : undefined;
}

function toBooleanValue(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }

  const parsedValue = toStringValue(value);
  if (!parsedValue) {
    return undefined;
  }

  const normalized = parsedValue.toLowerCase();
  if (['1', 'true', 'yes', 'y', 'ano'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'n', 'ne'].includes(normalized)) {
    return false;
  }

  return undefined;
}

function getCaseInsensitiveValue(record: GenericRecord, key: string): unknown {
  const match = Object.entries(record).find(
    ([candidate]) => candidate.toLowerCase() === key.toLowerCase(),
  );
  return match?.[1];
}

function readString(record: GenericRecord, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const parsed = toStringValue(getCaseInsensitiveValue(record, key));
    if (parsed) {
      return parsed;
    }
  }

  return undefined;
}

function readNumber(record: GenericRecord, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const parsed = toNumberValue(getCaseInsensitiveValue(record, key));
    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

function readInt(record: GenericRecord, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const parsed = toIntValue(getCaseInsensitiveValue(record, key));
    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

function readBoolean(record: GenericRecord, keys: readonly string[]): boolean | undefined {
  for (const key of keys) {
    const parsed = toBooleanValue(getCaseInsensitiveValue(record, key));
    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

function readClassDefinitionRecord(record: GenericRecord): GenericRecord | null {
  const classDefinition = getCaseInsensitiveValue(record, 'ClassDefinition');
  return isRecord(classDefinition) ? classDefinition : null;
}

function collectRecords(input: unknown, maxDepth = 10): GenericRecord[] {
  const result: GenericRecord[] = [];

  const visit = (value: unknown, depth: number) => {
    if (value === null || value === undefined || depth > maxDepth) {
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item, depth + 1);
      }
      return;
    }

    if (!isRecord(value)) {
      return;
    }

    result.push(value);

    for (const nested of Object.values(value)) {
      visit(nested, depth + 1);
    }
  };

  visit(input, 0);
  return result;
}

function normalizeClassName(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

function normalizeSex(value: string | undefined): Sex {
  if (!value) {
    return 'B';
  }

  const normalized = value.trim().toLowerCase();
  if (['m', 'male', 'men', 'man', 'h', 'boys'].includes(normalized)) {
    return 'M';
  }
  if (['f', 'female', 'women', 'woman', 'd', 'girls'].includes(normalized)) {
    return 'F';
  }

  return 'B';
}

function normalizeAgeRange(minAge: number | null, maxAge: number | null) {
  return {
    minAge: minAge === 0 ? null : minAge,
    maxAge: maxAge === 99 ? null : maxAge,
  };
}

function looksLikeClassDefinition(record: GenericRecord): boolean {
  const classDefinition = readClassDefinitionRecord(record);
  const hasClassIdentity = Boolean(
    readString(record, CLASS_ID_KEYS) || readString(record, CLASS_NAME_KEYS),
  );
  const hasDefinitionData =
    readNumber(record, FEE_KEYS) !== undefined ||
    readInt(record, AGE_FROM_KEYS) !== undefined ||
    readInt(record, AGE_TO_KEYS) !== undefined ||
    readString(record, GENDER_KEYS) !== undefined ||
    readBoolean(record, NO_EXTRA_FEE_KEYS) !== undefined ||
    (classDefinition !== null &&
      (readInt(classDefinition, AGE_FROM_KEYS) !== undefined ||
        readInt(classDefinition, AGE_TO_KEYS) !== undefined ||
        readString(classDefinition, GENDER_KEYS) !== undefined));

  return hasClassIdentity && hasDefinitionData;
}

function mergeExternalClassDefinition(
  existing: ExternalClassDefinition,
  incoming: ExternalClassDefinition,
): ExternalClassDefinition {
  return {
    externalId: existing.externalId ?? incoming.externalId,
    name: existing.name ?? incoming.name,
    fee: existing.fee ?? incoming.fee,
    minAge: existing.minAge ?? incoming.minAge,
    maxAge: existing.maxAge ?? incoming.maxAge,
    sex: existing.sex !== 'B' ? existing.sex : incoming.sex,
    lateEntryFeeDisabled: existing.lateEntryFeeDisabled || incoming.lateEntryFeeDisabled,
  };
}

function parseExternalClassDefinitions(payload: unknown): ExternalClassDefinition[] {
  const definitions = new Map<string, ExternalClassDefinition>();

  for (const record of collectRecords(payload)) {
    if (!looksLikeClassDefinition(record)) {
      continue;
    }

    const classDefinition = readClassDefinitionRecord(record);
    const externalId = readString(record, CLASS_ID_KEYS) ?? null;
    const name =
      readString(record, CLASS_NAME_KEYS) ??
      (classDefinition ? readString(classDefinition, CLASS_NAME_KEYS) : null) ??
      null;
    const minAge =
      readInt(record, AGE_FROM_KEYS) ??
      (classDefinition ? readInt(classDefinition, AGE_FROM_KEYS) : null) ??
      null;
    const maxAge =
      readInt(record, AGE_TO_KEYS) ??
      (classDefinition ? readInt(classDefinition, AGE_TO_KEYS) : null) ??
      null;
    const fee = readNumber(record, FEE_KEYS) ?? null;
    const gender =
      readString(record, GENDER_KEYS) ??
      (classDefinition ? readString(classDefinition, GENDER_KEYS) : undefined);

    if (minAge !== null && maxAge !== null && minAge > maxAge) {
      continue;
    }
    const normalizedAgeRange = normalizeAgeRange(minAge, maxAge);
    validateClassFee(fee);

    const definition: ExternalClassDefinition = {
      externalId,
      name,
      fee,
      minAge: normalizedAgeRange.minAge,
      maxAge: normalizedAgeRange.maxAge,
      sex: normalizeSex(gender),
      lateEntryFeeDisabled: readBoolean(record, NO_EXTRA_FEE_KEYS) ?? false,
    };

    const normalizedName = normalizeClassName(name);
    const key = normalizedName
      ? `name:${normalizedName}`
      : externalId
        ? `id:${externalId.toLowerCase()}`
        : null;
    if (key !== null) {
      const existing = definitions.get(key);
      definitions.set(
        key,
        existing ? mergeExternalClassDefinition(existing, definition) : definition,
      );
    }
  }

  return Array.from(definitions.values());
}

function findDefinitionForClass(
  definitions: ExternalClassDefinition[],
  eventClass: { externalId: string | null; name: string },
): ExternalClassDefinition | null {
  const normalizedName = normalizeClassName(eventClass.name);
  const byName =
    definitions.find((definition) => normalizeClassName(definition.name) === normalizedName) ??
    null;
  if (byName) {
    return byName;
  }

  if (eventClass.externalId) {
    const byExternalId = definitions.find(
      (definition) => definition.externalId?.toLowerCase() === eventClass.externalId?.toLowerCase(),
    );
    if (byExternalId) {
      return byExternalId;
    }
  }

  return null;
}

async function fetchExternalClassDefinitionPayload(params: {
  provider: 'ORIS' | 'EVENTOR';
  externalEventId: string;
}): Promise<unknown> {
  if (params.provider === 'ORIS') {
    return fetchExternalPayload(buildOrisUrl('getEvent', { id: params.externalEventId }));
  }

  const apiKey = getEventorApiKey();
  const headers = {
    ApiKey: apiKey,
    'Api-Key': apiKey,
  };
  const urls = [
    buildEventorUrl('eventclasses', { eventId: params.externalEventId }),
    buildEventorUrl(`event/${encodeURIComponent(params.externalEventId)}/classes`),
    buildEventorUrl(`event/${encodeURIComponent(params.externalEventId)}`),
  ];
  let lastError: unknown;

  for (const url of urls) {
    try {
      return await fetchExternalPayload(url, headers);
    } catch (error) {
      lastError = error;
      if (!(error instanceof ExternalImportError) || error.statusCode !== 404) {
        throw error;
      }
    }
  }

  throw lastError;
}

/**
 * Sets the base entry fee on a class. Authorises against the owning event so
 * only the event owner or an admin can change pricing.
 */
export async function updateClassFeeForGraphQL(
  prisma: AppPrismaClient,
  auth: GraphQLAuthContext,
  input: UpdateClassFeeInput,
) {
  validateClassFee(input.fee);

  const eventClass = await prisma.class.findUnique({
    where: { id: input.classId },
    select: { id: true, eventId: true },
  });

  if (!eventClass) {
    throw new Error('Class not found');
  }

  await requireEventOwnerOrAdmin(prisma, auth, eventClass.eventId);

  await prisma.class.update({
    where: { id: eventClass.id },
    data: { fee: input.fee },
  });

  return { message: 'Class fee updated' };
}

/**
 * Partial update of a class's editable configuration. Validates input with the
 * shared `classUpdateInputSchema` (including cross-field age / team-size
 * constraints and 2-decimal fee limit), authorises against the owning event,
 * and persists only the fields the caller supplied. Passing `null` for a
 * nullable field clears it; omitting a field leaves it unchanged.
 */
export async function updateClassForGraphQL(
  prisma: AppPrismaClient,
  auth: GraphQLAuthContext,
  input: unknown,
) {
  const parsed = classUpdateInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid class update input.');
  }

  const { classId, ...fields } = parsed.data;

  const eventClass = await prisma.class.findUnique({
    where: { id: classId },
    select: {
      id: true,
      eventId: true,
      minAge: true,
      maxAge: true,
      minTeamMembers: true,
      maxTeamMembers: true,
    },
  });

  if (!eventClass) {
    throw new Error('Class not found');
  }

  await requireEventOwnerOrAdmin(prisma, auth, eventClass.eventId);

  const merged = classUpdateInputSchema.safeParse({
    ...parsed.data,
    minAge: fields.minAge === undefined ? eventClass.minAge : fields.minAge,
    maxAge: fields.maxAge === undefined ? eventClass.maxAge : fields.maxAge,
    minTeamMembers:
      fields.minTeamMembers === undefined ? eventClass.minTeamMembers : fields.minTeamMembers,
    maxTeamMembers:
      fields.maxTeamMembers === undefined ? eventClass.maxTeamMembers : fields.maxTeamMembers,
  });
  if (!merged.success) {
    throw new ValidationError(merged.error.issues[0]?.message ?? 'Invalid class update input.');
  }

  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      data[key] = value;
    }
  }

  await prisma.class.update({
    where: { id: eventClass.id },
    data: data as Prisma.ClassUpdateInput,
  });

  return { message: 'Class updated' };
}

export async function loadClassDefinitionsFromExternalSystemForGraphQL(
  prisma: AppPrismaClient,
  auth: GraphQLAuthContext,
  eventId: string,
): Promise<LoadExternalClassDefinitionsResult> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      externalSource: true,
      externalEventId: true,
      classes: {
        select: {
          id: true,
          externalId: true,
          name: true,
        },
      },
    },
  });

  if (!event) {
    throw new Error('Event not found');
  }

  await requireEventOwnerOrAdmin(prisma, auth, event.id);

  if (!event.externalSource || !event.externalEventId) {
    throw new ExternalImportError('External event link is not configured.', 422);
  }

  if (event.classes.length === 0) {
    throw new ExternalImportError('No local classes exist for this event.', 422);
  }

  const payload = await fetchExternalClassDefinitionPayload({
    provider: event.externalSource,
    externalEventId: event.externalEventId,
  });
  const definitions = parseExternalClassDefinitions(payload);

  if (definitions.length === 0) {
    throw new ExternalImportError('No class definitions were found in external event data.', 404);
  }

  const updates = event.classes.flatMap((eventClass) => {
    const definition = findDefinitionForClass(definitions, eventClass);
    if (!definition) {
      return [];
    }

    return prisma.class.update({
      where: { id: eventClass.id },
      data: {
        fee: definition.fee,
        minAge: definition.minAge,
        maxAge: definition.maxAge,
        sex: definition.sex,
        lateEntryFeeDisabled: definition.lateEntryFeeDisabled,
      },
    });
  });

  if (updates.length === 0) {
    throw new ExternalImportError('No local classes matched external class definitions.', 404);
  }

  await prisma.$transaction(updates);

  return { updatedCount: updates.length };
}
