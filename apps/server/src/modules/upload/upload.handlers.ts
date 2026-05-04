import { z } from '@hono/zod-openapi';
import { DOMParser } from '@xmldom/xmldom';
import { isRelayDiscipline } from '../../utils/relay.js';
import { Parser } from 'xml2js';
import { validateXML } from 'xmllint-wasm';
import zlib from 'zlib';
import { Prisma } from '../../generated/prisma/client.js';
import type { Sex } from '../../generated/prisma/enums.js';
import { parseMultipartPayload, type MultipartFile } from '../../lib/http/body-parser.js';
import { toValidationIssues } from '../../lib/validation/zod.js';
import { requireAuth } from '../../middlewares/require-jwt.js';
import type { AppBindings, AppOpenAPI } from '../../types/index.js';
import { ensureEventOwnerOrAdmin, isAuthzError } from '../../utils/authz.js';
import { normalizeCountryAlpha3 } from '../../utils/country-code.js';
import prisma from '../../utils/context.js';
import { calculateCzechRankingPointsForEvent } from '../../utils/czech-ranking.js';
import { error, success, validation } from '../../utils/responseApi.js';
import { publishUpdatedClasses } from '../competitor/competitor-change.service.js';
import { detectCompetitorChanges } from '../competitor/competitor-change.helpers.js';
import { upsertOrganisation } from '../event/organisation.helpers.js';
import { getEventFilesStatus, importCourseDataXml } from '../course/index.js';
import type { EventFilesStatus } from '../course/index.js';
import { notifyWinnerChanges } from './../event/event.winner-cache.service.js';
import { getCompetitorKeys, loadCompetitorCache, upsertCompetitor } from './upload.competitor.js';
import { IOF_WRITE_CONCURRENCY } from './upload.constants.js';
import { normalizeCourseMetrics } from './upload.course.js';
import {
  getIofDateTime,
  getIofIntegerValue,
  getIofTextValue,
  inferClassSex,
  toSex,
} from './upload.iof.helpers.js';
import { bulkCreateStartSlotVacancies } from '../start-slot-vacancy/start-slot-vacancy.service.js';
import {
  isIofPayloadType,
  type IofOrganisation,
  type IofTypeMatch,
  type TeamWithBib,
} from './upload.iof.types.js';
import { normalizeCzechRankingMonthInput, storeCzechRankingData } from './upload.service.js';
import {
  isSplitWriteConflict,
  loadSplitCache,
  normalizeIncomingSplits,
  upsertSplits,
} from './upload.split.js';
import { getXsdSchema } from './upload.xsd-cache.js';
import {
  ImportSourceType,
  computeRawHash,
  detectXmlRootElement,
  findImportStateByHash,
  recordSkippedImport,
  upsertImportState,
} from './upload.import-state.js';

const parser = new Parser({ attrkey: 'ATTR', trim: true });

const uploadIofBodySchema = z
  .object({
    eventId: z.string().min(1),
    validateXml: z.boolean().optional(),
  })
  .passthrough();

const uploadCzechRankingBodySchema = z.object({
  rankingType: z.enum(['FOREST', 'SPRINT']),
  rankingCategory: z.enum(['M', 'F']),
  validForMonth: z.string().regex(/^\d{4}-\d{2}$/),
});

type UploadedFile = MultipartFile;
type UploadLogLevel = 'info' | 'warn' | 'error';
type CompressionType = 'none' | 'gzip' | 'zlib' | 'deflate' | 'unknown';
type UploadContext = {
  get: <K extends keyof AppBindings['Variables']>(key: K) => AppBindings['Variables'][K];
  json: (body: unknown, status?: number) => Response;
};
type MaybeUnzipResult = {
  buffer: Buffer;
  compressionEnabled: boolean;
  compressedInput: boolean;
  compressionType: CompressionType;
  decompressionFailed: boolean;
};

type UploadScopedLogger = Pick<AppBindings['Variables']['logger'], 'info' | 'warn' | 'error'>;

function getUploadFileMeta(file?: UploadedFile) {
  return {
    fileName: file?.originalname || null,
    fileSizeBytes: file?.size ?? null,
    mediaType: file?.mimetype || null,
  };
}

function getUploadLogContext(c: UploadContext) {
  try {
    const context = c.get('logContext');
    if (context && typeof context === 'object') {
      return context;
    }
  } catch {
    // no-op fallback
  }

  return {};
}

function logUploadEvent(
  c: UploadContext,
  level: UploadLogLevel,
  message: string,
  details: Record<string, unknown>,
) {
  const context = {
    ...getUploadLogContext(c),
    upload: details,
  };

  let scopedLogger: UploadScopedLogger | undefined;
  try {
    scopedLogger = c.get('logger');
  } catch {
    scopedLogger = undefined;
  }

  if (scopedLogger && typeof scopedLogger[level] === 'function') {
    scopedLogger[level](message, context);
    return;
  }

  if (level === 'error') {
    console.error(message, context);
    return;
  }

  if (level === 'warn') {
    console.warn(message, context);
    return;
  }

  console.info(message, context);
}

/**
 * Parses the XML content from the request file buffer.
 *
 * @param buffer - Request file buffer.
 * @returns Parsed XML object.
 * @throws Error when parsing fails.
 */
async function parseXml(buffer: Buffer): Promise<Record<string, unknown>> {
  /** This function takes in two parameters, a request object and a callback function.
   * It attempts to parse the buffer of the file contained in the request object using the parser.parseStringPromise() method.
   * If successful, it calls the callback function with null as the first parameter and iofXml3 as the second parameter.
   * If an error occurs, it logs it to the console and calls the callback function with err as its only parameter.  */
  try {
    return await parser.parseStringPromise(buffer.toString('utf-8').replace(/^﻿/, ''));
  } catch (err: unknown) {
    console.error(err);
    const message = err instanceof Error ? err.message : 'Unknown parse error';
    throw new Error('Error parsing file: ' + message);
  }
}

/**
 * Checks if the JSON object contains any of the specified XML types and returns an array of objects with information about the matching keys.
 *
 * @param json - Parsed XML object.
 * @returns Matching IOF payload sections.
 */
const checkXmlType = (json: Record<string, unknown>): IofTypeMatch[] => {
  /**
   * checkXmlType() is a function that takes in a JSON object as an argument and returns an array of objects.
   * The function checks if the JSON object contains any of the values in the iofXmlTypes array, and if so,
   * it pushes an object containing the key, value, and whether or not it is an array into the response array.
   * The returned response array will contain objects with information about any keys in the JSON object that match
   * any of the values in the iofXmlTypes array. */
  const response: IofTypeMatch[] = [];
  for (const [key, value] of Object.entries(json)) {
    if (isIofPayloadType(key)) {
      response.push({
        isArray: true,
        jsonKey: key,
        jsonValue: value,
      });
    }
  }

  return response;
};

/**
 * Validates an XML string against an XSD string using WASM-based xmllint.
 *
 * @param xmlString - XML string to validate.
 * @param xsdString - XSD schema content.
 * @returns Validation result with state, message and optional issues.
 */
