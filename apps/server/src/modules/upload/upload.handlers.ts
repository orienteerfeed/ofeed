import { DOMParser } from '@xmldom/xmldom';
import { z } from "@hono/zod-openapi";
import { Parser } from 'xml2js';
import { validateXML } from 'xmllint-wasm';
import zlib from 'zlib';
import { requireAuth } from '../../middlewares/require-jwt.js';
import { parseMultipartPayload, type MultipartFile } from '../../lib/http/body-parser.js';
import { toValidationIssues } from '../../lib/validation/zod.js';
import { ensureEventOwner, isAuthzError } from '../../utils/authz.js';
import type { AppBindings, AppOpenAPI } from "../../types";
import { Prisma } from "../../generated/prisma/client";
import { ResultStatus as ResultStatusEnum } from "../../generated/prisma/enums";
import type { ProtocolType, ResultStatus, Sex } from "../../generated/prisma/enums";

import prisma from '../../utils/context.js';
import { createShortCompetitorHash } from '../../utils/hashUtils.js';
import { normalizeValue } from '../../utils/normalize.js';
import { calculateCompetitorRankingPoints } from '../../utils/ranking.js';
import { error, success, validation } from '../../utils/responseApi.js';
import {
  publishUpdatedCompetitor,
  publishUpdatedCompetitors,
} from '../../utils/subscriptionUtils.js';
import { notifyWinnerChanges } from './../event/event.winner-cache.service.js';
import { storeCzechRankingData } from './upload.service.js';

const parser = new Parser({ attrkey: 'ATTR', trim: true });
const IOF_XML_SCHEMA =
  'https://raw.githubusercontent.com/international-orienteering-federation/datastandard-v3/master/IOF.xsd';

const uploadIofBodySchema = z.object({
  eventId: z.string().min(1),
  validateXml: z.boolean().optional(),
}).passthrough();

type UploadedFile = MultipartFile;
type UploadLogLevel = 'info' | 'warn' | 'error';
type CompressionType = 'none' | 'gzip' | 'zlib' | 'deflate' | 'unknown';
type UploadContext = {
  get: <K extends keyof AppBindings["Variables"]>(key: K) => AppBindings["Variables"][K];
  json: (body: unknown, status?: number) => Response;
};
type MaybeUnzipResult = {
  buffer: Buffer;
  compressionEnabled: boolean;
  compressedInput: boolean;
  compressionType: CompressionType;
  decompressionFailed: boolean;
};

type IofSourceId = {
  ATTR?: { type?: string };
  _?: string;
};

type IofPersonName = {
  Family?: string[];
  Given?: string[];
};

type IofPerson = {
  Id?: IofSourceId[];
  Name?: IofPersonName[];
  Nationality?: Array<{ ATTR?: { code?: string } }>;
};

type IofOrganisation = {
  Name?: string[];
  ShortName?: string[];
} | null;

type IofStart = {
  BibNumber?: string[];
  StartTime?: string[];
  ControlCard?: string[];
  Leg?: Array<string | number>;
};

type IofSplitTime = {
  ControlCode?: string[];
  Time?: string[];
};

type IofResult = {
  BibNumber?: string[];
  StartTime?: string[];
  FinishTime?: string[];
  Time?: string[];
  ControlCard?: string[];
  Status?: unknown;
  SplitTime?: IofSplitTime[];
  Leg?: Array<string | number>;
};

type TeamWithBib = {
  Name: string[];
  BibNumber?: string[];
};

type IofPayloadType = 'ResultList' | 'StartList' | 'CourseData';
type IofTypeMatch = { isArray: true; jsonKey: IofPayloadType; jsonValue: unknown };
const IOF_PAYLOAD_TYPES: readonly IofPayloadType[] = ['ResultList', 'StartList', 'CourseData'];
type UploadScopedLogger = Pick<AppBindings["Variables"]["logger"], "info" | "warn" | "error">;

function isIofPayloadType(value: string): value is IofPayloadType {
  return (IOF_PAYLOAD_TYPES as readonly string[]).includes(value);
}

const RESULT_STATUSES = new Set<ResultStatus>(Object.values(ResultStatusEnum));

const RESULT_STATUS_ALIASES: Record<string, ResultStatus> = {
  DNS: "DidNotStart",
  DNF: "DidNotFinish",
  DSQ: "Disqualified",
  MP: "MissingPunch",
  OT: "OverTime",
  NC: "NotCompeting",
  NENT: "DidNotEnter",
};

function normalizeStatusToken(value: string): string {
  return value.trim().replace(/[\s_-]+/g, "").toUpperCase();
}

function getIofTextValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = getIofTextValue(item);
      if (nested) {
        return nested;
      }
    }
    return undefined;
  }

  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const direct =
    getIofTextValue(record._) ??
    getIofTextValue(record.value) ??
    getIofTextValue(record["#text"]) ??
    getIofTextValue(record.text);
  if (direct) {
    return direct;
  }

  const attrCandidate = record.ATTR;
  if (attrCandidate && typeof attrCandidate === "object") {
    const attrs = attrCandidate as Record<string, unknown>;
    const fromAttrs =
      getIofTextValue(attrs.value) ??
      getIofTextValue(attrs.status) ??
      getIofTextValue(attrs.code);
    if (fromAttrs) {
      return fromAttrs;
    }
  }

  for (const entry of Object.values(record)) {
    const nested = getIofTextValue(entry);
    if (nested) {
      return nested;
    }
  }

  return undefined;
}

function toResultStatus(value: unknown, fallback: ResultStatus): ResultStatus {
  const rawStatus = getIofTextValue(value);
  if (!rawStatus) {
    return fallback;
  }

  if (RESULT_STATUSES.has(rawStatus as ResultStatus)) {
    return rawStatus as ResultStatus;
  }

  const normalized = normalizeStatusToken(rawStatus);
  for (const candidate of RESULT_STATUSES) {
    if (normalizeStatusToken(candidate) === normalized) {
      return candidate;
    }
  }

  return RESULT_STATUS_ALIASES[normalized] ?? fallback;
}

function toSex(value: string | undefined, fallback: Sex): Sex {
  if (value === "M" || value === "F" || value === "B") {
    return value;
  }

  return fallback;
}

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

// Utility functions
/**
 * Fetches the IOF XML schema.
 *
 * This function makes a GET request to the IOF_XML_SCHEMA URL using the Fetch API,
 * with a header of "Content-Type: application/xml". If the request is successful,
 * it returns the body of the response as text. If an error occurs, it logs an error
 * message to the console.
 *
 * Returns IOF XML schema content.
 */
async function fetchIOFXmlSchema(): Promise<string> {
  try {
    const response = await fetch(IOF_XML_SCHEMA, {
      method: 'get',
      headers: { 'Content-Type': 'application/xml' },
    });
    return await response.text();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Problem to load IOF XML schema: ', message);
    return '';
  }
}

/**
 * Retrieves the competitor key based on the provided class ID and person object.
 *
 * @param classId - The class ID associated with the competitor.
 * @param person - The person object containing identification and name details.
 * @param keyType - Key source priority (`registration` or `system`).
 * @returns Competitor key, either source ID or fallback hash.
 */
function getCompetitorKey(
  classId: number,
  person: IofPerson,
  keyType: 'registration' | 'system' = 'registration',
): string {
  try {
    // Ensure `person` and `person.Id` are valid
    if (!person || !Array.isArray(person.Id) || person.Id.length === 0) {
      console.warn('Invalid person data or missing IDs:', JSON.stringify(person, null, 2));
      return fallbackToNameHash(classId, person);
    }

    // Handle "registration" key type
    if (keyType === 'registration') {
      // Use the first valid ID with type "CZE" or any other ID if "CZE" is not available
      const id =
        person.Id.find(
          (sourceId: IofSourceId) =>
            sourceId.ATTR?.type === 'CZE' && sourceId._ && sourceId._.trim() !== ''
        )?._ || person.Id.find(sourceId => sourceId._ && sourceId._.trim() !== '')?._;

      if (id) return id; // Return ID if available
      console.warn('No valid registration ID found for person:', person);
      return fallbackToNameHash(classId, person);
    }

    // Handle "system" key type
    else if (keyType === 'system') {
      // Prioritize the ID with type "QuickEvent", fallback to other IDs
      const quickEventId = person.Id.find(sourceId => sourceId.ATTR?.type === 'QuickEvent');
      const orisId = person.Id.find(sourceId => sourceId.ATTR?.type === 'ORIS');
      const id = quickEventId?._ || orisId?._ || person.Id[0]?._; // Prioritize QuickEvent, then ORIS, then fallback to the first ID

      if (id) return id; // Return ID if available
      console.warn('No valid system ID found for person:', person);
      return fallbackToNameHash(classId, person);
    }

    // Handle unknown key types
    else {
      console.error(`Unknown keyType "${keyType}" provided.`);
      return fallbackToNameHash(classId, person);
    }
  } catch (error) {
    // Catch unexpected errors and log them
    console.error('Error in getCompetitorKey:', error);
    return fallbackToNameHash(classId, person);
  }
}