type XmlValidationIssue = {
  param: string;
  msg: string;
  type: string;
};

type XmlValidationResult = {
  state: boolean;
  message: string;
  errors?: XmlValidationIssue[];
};

const validateIofXml = async (
  xmlString: string,
  xsdString: string,
): Promise<XmlValidationResult> => {
  const returnState: XmlValidationResult = { state: false, message: '' };
  try {
    // First check if XML is well-formed
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

    const parseErrors = xmlDoc.getElementsByTagName('parsererror');
    if (parseErrors.length > 0) {
      returnState.message = 'XML parsing error: ' + parseErrors[0].textContent;
      console.log(returnState.message);
      return returnState;
    }

    // Validate against XSD using xmllint-wasm
    const result = await validateXML({
      xml: [{ fileName: 'iof.xml', contents: xmlString }],
      schema: [xsdString],
    });

    if (result.valid) {
      returnState.state = true;
    } else {
      // Convert xmllint errors to ValidationError format
      returnState.errors = result.errors
        ? result.errors.map((error: unknown) => ({
            param: 'xml',
            msg:
              typeof error === 'string'
                ? error
                : error && typeof error === 'object' && 'message' in error
                  ? String(error.message)
                  : 'Validation error',
            type: 'schema',
          }))
        : [
            {
              param: 'xml',
              msg: 'Validation failed',
              type: 'schema',
            },
          ];
      returnState.message = returnState.errors.map((issue) => issue.msg).join('; ');
      console.log(returnState.message);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown validation error';
    returnState.message = message;
    console.error('Problem to validate xml: ', message);
  }
  return returnState;
};

function canUploadCourseData(status: Pick<EventFilesStatus, 'startList' | 'results'>): boolean {
  return status.startList.available || status.results.available;
}

/**
 * Retrieves a list of classes for a given event.
 *
 * @param eventId - Event identifier.
 * @returns Class list with external identifiers.
 * @throws Error if database query fails.
 */
type ResultListMode = 'Default' | 'Unordered' | 'UnorderedNoTimes';
const RESULT_LIST_MODES = new Set<string>(['Default', 'Unordered', 'UnorderedNoTimes']);

function toResultListMode(value: string | undefined): ResultListMode | null {
  if (value && RESULT_LIST_MODES.has(value)) return value as ResultListMode;
  return null;
}

type StartModeValue = 'StartList' | 'MassStart' | 'PursuitStart' | 'WaveStart' | 'FreeStart';
const START_MODES = new Set<string>([
  'StartList',
  'MassStart',
  'PursuitStart',
  'WaveStart',
  'FreeStart',
]);

function toStartMode(value: string | undefined): StartModeValue | null {
  if (value && START_MODES.has(value)) return value as StartModeValue;
  return null;
}

/**
 * Parses an IOF `<Class><Extensions>` block for the OrienteerFeed start-mode
 * override and optional start window. Returns nulls when the extension or its
 * fields are absent. Exported for direct unit testing without Prisma.
 */
export function parseClassStartExtension(
  extensions: unknown,
  timeZone: string,
): {
  startMode: StartModeValue | null;
  startWindowFrom: Date | null;
  startWindowTo: Date | null;
} {
  const ext = Array.isArray(extensions) ? extensions[0] : extensions;
  if (!ext || typeof ext !== 'object') {
    return { startMode: null, startWindowFrom: null, startWindowTo: null };
  }
  const record = ext as Record<string, unknown>;
  const startMode = toStartMode(getIofTextValue(record.StartMode));
  const windowRaw = Array.isArray(record.StartWindow) ? record.StartWindow[0] : record.StartWindow;
  const window = (windowRaw && typeof windowRaw === 'object' ? windowRaw : {}) as Record<
    string,
    unknown
  >;
  return {
    startMode,
    startWindowFrom: getIofDateTime(window.StartTime, timeZone) ?? null,
    startWindowTo: getIofDateTime(window.EndTime, timeZone) ?? null,
  };
}

type ClassListEntry = {
  id: number;
  externalId: string | null;
  name: string;
  sex: Sex | null;
  maxNumberOfCompetitors: number | null;
  resultListMode: ResultListMode | null;
  startMode: StartModeValue | null;
  startWindowFrom: Date | null;
  startWindowTo: Date | null;
};

async function getClassLists(eventId: string): Promise<ClassListEntry[]> {
  try {
    return await prisma.class.findMany({
      where: { eventId: eventId },
      select: {
        id: true,
        externalId: true,
        name: true,
        sex: true,
        maxNumberOfCompetitors: true,
        resultListMode: true,
        startMode: true,
        startWindowFrom: true,
        startWindowTo: true,
      },
    });
  } catch (err: unknown) {
    console.error(err);
    const message = err instanceof Error ? err.message : 'Unknown database error';
    throw new Error(`Database error: ${message}`);
  }
}

/**
 * Resolves an existing class for the current event.
 *
 * Why: producers without an explicit Class.Id (legacy XSDs, hand-crafted
 * exports) still need to be matched to existing rows by name, but two
 * producers that emit different stable Ids for the same display name must be
 * allowed to coexist as separate classes.
 */
function findExistingClass(
  sourceClassId: string | null,
  className: string,
  dbClassLists: ClassListEntry[],
): ClassListEntry | undefined {
  if (sourceClassId) {
    return dbClassLists.find((cls) => cls.externalId === sourceClassId);
  }
  return dbClassLists.find((cls) => cls.name === className);
}

/**
 * Upserts a class in the database based on the provided class details.
 *
 * @param eventId - Event identifier.
 * @param classDetails - Source class payload from XML.
 * @param dbClassLists - Existing DB classes for current event.
 * @param additionalData - Optional derived attributes.
 * @returns Class numeric database ID.
 */
async function upsertClass(
  eventId: string,
  classDetails: {
    Id?: string[];
    Name: string[];
    Extensions?: unknown;
    ATTR?: {
      sex?: string;
      maxNumberOfCompetitors?: string | number;
      resultListMode?: string;
    };
  },
  dbClassLists: ClassListEntry[],
  eventTimeZone: string,
  additionalData: Record<string, unknown> = {},
): Promise<number> {
  const sourceClassId = classDetails.Id?.shift() ?? null;
  const className = classDetails.Name.shift() ?? sourceClassId ?? '';
  const existingClass = findExistingClass(sourceClassId, className, dbClassLists);

  const classSex = toSex(classDetails.ATTR?.sex, inferClassSex(className));
  const maxNumberOfCompetitors =
    getIofIntegerValue(classDetails.ATTR?.maxNumberOfCompetitors) ?? null;
  const resultListMode = toResultListMode(classDetails.ATTR?.resultListMode);
  const { startMode, startWindowFrom, startWindowTo } = parseClassStartExtension(
    classDetails.Extensions,
    eventTimeZone,
  );

  if (!existingClass) {
    const dbClassInsert = await prisma.class.create({
      data: {
        eventId: eventId,
        externalId: sourceClassId,
        name: className,
        sex: classSex,
        maxNumberOfCompetitors,
        resultListMode,
        startMode,
        startWindowFrom,
        startWindowTo,
        ...additionalData,
      },
    });
    return dbClassInsert.id;
  }

  // Skip the DB write when nothing has changed. additionalData (course metrics
  // from StartList) is always empty for ResultList processing, covering the
  // common re-upload scenario where dozens of classes remain unchanged.
  const sameDateTime = (a: Date | null, b: Date | null) =>
    (a?.getTime() ?? null) === (b?.getTime() ?? null);
  const hasAdditionalData = Object.keys(additionalData).length > 0;
  if (
    !hasAdditionalData &&
    existingClass.name === className &&
    existingClass.sex === classSex &&
    existingClass.maxNumberOfCompetitors === maxNumberOfCompetitors &&
    existingClass.resultListMode === resultListMode &&
    existingClass.startMode === startMode &&
    sameDateTime(existingClass.startWindowFrom, startWindowFrom) &&
    sameDateTime(existingClass.startWindowTo, startWindowTo)
  ) {
    return existingClass.id;
  }

  await prisma.class.update({
    where: { id: existingClass.id },
    data: {
      name: className,
      sex: classSex,
      maxNumberOfCompetitors,
      resultListMode,
      startMode,
      startWindowFrom,
      startWindowTo,
      ...additionalData,
    },
  });
  return existingClass.id;
}

async function forEachWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
) {
  if (items.length === 0) {
    return;
  }

  const maxConcurrency = Math.max(1, Math.floor(concurrency));
  const workerCount = Math.min(maxConcurrency, items.length);
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const currentIndex = nextIndex;
        nextIndex += 1;

        if (currentIndex >= items.length) {
          return;
        }

        await worker(items[currentIndex], currentIndex);
      }
    }),
  );
}