// Fallback function to generate a competitor hash using names
/**
 *
 * @param classId - The class ID associated with the competitor.
 * @param person - The person object containing identification and name details.
 * @returns Unique competitor ID.
 */
function fallbackToNameHash(classId: number, person: IofPerson): string {
  const familyName = person?.Name?.[0]?.Family?.[0] || '';
  const givenName = person?.Name?.[0]?.Given?.[0] || '';
  if (!familyName || !givenName) {
    console.warn('Missing family or given name for fallback hash generation:', person);
  }
  return createShortCompetitorHash(classId, familyName, givenName);
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
    return await parser.parseStringPromise(buffer.toString());
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

const validateIofXml = async (xmlString: string, xsdString: string): Promise<XmlValidationResult> => {
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
      returnState.message = returnState.errors.map(issue => issue.msg).join("; ");
      console.log(returnState.message);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown validation error';
    returnState.message = message;
    console.error('Problem to validate xml: ', message);
  }
  return returnState;
};

/**
 * Retrieves a list of classes for a given event.
 *
 * @param eventId - Event identifier.
 * @returns Class list with external identifiers.
 * @throws Error if database query fails.
 */
async function getClassLists(eventId: string): Promise<Array<{ id: number; externalId: string | null }>> {
  try {
    return await prisma.class.findMany({
      where: { eventId: eventId },
      select: { id: true, externalId: true },
    });
  } catch (err: unknown) {
    console.error(err);
    const message = err instanceof Error ? err.message : 'Unknown database error';
    throw new Error(`Database error: ${message}`);
  }
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
  classDetails: { Id?: string[]; Name: string[]; ATTR?: { sex?: string } },
  dbClassLists: Array<{ id: number; externalId: string | null }>,
  additionalData: Record<string, unknown> = {},
): Promise<number> {
  const sourceClassId = classDetails.Id?.shift();
  const className = classDetails.Name.shift() ?? sourceClassId ?? '';
  const classIdentifier = sourceClassId || className;
  const existingClass = dbClassLists.find(cls => cls.externalId === classIdentifier);

  // Determine sex based on the first letter of the class name
  const inferredSex: Sex = className.charAt(0) === 'H' ? 'M' : className.charAt(0) === 'D' ? 'F' : 'B';
  const classSex = toSex(classDetails.ATTR?.sex, inferredSex);

  if (!existingClass) {
    const dbClassInsert = await prisma.class.create({
      data: {
        eventId: eventId,
        externalId: classIdentifier,
        name: className,
        sex: classSex,
        ...additionalData, // Spread additional properties like length, climb, etc.
      },
    });
    return dbClassInsert.id;
  } else {
    await prisma.class.update({
      where: { id: existingClass.id },
      data: {
        name: className,
        sex: classSex,
        ...additionalData, // Update additional fields if present
      },
    });
    return existingClass.id;
  }
}

/**
 * Upserts a competitor in the database.
 *
 * This function checks if a competitor already exists in the database based on the provided
 * event ID, class ID, and person information. If the competitor exists, it updates the competitor's
 * information if there are any changes. If the competitor does not exist, it creates a new competitor
 * record in the database.
 *
 * @param eventId - Event identifier.
 * @param classId - Class database ID.
 * @param person - Competitor person details.
 * @param organisation - Competitor organisation details.
 * @param start - Optional start payload.
 * @param result - Optional result payload.
 * @param teamId - Optional team database ID.
 * @param leg - Optional relay leg.
 * @returns Competitor ID and whether record was changed.
 */
async function upsertCompetitor(
  eventId: string,
  classId: number,
  person: IofPerson,
  organisation: IofOrganisation,
  start: IofStart | null = null,
  result: IofResult | null = null,
  teamId: number | null = null,
  leg: string | number | null = null,
): Promise<{ id: number; updated: boolean }> {
  const registration = getCompetitorKey(classId, person, 'registration');
  const externalId = getCompetitorKey(classId, person, 'system');
  const dbCompetitorResponse = await prisma.competitor.findFirst({
    where: { class: { eventId: eventId }, externalId: externalId },
    select: {
      id: true,
      class: true,
      classId: true,
      firstname: true,
      lastname: true,
      nationality: true,
      registration: true,
      license: true,
      organisation: true,
      shortName: true,
      card: true,
      bibNumber: true,
      startTime: true,
      finishTime: true,
      time: true,
      status: true,
      lateStart: true,
      team: true,
      leg: true,
      note: true,
      externalId: true,
    },
  });

  const firstname = person.Name?.[0]?.Given?.[0] ?? dbCompetitorResponse?.firstname ?? '';
  const lastname = person.Name?.[0]?.Family?.[0] ?? dbCompetitorResponse?.lastname ?? '';
  const hasFinishTime = Boolean(result?.FinishTime?.[0]);
  const fallbackStatus: ResultStatus = hasFinishTime
    ? 'OK'
    : (dbCompetitorResponse?.status ?? 'Inactive');
  const normalizedStatus = toResultStatus(result?.Status, fallbackStatus);

  // Prepare new data, giving preference to already stored values for certain fields
  const competitorData = {
    class: { connect: { id: classId } },
    firstname,
    lastname,
    nationality: person.Nationality?.[0].ATTR.code,
    registration: registration,
    license: dbCompetitorResponse?.license || null,
    organisation: organisation?.Name?.[0],
    shortName: organisation?.ShortName?.[0],
    bibNumber: result?.BibNumber
      ? parseInt(result.BibNumber.shift())
      : start?.BibNumber
        ? (parseInt(start.BibNumber.shift()) ?? dbCompetitorResponse?.bibNumber)
        : null,
    startTime:
      (result?.StartTime?.shift() || start?.StartTime?.shift()) ??
      (dbCompetitorResponse?.startTime || null),
    finishTime: result?.FinishTime?.shift() ?? (dbCompetitorResponse?.finishTime || null),
    time: result?.Time ? parseInt(result.Time[0]) : (dbCompetitorResponse?.time ?? null),
    card: result?.ControlCard
      ? parseInt(result.ControlCard.shift())
      : start?.ControlCard
        ? parseInt(start.ControlCard.shift())
        : (dbCompetitorResponse?.card ?? null),
    status: normalizedStatus,
    lateStart: dbCompetitorResponse?.lateStart || false,
    team: teamId ? { connect: { id: teamId } } : undefined,
    leg: leg ? Number.parseInt(String(leg), 10) : undefined,
    externalId: externalId,
    note: dbCompetitorResponse?.note || null,
    updatedAt: new Date(),
  };

  if (!dbCompetitorResponse) {
    const dbCompetitorInsert = await prisma.competitor.create({
      data: competitorData,
    });
    try {
      await prisma.protocol.create({
        data: {
          eventId: eventId,
          competitorId: dbCompetitorInsert.id,
          origin: 'IT',
          type: 'competitor_create',
          previousValue: null,
          newValue: competitorData.lastname + ' ' + competitorData.firstname,
          authorId: 1,
        },
      });
    } catch (err) {
      console.error('Error creating protocol record:', err);
    }

    return { id: dbCompetitorInsert.id, updated: true };
  } else {
    // Compare existing data with new data (excluding preserved fields)
    const keysToCompare = [
      { key: 'classId', type: 'number' },
      { key: 'firstname', type: 'string' },
      { key: 'lastname', type: 'string' },
      { key: 'nationality', type: 'string' },
      { key: 'registration', type: 'string' },
      { key: 'organisation', type: 'string' },
      { key: 'shortName', type: 'string' },
      { key: 'bibNumber', type: 'number' },
      { key: 'startTime', type: 'date' },
      { key: 'finishTime', type: 'date' },
      { key: 'time', type: 'number' },
      { key: 'card', type: 'number' },
      { key: 'status', type: 'string' },
      { key: 'teamId', type: 'number' },
      { key: 'leg', type: 'number' },
    ];

    // Collect changes to be added to the protocol
    const changes: Array<{ type: ProtocolType; previousValue: string | null; newValue: string | null }> = [];

    // Define a mapping of competitorData keys to their corresponding protocol types
    const keyToTypeMap: Record<string, ProtocolType> = {
      classId: 'class_change',
      firstname: 'firstname_change',
      lastname: 'lastname_change',
      nationality: 'nationality_change',
      registration: 'registration_change',
      organisation: 'organisation_change',
      shortName: 'short_name_change',
      bibNumber: 'bibNumber_change',
      startTime: 'start_time_change',
      finishTime: 'finish_time_change',
      time: 'time_change',
      card: 'si_card_change',
      status: 'status_change',
      teamId: 'team_change',
      leg: 'leg_change',
    };

    // Check for differences and collect changes
    const isDifferent = keysToCompare.some(({ key, type }) => {
      const currentValue = normalizeValue(type, competitorData[key]);
      const previousValue = normalizeValue(type, dbCompetitorResponse[key]);
      const hasChanged = competitorData[key] !== undefined && currentValue !== previousValue;

      if (hasChanged && keyToTypeMap[key]) {
        changes.push({
          type: keyToTypeMap[key],
          previousValue: dbCompetitorResponse[key]?.toString() || null,
          newValue: competitorData[key]?.toString() || null,
        });
      }

      return hasChanged;
    });

    if (isDifferent) {
      // Update only if there is a difference
      await prisma.competitor.update({
        where: { id: dbCompetitorResponse.id },
        data: competitorData,
      });

      // Add records to protocol
      try {
        for (const change of changes) {
          await prisma.protocol.create({
            data: {
              eventId: eventId,
              competitorId: dbCompetitorResponse.id,
              origin: 'IT',
              type: change.type,
              previousValue: change.previousValue,
              newValue: change.newValue,
              authorId: 1,
            },
          });
        }
      } catch (err) {
        console.error('Failed to create protocol records:', err);
      }

      const updatedCompetitorData = {
        ...competitorData,
        id: dbCompetitorResponse.id,
      };
      await publishUpdatedCompetitor(eventId, updatedCompetitorData);
      return { id: dbCompetitorResponse.id, updated: true };
    }

    return { id: dbCompetitorResponse.id, updated: false };
  }
}