/**
 * Extracts IOF EntryId from a team payload. Returns null when the element is
 * absent, empty, or contains only whitespace.
 */
export function extractTeamExternalId(teamPayload: TeamWithBib): string | null {
  const raw = teamPayload.EntryId?.[0];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed || null;
}

/**
 * Resolves an existing Team row for the given event scope.
 *
 * Lookup order:
 *  1. If externalId (IOF EntryId) is present → precise lookup by (classId, externalId).
 *     This is O(1) via the unique index and handles the case where the same team
 *     appears in both StartList and ResultList imports.
 *  2. Fall back to (eventId + bibNumber) — preserves existing behaviour for
 *     imports that pre-date EntryId support, or files that omit it.
 *
 * Returns null when no matching team is found.
 */
export async function resolveExistingTeam(
  eventId: string,
  classId: number,
  externalId: string | null,
  bibNumber: number | null,
): Promise<{ id: number } | null> {
  if (externalId) {
    const byExternalId = await prisma.team.findUnique({
      where: { classId_externalId: { classId, externalId } },
      select: { id: true },
    });
    if (byExternalId) return byExternalId;
  }
  // Legacy / first-adoption path: locate an existing team that has no externalId
  // yet but matches the bib number within the event.
  if (bibNumber === null) return null;
  return prisma.team.findFirst({
    where: { class: { eventId }, bibNumber },
    select: { id: true },
  });
}

/**
 * Upserts (inserts or updates) a team entry in the database.
 *
 * Lookup priority:
 *  1. IOF EntryId (Team.externalId) — precise, idempotent across StartList /
 *     ResultList uploads of the same event.
 *  2. bibNumber within event scope — legacy fallback for files without EntryId.
 *
 * @param eventId - Event identifier.
 * @param classId - Class database ID.
 * @param teamResult - Team payload with name, EntryId, and bib number.
 * @param organisation - Organisation details (may be null).
 * @returns Team database ID.
 */
async function upsertTeam(
  eventId: string,
  classId: number,
  teamResult: TeamWithBib,
  organisation: IofOrganisation,
): Promise<number> {
  const teamName = teamResult.Name.shift() ?? '';
  const bibNumber = teamResult.BibNumber
    ? Number.parseInt(teamResult.BibNumber.shift() ?? '', 10) || null
    : null;
  const externalId = extractTeamExternalId(teamResult);

  const existingTeam = await resolveExistingTeam(eventId, classId, externalId, bibNumber);

  // Resolve the Organisation row scoped to this event for the team.
  const hasTeamOrganisationPayload = organisation !== null && organisation !== undefined;
  const teamOrganisationExternalId =
    organisation?.Id?.[0]?._ ??
    organisation?.ATTR?.id ??
    (typeof organisation?.Id?.[0] === 'string'
      ? (organisation?.Id?.[0] as unknown as string)
      : undefined) ??
    null;
  const teamOrganisationId = hasTeamOrganisationPayload
    ? await upsertOrganisation({
        eventId,
        externalId: teamOrganisationExternalId,
        name: organisation?.Name?.[0] ?? null,
        shortName: organisation?.ShortName?.[0] ?? null,
        nationality: normalizeCountryAlpha3(organisation?.Country?.[0]?.ATTR?.code),
      })
    : undefined;
  const teamOrganisationCreateWrite =
    hasTeamOrganisationPayload && teamOrganisationId
      ? { organisation: { connect: { id: teamOrganisationId } } }
      : {};
  const teamOrganisationUpdateWrite = hasTeamOrganisationPayload
    ? {
        organisation: teamOrganisationId
          ? { connect: { id: teamOrganisationId } }
          : { disconnect: true },
      }
    : {};

  if (!existingTeam) {
    try {
      const created = await prisma.team.create({
        data: {
          class: { connect: { id: classId } },
          name: teamName,
          externalId,
          ...teamOrganisationCreateWrite,
          bibNumber: bibNumber,
        },
        select: { id: true },
      });
      return created.id;
    } catch (err) {
      // P2002 on (classId, externalId): another concurrent worker created the
      // team first. Re-read and return the racer's row — subsequent member
      // writes will link to the correct team ID.
      if (
        externalId &&
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const raced = await prisma.team.findUnique({
          where: { classId_externalId: { classId, externalId } },
          select: { id: true },
        });
        if (raced) return raced.id;
      }
      throw err;
    }
  }

  await prisma.team.update({
    where: { id: existingTeam.id },
    data: {
      class: { connect: { id: classId } },
      name: teamName,
      externalId,
      ...teamOrganisationUpdateWrite,
      bibNumber: bibNumber,
    },
  });
  return existingTeam.id;
}

async function upsertEmbeddedCourse(eventId: string, courseEl: Record<string, any>): Promise<void> {
  const externalId = getIofTextValue(courseEl.Id);
  const name = getIofTextValue(courseEl.Name) ?? externalId;
  if (!name) return;

  const courseData = {
    ...(externalId ? { externalId } : {}),
    ...normalizeCourseMetrics({
      length: getIofIntegerValue(courseEl.Length),
      climb: getIofIntegerValue(courseEl.Climb),
      controlsCount: getIofIntegerValue(courseEl.NumberOfControls),
    }),
  };

  await prisma.course.upsert({
    where: { eventId_name: { eventId, name } },
    update: courseData,
    create: {
      eventId,
      name,
      ...courseData,
    },
  });
}