const splitWriteLocks = new Map<number, Promise<void>>();
const SPLIT_WRITE_CONFLICT_MAX_RETRIES = 6;
const SPLIT_WRITE_CONFLICT_RETRY_DELAY_MS = 75;
const SPLIT_WRITE_CONFLICT_RETRY_JITTER_MS = 50;
const SPLIT_WRITE_TRANSACTION_MAX_WAIT_MS = 10_000;
const SPLIT_WRITE_TRANSACTION_TIMEOUT_MS = 20_000;
const IOF_WRITE_CONCURRENCY = 8;

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

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

function isSplitWriteConflict(error: unknown): error is Error {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  return (
    message.includes("record has changed since last read in table 'split'") ||
    message.includes('record has changed since last read in table "split"') ||
    message.includes('write conflict') ||
    message.includes('deadlock') ||
    message.includes('unable to start a transaction in the given time') ||
    message.includes('transaction api error') ||
    message.includes('p2034')
  );
}

async function withSplitWriteLock<T>(
  competitorId: number,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = splitWriteLocks.get(competitorId) || Promise.resolve();
  let release: (() => void) | undefined;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const tail = previous.then(() => gate);
  splitWriteLocks.set(competitorId, tail);

  await previous;
  try {
    return await operation();
  } finally {
    release?.();
    if (splitWriteLocks.get(competitorId) === tail) {
      splitWriteLocks.delete(competitorId);
    }
  }
}

async function withSplitWriteConflictRetry<T>(
  competitorId: number,
  operation: () => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= SPLIT_WRITE_CONFLICT_MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!isSplitWriteConflict(error)) {
        throw error;
      }

      if (attempt === SPLIT_WRITE_CONFLICT_MAX_RETRIES) {
        console.error('Split write conflict retries exhausted', {
          competitorId,
          attempts: attempt,
          maxAttempts: SPLIT_WRITE_CONFLICT_MAX_RETRIES,
          reason: error.message,
        });
        throw error;
      }

      console.warn('Retrying split write after conflict', {
        competitorId,
        attempt,
        maxAttempts: SPLIT_WRITE_CONFLICT_MAX_RETRIES,
        reason: error.message,
      });
      const jitter = Math.floor(Math.random() * SPLIT_WRITE_CONFLICT_RETRY_JITTER_MS);
      await wait(SPLIT_WRITE_CONFLICT_RETRY_DELAY_MS * attempt + jitter);
    }
  }

  return operation();
}

type NormalizedSplit = {
  controlCode: number;
  time: number | null;
};

function normalizeIncomingSplits(result: IofResult): NormalizedSplit[] {
  const splitTimes = result?.SplitTime ?? [];
  const byControlCode = new Map<number, number | null>();

  for (const split of splitTimes) {
    const rawControlCode = split.ControlCode?.[0];
    const controlCode = rawControlCode ? Number.parseInt(rawControlCode, 10) : Number.NaN;
    if (!Number.isInteger(controlCode)) {
      continue;
    }

    const rawTime = split.Time?.[0];
    const time = rawTime ? Number.parseInt(rawTime, 10) : null;
    byControlCode.set(controlCode, Number.isInteger(time) ? time : null);
  }

  return [...byControlCode.entries()]
    .map(([controlCode, time]) => ({ controlCode, time }))
    .sort((a, b) => a.controlCode - b.controlCode);
}

async function upsertSplitsUnsafe(competitorId: number, result: IofResult) {
  const dbSplitResponse = await prisma.split.findMany({
    where: { competitorId: competitorId },
    select: {
      id: true,
      controlCode: true,
      time: true,
    },
    orderBy: { id: "asc" },
  });

  const incomingSplits = normalizeIncomingSplits(result);
  const incomingByControlCode = new Map<number, number | null>(
    incomingSplits.map(split => [split.controlCode, split.time]),
  );

  const existingByControlCode = new Map<number, { id: number; time: number | null }>();
  let duplicateExistingRows = 0;
  for (const split of dbSplitResponse) {
    if (existingByControlCode.has(split.controlCode)) {
      duplicateExistingRows += 1;
      continue;
    }

    existingByControlCode.set(split.controlCode, {
      id: split.id,
      time: split.time,
    });
  }

  let created = 0;
  let updated = 0;
  let deleted = duplicateExistingRows;

  for (const [controlCode, incomingTime] of incomingByControlCode) {
    const existing = existingByControlCode.get(controlCode);
    if (!existing) {
      created += 1;
      continue;
    }

    if (existing.time !== incomingTime) {
      updated += 1;
    }
  }

  for (const controlCode of existingByControlCode.keys()) {
    if (!incomingByControlCode.has(controlCode)) {
      deleted += 1;
    }
  }

  const changeMade = created > 0 || updated > 0 || deleted > 0;
  if (!changeMade) {
    return { created, updated, deleted, changeMade };
  }

  // Replace all competitor splits atomically to avoid interleaving create/update/delete conflicts.
  await prisma.$transaction(
    async tx => {
      await tx.split.deleteMany({
        where: { competitorId: competitorId },
      });

      if (incomingSplits.length > 0) {
        await tx.split.createMany({
          data: incomingSplits.map(split => ({
            competitorId: competitorId,
            controlCode: split.controlCode,
            time: split.time,
          })),
        });
      }
    },
    {
      maxWait: SPLIT_WRITE_TRANSACTION_MAX_WAIT_MS,
      timeout: SPLIT_WRITE_TRANSACTION_TIMEOUT_MS,
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    },
  );

  return {
    created,
    updated,
    deleted,
    changeMade,
  };
}

/**
 * Updates or inserts split times for a given competitor based on the provided result data.
 *
 * This function performs the following operations:
 * - Finds existing splits for the competitor in the database.
 * - Compares the incoming split times with the existing ones.
 * - Creates new splits for any incoming splits that do not exist in the database.
 * - Updates existing splits if their times differ from the incoming data.
 * - Deletes splits from the database that are not present in the incoming data.
 * - Retries on split write conflicts and serializes split writes per competitor.
 *
 * @async
 * @function upsertSplits
 * @param competitorId - Competitor database ID.
 * @param result - Result payload with split times.
 * @returns Summary of split mutations.
 */
async function upsertSplits(competitorId: number, result: IofResult) {
  return withSplitWriteLock(competitorId, () =>
    withSplitWriteConflictRetry(competitorId, () => upsertSplitsUnsafe(competitorId, result))
  );
}

/**
 * Upserts (inserts or updates) a team entry in the database.
 *
 * This function ensures that a team is either created or updated based on its
 * event class and bib number. It prevents duplicate entries while keeping team
 * details up to date. The organisation information is also included in the update.
 *
 * @param eventId - Event identifier.
 * @param classId - Class database ID.
 * @param teamResult - Team payload with name and bib number.
 * @param organisation - Organisation details.
 * @returns Team database ID.
 */