/**
 * Processes class starts for an event.
 *
 * @param eventId - Event ID.
 * @param classStarts - Class starts payload.
 * @param dbClassLists - Existing DB classes for the event.
 * @param dbResponseEvent - Event flags used by processing flow.
 * @returns Completion promise.
 */
async function processClassStarts(
  eventId: string,
  classStarts: Array<Record<string, any>>,
  dbClassLists: ClassListEntry[],
  dbResponseEvent: { discipline?: string | null; timezone?: string | null },
  authorId: number,
): Promise<number[]> {
  const updatedClasses = new Set<number>();
  const eventTimeZone = dbResponseEvent.timezone ?? 'UTC';

  await forEachWithConcurrency(
    classStarts,
    IOF_WRITE_CONCURRENCY,
    async (classStart: Record<string, any>) => {
      const classDetails = classStart.Class.shift();

      let length = null,
        climb = null,
        startName = null,
        controlsCount = null;

      if (classStart.Course && classStart.Course.length > 0) {
        length = getIofIntegerValue(classStart.Course[0].Length);
        climb = getIofIntegerValue(classStart.Course[0].Climb);
        controlsCount = getIofIntegerValue(classStart.Course[0].NumberOfControls);
      }
      if (classStart.StartName) startName = classStart.StartName[0];

      const additionalData = {
        startName: startName,
        ...normalizeCourseMetrics({
          length,
          climb,
          controlsCount,
        }),
      };

      const classId = await upsertClass(
        eventId,
        classDetails,
        dbClassLists,
        eventTimeZone,
        additionalData,
      );
      const competitorCache = await loadCompetitorCache(classId);

      if (!isRelayDiscipline(dbResponseEvent.discipline)) {
        // Process Individual Starts
        if (!classStart.PersonStart || classStart.PersonStart.length === 0) return;

        // A PersonStart without a <Person> child, or with <Given>Vacant</Given>,
        // is a vacant reserved slot in the IOF start list (e.g. a regular class
        // or free-start vacancy). These carry a start time but no real
        // competitor, so they are recorded in the StartSlotVacancy table instead
        // of creating an empty competitor. The matching vacancy is removed
        // automatically once a competitor later occupies that slot (see
        // deleteMatchingStartSlotVacancy).
        const competitorStarts: Array<Record<string, any>> = [];
        const vacantSlots: { startTime: Date; bibNumber: number | null }[] = [];
        for (const personStart of classStart.PersonStart as Array<Record<string, any>>) {
          const personEl =
            Array.isArray(personStart.Person) && personStart.Person.length > 0
              ? personStart.Person[0]
              : null;
          const givenName: string = personEl?.Name?.[0]?.Given?.[0] ?? '';
          const isVacantPerson = givenName.trim().toLowerCase() === 'vacant';
          const hasPerson = personEl !== null && !isVacantPerson;
          if (hasPerson) {
            competitorStarts.push(personStart);
            continue;
          }
          const vacantStart =
            Array.isArray(personStart.Start) && personStart.Start.length > 0
              ? personStart.Start[0]
              : null;
          const vacancyStartTime = getIofDateTime(vacantStart?.StartTime, eventTimeZone);
          // Skip vacant slots without a parseable start time — startTime is part
          // of the [classId, startTime] unique key and cannot be null.
          if (!vacancyStartTime) continue;
          const bibNumber = vacantStart?.BibNumber
            ? parseInt(vacantStart.BibNumber[0] ?? '', 10) || null
            : null;
          vacantSlots.push({ startTime: vacancyStartTime, bibNumber });
        }

        if (vacantSlots.length > 0) {
          await bulkCreateStartSlotVacancies(prisma, classId, vacantSlots);
        }

        await forEachWithConcurrency(
          competitorStarts,
          IOF_WRITE_CONCURRENCY,
          async (competitorStart: Record<string, any>) => {
            const person = competitorStart.Person.shift();
            const organisation =
              Array.isArray(competitorStart.Organisation) && competitorStart.Organisation.length > 0
                ? competitorStart.Organisation.shift()
                : null;
            const start = competitorStart.Start.shift();
            const { updated } = await upsertCompetitor(
              eventId,
              classId,
              person,
              organisation,
              start,
              null,
              eventTimeZone,
              null,
              null,
              authorId,
              competitorCache,
            );
            if (updated) updatedClasses.add(classId);
          },
        );
      } else {
        // Process Relay Starts
        if (!classStart.TeamStart || classStart.TeamStart.length === 0) return;

        await forEachWithConcurrency(
          classStart.TeamStart as Array<Record<string, any>>,
          IOF_WRITE_CONCURRENCY,
          async (teamStart: Record<string, any>) => {
            const organisation = teamStart.Organisation
              ? [...teamStart.Organisation].shift()
              : null;

            const teamId = await upsertTeam(
              eventId,
              classId,
              teamStart as TeamWithBib,
              organisation,
            );
            // Process Team Member Starts
            if (teamStart.TeamMemberStart && teamStart.TeamMemberStart.length > 0) {
              await forEachWithConcurrency(
                teamStart.TeamMemberStart as Array<Record<string, any>>,
                IOF_WRITE_CONCURRENCY,
                async (teamMemberStart: Record<string, any>) => {
                  const person = teamMemberStart.Person[0];
                  const start = [...teamMemberStart.Start].shift();
                  const leg = [...start.Leg].shift();

                  const startCourse = Array.isArray(start.Course) ? start.Course[0] : null;
                  if (startCourse) {
                    await upsertEmbeddedCourse(eventId, startCourse);
                  }

                  const { updated } = await upsertCompetitor(
                    eventId,
                    classId,
                    person,
                    organisation,
                    start,
                    null,
                    eventTimeZone,
                    teamId,
                    leg,
                    authorId,
                    competitorCache,
                  );
                  if (updated) updatedClasses.add(classId);
                },
              );
            }
          },
        );
      }
    },
  );
  return [...updatedClasses];
}

/**
 * Processes class results for an event, updating the database with new or modified data.
 *
 * @param eventId - Event ID.
 * @param classResults - Class results payload.
 * @param dbClassLists - Existing DB classes for the event.
 * @param dbResponseEvent - Event flags used by processing flow.
 * @returns Updated class IDs.
 */
async function processClassResults(
  eventId: string,
  classResults: Array<Record<string, any>>,
  dbClassLists: ClassListEntry[],
  dbResponseEvent: { discipline?: string | null; ranking?: boolean; timezone?: string | null },
  authorId: number,
): Promise<number[]> {
  const updatedClasses = new Set<number>(); // Unique class IDs that had changes
  const eventTimeZone = dbResponseEvent.timezone ?? 'UTC';
  await forEachWithConcurrency(
    classResults,
    IOF_WRITE_CONCURRENCY,
    async (classResult: Record<string, any>) => {
      const classDetails = classResult.Class.shift();
      const classId = await upsertClass(eventId, classDetails, dbClassLists, eventTimeZone);
      const competitorCache = await loadCompetitorCache(classId);
      // Pre-load splits for all competitors already in the DB for this class.
      // One round-trip replaces N per-competitor findMany calls on re-uploads.
      const existingCompetitorIds = [...competitorCache.values()].map((c) => c.id);
      const splitCache = await loadSplitCache(existingCompetitorIds);

      if (!isRelayDiscipline(dbResponseEvent.discipline)) {
        // Process Individual Results
        if (!classResult.PersonResult || classResult.PersonResult.length === 0) return;
        await forEachWithConcurrency(
          classResult.PersonResult as Array<Record<string, any>>,
          IOF_WRITE_CONCURRENCY,
          async (competitorResult: Record<string, any>) => {
            const person = competitorResult.Person.shift();

            const organisation =
              Array.isArray(competitorResult.Organisation) &&
              competitorResult.Organisation.length > 0
                ? competitorResult.Organisation.shift()
                : null;

            const result =
              Array.isArray(competitorResult.Result) && competitorResult.Result.length > 0
                ? competitorResult.Result.shift()
                : null;

            const { id: competitorId, updated } = await upsertCompetitor(
              eventId,
              classId,
              person,
              organisation,
              null,
              result,
              eventTimeZone,
              null,
              null,
              authorId,
              competitorCache,
            );
            const { changeMade: updatedSplits } = await upsertSplits(
              competitorId,
              result,
              splitCache,
            );
            if (updated || updatedSplits) updatedClasses.add(classId);
          },
        );
      } else {
        // Process Relay Results
        if (!classResult.TeamResult || classResult.TeamResult.length === 0) return;

        await forEachWithConcurrency(
          classResult.TeamResult as Array<Record<string, any>>,
          IOF_WRITE_CONCURRENCY,
          async (teamResult: Record<string, any>) => {
            const organisation = teamResult.Organisation
              ? [...teamResult.Organisation].shift()
              : null; // Organisation details

            const teamId = await upsertTeam(
              eventId,
              classId,
              teamResult as TeamWithBib,
              organisation,
            );
            // Process Team Member Results
            if (teamResult.TeamMemberResult && teamResult.TeamMemberResult.length > 0) {
              if (
                Array.isArray(teamResult.TeamMemberResult) &&
                teamResult.TeamMemberResult.length > 0
              ) {
                await forEachWithConcurrency(
                  teamResult.TeamMemberResult as Array<Record<string, any>>,
                  IOF_WRITE_CONCURRENCY,
                  async (teamMemberResult: Record<string, any>) => {
                    if (!teamMemberResult?.Person?.[0]) return;
                    const person = teamMemberResult.Person[0];
                    const result = [...teamMemberResult.Result].shift();
                    const leg = [...result.Leg].shift();

                    if (!person || !result || !leg) {
                      console.warn('Skipping incomplete TeamMemberResult:', teamMemberResult);
                      return;
                    }

                    const resultCourse = Array.isArray(result.Course) ? result.Course[0] : null;
                    if (resultCourse) {
                      await upsertEmbeddedCourse(eventId, resultCourse);
                    }

                    const { id: competitorId, updated } = await upsertCompetitor(
                      eventId,
                      classId,
                      person,
                      organisation,
                      null,
                      result,
                      eventTimeZone,
                      teamId,
                      leg,
                      authorId,
                      competitorCache,
                    );
                    const { changeMade: updatedSplits } = await upsertSplits(
                      competitorId,
                      result,
                      splitCache,
                    );
                    if (updated || updatedSplits) updatedClasses.add(classId);
                  },
                );
              }
            }
          },
        );
      }
    },
  );
  return [...updatedClasses];
}

/**
 * Handles the upload of IOF XML files.
 *
 * @param c - Hono context.
 * @param payload - Parsed multipart payload.
 * @returns Upload handler response.
 */