async function upsertTeam(
  eventId: string,
  classId: number,
  teamResult: TeamWithBib,
  organisation: IofOrganisation,
): Promise<number> {
  // Extract team details from the input object
  const teamName = teamResult.Name.shift() ?? '';
  const bibNumber = teamResult.BibNumber
    ? Number.parseInt(teamResult.BibNumber.shift() ?? '', 10) || null
    : null;

  // Check if the team already exists in the database based on event class and bib number
  const dbRelayResponse = await prisma.team.findFirst({
    where: {
      class: { eventId: eventId }, // Match the team within the correct event class
      bibNumber: bibNumber, // Ensure bib number is the same
    },
    select: { id: true }, // Select only the team ID to optimize query performance
  });

  if (!dbRelayResponse) {
    // If team does not exist, insert a new team entry
    const dbRelayInsert = await prisma.team.create({
      data: {
        class: { connect: { id: classId } }, // Link team to the correct class
        name: teamName, // Set team name
        organisation: organisation?.Name?.[0] || null, // Set organisation name if available
        shortName: organisation?.ShortName?.[0] || null, // Set short name if available
        bibNumber: bibNumber, // Set bib number
      },
    });

    return dbRelayInsert.id; // Return the newly created team ID
  } else {
    // If team exists, update its details to keep them up to date
    const teamId = dbRelayResponse.id;
    await prisma.team.update({
      where: { id: teamId }, // Update the existing team entry
      data: {
        class: { connect: { id: classId } }, // Ensure it stays connected to the correct class
        name: teamName, // Update team name if changed
        organisation: organisation?.Name?.[0] || null, // Update organisation name if changed
        shortName: organisation?.ShortName?.[0] || null, // Update short name if changed
        bibNumber: bibNumber, // Update bib number if changed
      },
    });

    return teamId; // Return the existing team ID
  }
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
  dbClassLists: Array<{ id: number; externalId: string | null }>,
  dbResponseEvent: { relay?: boolean },
): Promise<void> {
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
        length = classStart.Course[0].Length ? parseInt(classStart.Course[0].Length) : null;
        climb = classStart.Course[0].Climb ? parseInt(classStart.Course[0].Climb) : null;
        controlsCount = classStart.Course[0].NumberOfControls
          ? parseInt(classStart.Course[0].NumberOfControls)
          : null;
      }
      if (classStart.StartName) startName = classStart.StartName[0];

      const additionalData = {
        length: length,
        climb: climb,
        startName: startName,
        controlsCount: controlsCount,
      };

      const classId = await upsertClass(eventId, classDetails, dbClassLists, additionalData);

      if (!dbResponseEvent.relay) {
        // Process Individual Starts
        if (!classStart.PersonStart || classStart.PersonStart.length === 0) return;
        await forEachWithConcurrency(
          classStart.PersonStart as Array<Record<string, any>>,
          IOF_WRITE_CONCURRENCY,
          async (competitorStart: Record<string, any>) => {
            const person = competitorStart.Person.shift();
            const organisation = competitorStart.Organisation.shift();
            const start = competitorStart.Start.shift();
            await upsertCompetitor(eventId, classId, person, organisation, start, null);
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
              : null; // Organisation details

            const teamId = await upsertTeam(
              eventId,
              classId,
              teamStart as TeamWithBib,
              organisation
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

                  await upsertCompetitor(
                    eventId,
                    classId,
                    person,
                    organisation,
                    start,
                    null,
                    teamId,
                    leg
                  );
                },
              );
            }
          },
        );
      }
    },
  );
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
  dbClassLists: Array<{ id: number; externalId: string | null }>,
  dbResponseEvent: { relay?: boolean; ranking?: boolean },
): Promise<number[]> {
  const updatedClasses = new Set<number>(); // Unique class IDs that had changes
  await forEachWithConcurrency(
    classResults,
    IOF_WRITE_CONCURRENCY,
    async (classResult: Record<string, any>) => {
      const classDetails = classResult.Class.shift();
      const classId = await upsertClass(eventId, classDetails, dbClassLists);

      if (!dbResponseEvent.relay) {
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
              result
            );
            const { changeMade: updatedSplits } = await upsertSplits(competitorId, result);
            if (updated || updatedSplits) updatedClasses.add(classId);
          },
        );
        if (dbResponseEvent.ranking) {
          const rankingCalculation = calculateCompetitorRankingPoints(eventId);
          if (!rankingCalculation) {
            console.log('Ranking points cannot be calculated');
          }
        }
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
              organisation
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

                    const { id: competitorId, updated } = await upsertCompetitor(
                      eventId,
                      classId,
                      person,
                      organisation,
                      null,
                      result,
                      teamId,
                      leg
                    );
                    const { changeMade: updatedSplits } = await upsertSplits(competitorId, result);
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
  {
    eventId,
    validateXml,
    file,
  }: { eventId: string; validateXml?: boolean; file?: UploadedFile },
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
    const xsd = await fetchIOFXmlSchema();
    const iofXmlValidation = await validateIofXml(xmlBuffer.toString(), xsd);
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
  try {
    const ownership = await ensureEventOwner(prisma, c.get("authContext"), eventId, {
      select: { relay: true, ranking: true },
      eventNotFoundStatus: 404,
      eventNotFoundMessage: 'Event not found',
      forbiddenStatus: 403,
      forbiddenMessage: 'You are not authorized to upload data for this event',
    });

    dbResponseEvent = ownership.event;
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
  logUploadEvent(c, 'info', 'IOF upload XML parsed', {
    ...uploadDetails,
    success: false,
    stage: 'xml-parsed',
    detectedTypes: iofXmlType.map(type => type.jsonKey),
    detectedTypeCount: iofXmlType.length,
  });

  if (iofXmlType.length === 0) {
    logUploadEvent(c, 'warn', 'IOF upload parsed XML without supported IOF sections', {
      ...uploadDetails,
      success: false,
      stage: 'xml-type-detection',
    });
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
      iofXmlType.map(async type => {
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
              dbResponseEvent
            );
            notifyWinnerChanges(eventId);
            logUploadEvent(c, 'info', 'IOF upload ResultList processed', {
              ...uploadDetails,
              success: false,
              stage: 'processed-result-list',
              classResultCount: classResults.length,
              updatedClassCount: updatedClasses.length,
            });
            for (const classId of updatedClasses) {
              try {
                await publishUpdatedCompetitors(classId); // Process sequentially
              } catch (err) {
                logUploadEvent(c, 'error', 'IOF upload failed while publishing updated competitors', {
                  ...uploadDetails,
                  success: false,
                  stage: 'publish-updated-competitors',
                  classId,
                  reason: err instanceof Error ? err.message : 'Publish failed',
                });
              }
            }
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
            await processClassStarts(eventId, classStarts, dbClassLists, dbResponseEvent);
            logUploadEvent(c, 'info', 'IOF upload StartList processed', {
              ...uploadDetails,
              success: false,
              stage: 'processed-start-list',
              classStartCount: classStarts.length,
            });
          }
        } else if (type.jsonKey === 'CourseData') {
          // Process CourseData
          let dbClassLists;
          try {
            dbClassLists = await prisma.class.findMany({
              where: { eventId: eventId },
              select: {
                id: true,
                name: true,
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
            courseData.map(async course => {
              const classDetails = {
                Name: [course.Name[0]],
                Id: [],
                ATTR: {},
              };
              const additionalData = {
                length: course.Length && parseInt(course.Length[0]),
                climb: course.Climb && parseInt(course.Climb[0]),
                controlsCount: course.CourseControl && course.CourseControl.length - 2,
              };

              await upsertClass(eventId, classDetails, dbClassLists, additionalData);
            })
          );
          logUploadEvent(c, 'info', 'IOF upload CourseData processed', {
            ...uploadDetails,
            success: false,
            stage: 'processed-course-data',
            courseCount: Array.isArray(courseData) ? courseData.length : 0,
          });
        }
      })
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

  logUploadEvent(c, 'info', 'IOF upload completed', {
    ...uploadDetails,
    success: true,
    stage: 'completed',
    eventName,
  });

  return c.json(
    success('OK', { data: 'Iof xml uploaded successfully: ' + eventName }, 200),
    200,
  );
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
  router.use("*", requireAuth);

  router.post("/iof", async c => {
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
  router.post("/czech-ranking", async c => {
    const endpoint = '/rest/v1/upload/czech-ranking';
    const { file } = await parseMultipartPayload(c);

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

    const uploadDetails = {
      endpoint,
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
      const processedRankingData = await storeCzechRankingData(file.buffer.toString());
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
          200
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
  fetchIOFXmlSchema,
  upsertCompetitor,
};