async function handleIofXmlUpload(
  c: UploadContext,
  { eventId, validateXml, file }: { eventId: string; validateXml?: boolean; file?: UploadedFile },
) {
  const endpoint = '/rest/v1/upload/iof';
  const iofValidationEnabled = typeof validateXml === 'undefined' || validateXml !== false;

  if (!file) {
    logUploadEvent(c, 'warn', 'IOF upload failed: missing file', {
      endpoint,
      eventId,
      ...getUploadFileMeta(file),
      compressionEnabled: true,
      compressedInput: false,
      compressionType: 'none',
      decompressionFailed: false,
      iofValidationEnabled,
      success: false,
      stage: 'input',
    });
    return c.json(validation('No file uploaded', 422), 422);
  }

  const unzipResult = maybeUnzip(file);
  const uploadDetails = {
    endpoint,
    eventId,
    ...getUploadFileMeta(file),
    compressionEnabled: unzipResult.compressionEnabled,
    compressedInput: unzipResult.compressedInput,
    compressionType: unzipResult.compressionType,
    decompressionFailed: unzipResult.decompressionFailed,
    iofValidationEnabled,
  };

  logUploadEvent(c, 'info', 'IOF upload received', {
    ...uploadDetails,
    success: false,
    stage: 'received',
  });

  if (unzipResult.decompressionFailed) {
    logUploadEvent(c, 'warn', 'IOF upload decompression failed, falling back to raw payload', {
      ...uploadDetails,
      success: false,
      stage: 'decompression',
    });
  }

  const xmlBuffer = unzipResult.buffer;

  if (iofValidationEnabled) {
    const xsd = await getXsdSchema();
    const iofXmlValidation = await validateIofXml(
      xmlBuffer.toString('utf-8').replace(/^﻿/, ''),
      xsd,
    );
    if (!iofXmlValidation.state) {
      logUploadEvent(c, 'warn', 'IOF upload failed XML validation', {
        ...uploadDetails,
        success: false,
        stage: 'xml-validation',
        validationMessage: iofXmlValidation.message,
      });
      return c.json(validation(iofXmlValidation.errors ?? iofXmlValidation.message), 422);
    }
  }

  let dbResponseEvent;
  let authorId: number;
  try {
    const ownership = await ensureEventOwnerOrAdmin(prisma, c.get('authContext'), eventId, {
      select: { discipline: true, ranking: true, timezone: true },
      eventNotFoundStatus: 404,
      eventNotFoundMessage: 'Event not found',
      forbiddenStatus: 403,
      forbiddenMessage: 'You are not authorized to upload data for this event',
    });

    dbResponseEvent = ownership.event;
    authorId = ownership.userId;
  } catch (err) {
    if (isAuthzError(err)) {
      const statusCode = err.statusCode === 404 ? 404 : err.statusCode === 403 ? 403 : 401;
      logUploadEvent(c, 'warn', 'IOF upload failed authorization', {
        ...uploadDetails,
        success: false,
        stage: 'authorization',
        statusCode,
        reason: err.message,
      });
      return c.json(error(err.message, statusCode), statusCode);
    }

    const message = err instanceof Error ? err.message : 'Internal Server Error';
    logUploadEvent(c, 'error', 'IOF upload failed while resolving event ownership', {
      ...uploadDetails,
      success: false,
      stage: 'authorization',
      reason: message,
    });
    return c.json(error(message, 500), 500);
  }

  // Early return: skip identical re-uploads before expensive XML parsing
  const rawHash = computeRawHash(xmlBuffer);
  const detectedPayloadType = detectXmlRootElement(xmlBuffer);

  if (detectedPayloadType !== null && isIofPayloadType(detectedPayloadType)) {
    const isIdentical = await findImportStateByHash(
      eventId,
      ImportSourceType.IOF_XML,
      detectedPayloadType,
      rawHash,
    );
    if (isIdentical) {
      await recordSkippedImport(eventId, ImportSourceType.IOF_XML, detectedPayloadType, rawHash);
      logUploadEvent(c, 'info', 'IOF upload skipped: identical content already imported', {
        ...uploadDetails,
        success: true,
        stage: 'skipped-identical',
        rawHash,
        detectedPayloadType,
      });
      return c.json(
        success('OK', { data: 'Skipped: identical upload already processed', skipped: true }, 200),
        200,
      );
    }
  }

  let iofXml3: Record<string, any>;
  try {
    iofXml3 = (await parseXml(xmlBuffer)) as Record<string, any>;
  } catch (err: any) {
    logUploadEvent(c, 'error', 'IOF upload failed while parsing XML', {
      ...uploadDetails,
      success: false,
      stage: 'xml-parse',
      reason: err?.message || 'XML parsing failed',
    });
    return c.json(error(err.message, 500), 500);
  }

  const iofXmlType = checkXmlType(iofXml3);

  const iofRootKey = Object.keys(iofXml3)[0] ?? '';
  const iofRootAttr = (iofXml3[iofRootKey]?.ATTR ?? {}) as Record<string, string | undefined>;
  const iofRootMeta = {
    creator: iofRootAttr.creator ?? null,
    externalCreateTime: iofRootAttr.createTime ? new Date(iofRootAttr.createTime) : null,
    formatVersion: iofRootAttr.iofVersion ?? null,
    externalStatus: iofRootAttr.status ?? null,
  };

  logUploadEvent(c, 'info', 'IOF upload XML parsed', {
    ...uploadDetails,
    success: false,
    stage: 'xml-parsed',
    detectedTypes: iofXmlType.map((type) => type.jsonKey),
    detectedTypeCount: iofXmlType.length,
  });

  if (iofXmlType.length === 0) {
    logUploadEvent(c, 'warn', 'IOF upload parsed XML without supported IOF sections', {
      ...uploadDetails,
      success: false,
      stage: 'xml-type-detection',
    });
  }

  if (iofXmlType.some((type) => type.jsonKey === 'CourseData')) {
    let eventFilesStatus: EventFilesStatus;
    try {
      eventFilesStatus = await getEventFilesStatus(prisma, eventId);
    } catch (err: any) {
      logUploadEvent(c, 'error', 'IOF upload failed while checking CourseData prerequisites', {
        ...uploadDetails,
        success: false,
        stage: 'course-data-prerequisites',
        reason: err?.message || 'Unable to check CourseData prerequisites',
      });
      return c.json(error(err.message, 500), 500);
    }

    if (!canUploadCourseData(eventFilesStatus)) {
      const message =
        'CourseData upload requires an existing start list or result data for this event.';
      logUploadEvent(c, 'warn', 'IOF upload CourseData rejected: missing prerequisites', {
        ...uploadDetails,
        success: false,
        stage: 'course-data-prerequisites',
        startListAvailable: eventFilesStatus.startList.available,
        resultsAvailable: eventFilesStatus.results.available,
      });
      return c.json(validation(message, 422), 422);
    }
  }

  let dbClassLists;
  try {
    dbClassLists = await getClassLists(eventId);
  } catch (err: any) {
    logUploadEvent(c, 'error', 'IOF upload failed while loading event classes', {
      ...uploadDetails,
      success: false,
      stage: 'load-classes',
      reason: err?.message || 'Unable to load classes',
    });
    return c.json(error(err.message, 500), 500);
  }

  const eventName = iofXml3[Object.keys(iofXml3)[0]]['Event'][0]['Name'];

  try {
    await Promise.all(
      iofXmlType.map(async (type) => {
        if (type.jsonKey === 'ResultList') {
          const classResults = iofXml3.ResultList.ClassResult;
          logUploadEvent(c, 'info', 'IOF upload processing ResultList', {
            ...uploadDetails,
            success: false,
            stage: 'processing-result-list',
            classResultCount: Array.isArray(classResults) ? classResults.length : 0,
          });
          if (classResults && classResults.length > 0) {
            const updatedClasses = await processClassResults(
              eventId,
              classResults,
              dbClassLists,
              dbResponseEvent,
              authorId,
            );
            if (dbResponseEvent.ranking) {
              const rankingCalculation = await calculateCzechRankingPointsForEvent(eventId);
              if (!rankingCalculation) {
                console.log('Ranking points cannot be calculated');
              }
            }
            notifyWinnerChanges(eventId);
            logUploadEvent(c, 'info', 'IOF upload ResultList processed', {
              ...uploadDetails,
              success: false,
              stage: 'processed-result-list',
              classResultCount: classResults.length,
              updatedClassCount: updatedClasses.length,
            });
            await publishUpdatedClasses(updatedClasses, (classId, err) => {
              logUploadEvent(c, 'error', 'IOF upload failed while publishing updated competitors', {
                ...uploadDetails,
                success: false,
                stage: 'publish-updated-competitors',
                classId,
                reason: err instanceof Error ? err.message : 'Publish failed',
              });
            });
          }
        } else if (type.jsonKey === 'StartList') {
          const classStarts = iofXml3.StartList.ClassStart;
          logUploadEvent(c, 'info', 'IOF upload processing StartList', {
            ...uploadDetails,
            success: false,
            stage: 'processing-start-list',
            classStartCount: Array.isArray(classStarts) ? classStarts.length : 0,
          });
          if (classStarts && classStarts.length > 0) {
            const updatedClasses = await processClassStarts(
              eventId,
              classStarts,
              dbClassLists,
              dbResponseEvent,
              authorId,
            );
            logUploadEvent(c, 'info', 'IOF upload StartList processed', {
              ...uploadDetails,
              success: false,
              stage: 'processed-start-list',
              classStartCount: classStarts.length,
              updatedClassCount: updatedClasses.length,
            });
            await publishUpdatedClasses(updatedClasses, (classId, err) => {
              logUploadEvent(c, 'error', 'IOF upload failed while publishing updated competitors', {
                ...uploadDetails,
                success: false,
                stage: 'publish-updated-competitors',
                classId,
                reason: err instanceof Error ? err.message : 'Publish failed',
              });
            });
          }
        } else if (type.jsonKey === 'CourseData') {
          // Process CourseData
          let dbClassLists: ClassListEntry[];
          try {
            dbClassLists = await prisma.class.findMany({
              where: { eventId: eventId },
              select: {
                id: true,
                externalId: true,
                name: true,
                sex: true,
                maxNumberOfCompetitors: true,
                resultListMode: true,
                startMode: true,
                startWindowFrom: true,
                startWindowTo: true,
              },
            });
          } catch (err) {
            logUploadEvent(c, 'error', 'IOF upload failed while loading classes for course data', {
              ...uploadDetails,
              success: false,
              stage: 'course-data-load-classes',
              reason: err instanceof Error ? err.message : 'Unable to load classes',
            });
            return;
          }

          const courseData = iofXml3.CourseData.RaceCourseData[0].Course;
          logUploadEvent(c, 'info', 'IOF upload processing CourseData', {
            ...uploadDetails,
            success: false,
            stage: 'processing-course-data',
            courseCount: Array.isArray(courseData) ? courseData.length : 0,
          });
          await Promise.all(
            courseData.map(async (course) => {
              const assignment = Array.isArray(course.ClassAssignment)
                ? course.ClassAssignment[0]
                : null;
              const legNumber = assignment?.Leg ? getIofIntegerValue(assignment.Leg) : null;
              const length = getIofIntegerValue(course.Length);
              const climb = getIofIntegerValue(course.Climb);

              // Per-leg course: ClassAssignment carries a Leg number and class name
              if (legNumber != null && assignment) {
                const className: string =
                  (Array.isArray(assignment.ClassName) ? assignment.ClassName[0] : null) ??
                  (Array.isArray(assignment.ClassShortName)
                    ? assignment.ClassShortName[0]
                    : null) ??
                  course.Name[0];
                const classDetails = { Name: [className], Id: [], ATTR: {} };
                await upsertClass(
                  eventId,
                  classDetails,
                  dbClassLists,
                  dbResponseEvent.timezone ?? 'UTC',
                );
                return;
              }

              // Standard (non-relay) course: update the class-level length/climb
              const classDetails = {
                Name: [course.Name[0]],
                Id: [],
                ATTR: {},
              };
              const additionalData = {
                ...normalizeCourseMetrics({
                  length,
                  climb,
                  controlsCount: Array.isArray(course.CourseControl)
                    ? course.CourseControl.length - 2
                    : null,
                }),
              };

              await upsertClass(
                eventId,
                classDetails,
                dbClassLists,
                dbResponseEvent.timezone ?? 'UTC',
                additionalData,
              );
            }),
          );
          logUploadEvent(c, 'info', 'IOF upload CourseData processed', {
            ...uploadDetails,
            success: false,
            stage: 'processed-course-data',
            courseCount: Array.isArray(courseData) ? courseData.length : 0,
          });

          // Populate the dedicated course-data tables (Control / Course /
          // CourseControl / CourseMap) and Class.courseId assignments. Manually
          // managed Control.radio flags are preserved across reimports.
          const courseImportResult = await importCourseDataXml(
            eventId,
            xmlBuffer.toString('utf-8'),
          );
          logUploadEvent(c, 'info', 'IOF upload CourseData tables imported', {
            ...uploadDetails,
            success: false,
            stage: 'imported-course-data-tables',
            coursesImported: courseImportResult.coursesImported,
            controlsImported: courseImportResult.controlsImported,
            courseControlsImported: courseImportResult.courseControlsImported,
            classesAssigned: courseImportResult.classesAssigned,
            radioControlsPreserved: courseImportResult.radioControlsPreserved,
          });
        }
      }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload processing failed';
    logUploadEvent(c, 'error', 'IOF upload failed during processing', {
      ...uploadDetails,
      success: false,
      stage: 'processing',
      reason: message,
    });
    return c.json(error(message, 500), 500);
  }

  // Persist or update import state for each processed payload type
  await Promise.all(
    iofXmlType.map((type) =>
      upsertImportState(eventId, ImportSourceType.IOF_XML, {
        payloadType: type.jsonKey,
        rawHash,
        rootElement: type.jsonKey,
        ...iofRootMeta,
      }).catch((err) => {
        logUploadEvent(c, 'error', 'IOF upload failed to persist import state', {
          ...uploadDetails,
          success: true,
          stage: 'persist-import-state',
          payloadType: type.jsonKey,
          reason: err instanceof Error ? err.message : 'Unknown error',
        });
      }),
    ),
  );

  logUploadEvent(c, 'info', 'IOF upload completed', {
    ...uploadDetails,
    success: true,
    stage: 'completed',
    eventName,
  });

  return c.json(success('OK', { data: 'Iof xml uploaded successfully: ' + eventName }, 200), 200);
}

/**
 * Detects and decompresses gzip or zlib-compressed files when necessary.
 *
 * The function inspects the file buffer to identify gzip (magic bytes 0x1F, 0x8B)
 * or common zlib header patterns (0x78 followed by typical CMF/FLG values). It also
 * uses metadata hints such as MIME type and file extension to improve detection.
 *
 * If gzip is detected, the buffer is decompressed using `zlib.gunzipSync()`.
 * If zlib/deflate is detected, the buffer is decompressed using `zlib.inflateSync()`.
 * If no compression is recognized, the original buffer is returned unchanged.
 *
 * @param file - The file object containing buffer and optional metadata.
 * @param file.buffer - The file contents as a Buffer.
 * @param file.mimetype - Optional MIME type (e.g., 'application/gzip', 'application/zlib').
 * @param file.originalname - Optional original filename (e.g., 'data.xml.gz', 'payload.zlib').
 * @returns MaybeUnzipResult - Decompressed content metadata and payload.
 *
 * Throws when decompression fails due to corrupted or invalid compressed data.
 */

function maybeUnzip(file: UploadedFile): MaybeUnzipResult {
  const buf = file.buffer;
  if (!buf) {
    return {
      buffer: Buffer.alloc(0),
      compressionEnabled: true,
      compressedInput: false,
      compressionType: 'none',
      decompressionFailed: false,
    };
  }

  const mimetype = file.mimetype || '';
  const name = file.originalname || '';

  const looksGzip = buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;

  const looksZlib = buf.length > 2 && buf[0] === 0x78 && [0x01, 0x5e, 0x9c, 0xda].includes(buf[1]);
  // common CMF/FLG combinations for zlib headers

  const hintedGzip = /application\/(x-)?gzip/i.test(mimetype) || /\.gz$/i.test(name);

  const hintedZlib = /application\/zlib/i.test(mimetype) || /\.(zz|zlib)$/i.test(name);

  const hintedDeflate = /application\/deflate/i.test(mimetype);

  const compressedInput = looksGzip || hintedGzip || looksZlib || hintedZlib || hintedDeflate;

  try {
    if (looksGzip || hintedGzip) {
      return {
        buffer: zlib.gunzipSync(buf),
        compressionEnabled: true,
        compressedInput: true,
        compressionType: 'gzip',
        decompressionFailed: false,
      };
    }
    if (looksZlib || hintedZlib) {
      return {
        buffer: zlib.inflateSync(buf),
        compressionEnabled: true,
        compressedInput: true,
        compressionType: 'zlib',
        decompressionFailed: false,
      };
    }
    if (hintedDeflate) {
      return {
        buffer: zlib.inflateRawSync(buf),
        compressionEnabled: true,
        compressedInput: true,
        compressionType: 'deflate',
        decompressionFailed: false,
      };
    }
  } catch {
    return {
      buffer: buf,
      compressionEnabled: true,
      compressedInput,
      compressionType: compressedInput ? 'unknown' : 'none',
      decompressionFailed: true,
    };
  }

  return {
    buffer: buf,
    compressionEnabled: true,
    compressedInput: false,
    compressionType: 'none',
    decompressionFailed: false,
  };
}

/**
 * @swagger
 * /rest/v1/upload/iof:
 *  post:
 *    summary: Upload IOX XML 3
 *    description: |
 *      Upload a data file containing class specifications, start lists or result lists.
 *
 *      This endpoint accepts both plain XML files and compressed uploads. Decompression is handled automatically based on:
 *        - Magic bytes detected in the file buffer
 *        - File extension
 *        - MIME type information from the **Content-Type** header
 *          (e.g., `application/gzip`, `application/x-gzip`, `application/zlib`, `application/deflate`)
 *    parameters:
 *      - in: body
 *        name: eventId
 *        required: true
 *        description: String ID of the event to upload data for.
 *        schema:
 *          type: string
 *    responses:
 *      200:
 *        description: Iof XML uploaded successfully.
 *      422:
 *        description: Validation errors.
 *      500:
 *        description: Internal server error.
 */
export function registerUploadRoutes(router: AppOpenAPI) {
  // Verify user authentication
  //TODO: Restrucure the code for better readability
  router.use('*', requireAuth);

  router.post('/iof', async (c) => {
    const endpoint = '/rest/v1/upload/iof';
    const { body, file } = await parseMultipartPayload(c);
    const parsedBody = uploadIofBodySchema.safeParse(body);

    if (!parsedBody.success) {
      const issues = toValidationIssues(parsedBody.error.issues);
      logUploadEvent(c, 'warn', 'IOF upload request validation failed', {
        endpoint,
        ...getUploadFileMeta(file),
        compressionEnabled: true,
        compressedInput: false,
        compressionType: 'none',
        decompressionFailed: false,
        iofValidationEnabled: null,
        success: false,
        stage: 'request-validation',
        issues,
      });
      return c.json(validation(issues), 422);
    }

    return handleIofXmlUpload(c, {
      eventId: parsedBody.data.eventId,
      validateXml: parsedBody.data.validateXml,
      file,
    });
  });

  /**
   * @swagger
   * /rest/v1/upload/czech-ranking:
   *  post:
   *    summary: Upload CSV with Czech Ranking Data for the current month
   *    description: Upload data file containing ranking data for czech competition rules.
   *    parameters:
   *       - in: body
   *         name: file
   *         required: true
   *         description: CSV File downloaded from ORIS system.
   *         schema:
   *           type: file
   *    responses:
   *      200:
   *        description: Iof xml uploaded successfully
   *      422:
   *        description: Validation errors
   *      500:
   *        description: Internal server error
   */
  router.post('/czech-ranking', async (c) => {
    const endpoint = '/rest/v1/upload/czech-ranking';
    const { body, file } = await parseMultipartPayload(c);

    if (!file) {
      logUploadEvent(c, 'warn', 'Czech ranking upload failed: missing file', {
        endpoint,
        ...getUploadFileMeta(file),
        compressionEnabled: false,
        compressedInput: false,
        compressionType: 'none',
        decompressionFailed: false,
        iofValidationEnabled: false,
        success: false,
        stage: 'input',
      });
      return c.json(validation('No file uploaded', 422), 422);
    }

    const parsedBody = uploadCzechRankingBodySchema.safeParse(body);
    if (!parsedBody.success) {
      return c.json(validation(toValidationIssues(parsedBody.error.issues)), 422);
    }

    const validForMonth = normalizeCzechRankingMonthInput(parsedBody.data.validForMonth);
    if (!validForMonth) {
      return c.json(validation('Invalid validForMonth. Expected YYYY-MM', 422), 422);
    }

    const uploadDetails = {
      endpoint,
      rankingType: parsedBody.data.rankingType,
      rankingCategory: parsedBody.data.rankingCategory,
      validForMonth: parsedBody.data.validForMonth,
      ...getUploadFileMeta(file),
      compressionEnabled: false,
      compressedInput: false,
      compressionType: 'none',
      decompressionFailed: false,
      iofValidationEnabled: false,
    };

    logUploadEvent(c, 'info', 'Czech ranking upload received', {
      ...uploadDetails,
      success: false,
      stage: 'received',
    });

    if (file.size > 2000000) {
      logUploadEvent(c, 'warn', 'Czech ranking upload failed: file too large', {
        ...uploadDetails,
        success: false,
        stage: 'validation',
        fileSizeBytes: file.size,
        maxSizeBytes: 2000000,
      });
      return c.json(validation('File is too large. Allowed size is up to 2MB', 422), 422);
    }

    logUploadEvent(c, 'info', 'Czech ranking upload processing started', {
      ...uploadDetails,
      success: false,
      stage: 'processing-started',
    });

    try {
      const processedRankingData = await storeCzechRankingData({
        csvData: file.buffer.toString(),
        rankingType: parsedBody.data.rankingType,
        rankingCategory: parsedBody.data.rankingCategory,
        validForMonth,
      });
      logUploadEvent(c, 'info', 'Czech ranking upload completed', {
        ...uploadDetails,
        success: true,
        stage: 'completed',
        processedResult:
          typeof processedRankingData === 'string'
            ? processedRankingData
            : Array.isArray(processedRankingData)
              ? { processedItems: processedRankingData.length }
              : processedRankingData,
      });
      return c.json(
        success(
          'OK',
          {
            data: 'Csv ranking Czech data uploaded successfully: ' + processedRankingData,
          },
          200,
        ),
        200,
      );
    } catch (err: any) {
      logUploadEvent(c, 'error', 'Czech ranking upload failed during processing', {
        ...uploadDetails,
        success: false,
        stage: 'processing',
        reason: err?.message || 'Unexpected processing error',
      });
      return c.json(error(err.message, 500), 500);
    }
  });
}

export const parseXmlForTesting = {
  parseXml,
  checkXmlType,
  canUploadCourseData,
  upsertCompetitor,
  findExistingClass,
  getCompetitorKeys,
  detectCompetitorChanges,
  extractTeamExternalId,
  resolveExistingTeam,
  normalizeIncomingSplits,
  isSplitWriteConflict,
  loadSplitCache,
  processClassResults,
  processClassStarts,
};
