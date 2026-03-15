import { Parser, processors } from "xml2js";
import { Prisma } from "../../generated/prisma/client";
import type { ResultStatus } from "../../generated/prisma/enums";
import prisma from "../../utils/context.js";
import { createShortCompetitorHash } from "../../utils/hashUtils.js";

const { stripPrefix } = processors;

const parser = new Parser({
  explicitArray: false,
  trim: true,
  tagNameProcessors: [stripPrefix],
});

const MEOS_CLASS_EXTERNAL_PREFIX = "meos:class:";
const MEOS_COMPETITOR_EXTERNAL_PREFIX = "meos:cmp:";

const FINISHED_STATUSES = new Set<ResultStatus>([
  "OK",
  "Finished",
  "MissingPunch",
  "Disqualified",
  "DidNotFinish",
  "OverTime",
  "SportingWithdrawal",
]);

export type MopStatusCode =
  | "OK"
  | "BADCMP"
  | "BADPWD"
  | "NOZIP"
  | "BADXML"
  | "BADDATA"
  | "SERVERERR";

type MopRootName = "MOPComplete" | "MOPDiff";

type MopObject = Record<string, unknown> & { $?: Record<string, unknown>; _?: unknown };

type ExistingCompetitor = {
  id: number;
  externalId: string | null;
  firstname: string;
  lastname: string;
  classId: number;
  status: ResultStatus;
  time: number | null;
  startTime: Date | null;
  finishTime: Date | null;
  card: number | null;
  bibNumber: number | null;
  nationality: string | null;
  organisation: string | null;
};

type ExistingTeam = {
  id: number;
  classId: number;
  bibNumber: number;
  name: string;
  organisation: string | null;
  shortName: string | null;
};

type TeamAssignment = {
  meosCompetitorId: number;
  teamId: number;
  leg: number | null;
};

export class MopProcessingError extends Error {
  readonly status: MopStatusCode;

  constructor(status: MopStatusCode, message: string) {
    super(message);
    this.name = "MopProcessingError";
    this.status = status;
  }
}

function normalizeTagName(name: string) {
  const parts = name.split(":");
  return parts[parts.length - 1] ?? name;
}

function asObject(value: unknown): MopObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as MopObject;
}

function getAttributes(value: unknown): Record<string, string> {
  const node = asObject(value);
  if (!node?.$ || typeof node.$ !== "object") {
    return {};
  }

  const attrs = node.$ as Record<string, unknown>;
  const out: Record<string, string> = {};

  for (const [key, attrValue] of Object.entries(attrs)) {
    if (typeof attrValue === "string") {
      out[key] = attrValue;
      continue;
    }

    if (typeof attrValue === "number" || typeof attrValue === "boolean") {
      out[key] = String(attrValue);
    }
  }

  return out;
}

function getText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const text = getText(entry);
      if (text) {
        return text;
      }
    }
    return "";
  }

  const node = value as Record<string, unknown>;
  return getText(node._);
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

function parseInteger(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed)) {
    return undefined;
  }

  return parsed;
}

function parseTenthsToSeconds(value: string | undefined): number | undefined {
  const parsed = parseInteger(value);
  if (parsed === undefined) {
    return undefined;
  }

  return Math.trunc(parsed / 10);
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") {
    return true;
  }

  if (normalized === "false" || normalized === "0") {
    return false;
  }

  return undefined;
}

function classExternalId(meosClassId: number) {
  return `${MEOS_CLASS_EXTERNAL_PREFIX}${meosClassId}`;
}

function competitorExternalId(meosCompetitorId: number) {
  return `${MEOS_COMPETITOR_EXTERNAL_PREFIX}${meosCompetitorId}`;
}

function splitCompetitorName(
  rawName: string,
  fallbackFirstname?: string,
  fallbackLastname?: string,
) {
  const trimmedName = rawName.trim();

  if (!trimmedName) {
    return {
      firstname: fallbackFirstname ?? "Unknown",
      lastname: fallbackLastname ?? "Competitor",
    };
  }

  if (trimmedName.includes(",")) {
    const [lastnamePart, firstnamePart] = trimmedName.split(",", 2);
    const firstname = firstnamePart?.trim() || fallbackFirstname || "Unknown";
    const lastname = lastnamePart?.trim() || fallbackLastname || "Competitor";
    return { firstname, lastname };
  }

  const parts = trimmedName.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return {
      firstname: parts[0] ?? fallbackFirstname ?? "Unknown",
      lastname: fallbackLastname ?? parts[0] ?? "Competitor",
    };
  }

  const lastname = parts.pop() ?? fallbackLastname ?? "Competitor";
  const firstname = parts.join(" ") || fallbackFirstname || "Unknown";
  return { firstname, lastname };
}

function normalizeNationality(value: string | undefined, fallback: string | null) {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toUpperCase();
  if (!normalized) {
    return fallback;
  }

  return normalized.slice(0, 3);
}

function statusFromMeos(
  statusCode: number | undefined,
  competing: boolean | undefined,
  fallback: ResultStatus,
): ResultStatus {
  if (competing === true) {
    return "Active";
  }

  switch (statusCode) {
    case 0:
      return "Active";
    case 1:
      return "OK";
    case 3:
      return "MissingPunch";
    case 4:
      return "DidNotFinish";
    case 5:
      return "Disqualified";
    case 6:
      return "OverTime";
    case 20:
      return "DidNotStart";
    case 21:
      return "Cancelled";
    case 99:
      return "NotCompeting";
    default:
      if (competing === false) {
        return "Inactive";
      }
      return fallback;
  }
}

function buildDateFromMidnight(eventDate: Date, secondsSinceMidnight: number): Date {
  const year = eventDate.getUTCFullYear();
  const month = eventDate.getUTCMonth();
  const day = eventDate.getUTCDate();

  return new Date(Date.UTC(year, month, day, 0, 0, 0) + (secondsSinceMidnight * 1000));
}

function shouldClearFinishTime(status: ResultStatus) {
  return !FINISHED_STATUSES.has(status);
}

function parseRadioSplits(radioValue: unknown): Array<{ controlCode: number; time: number | null }> {
  const raw = getText(radioValue);
  if (!raw) {
    return [];
  }

  const entries = raw
    .split(";")
    .map(item => item.trim())
    .filter(Boolean);

  const splits: Array<{ controlCode: number; time: number | null }> = [];

  for (const entry of entries) {
    const [controlPart, timePart] = entry.split(",", 2);
    const controlCode = parseInteger(controlPart?.trim());
    if (controlCode === undefined) {
      continue;
    }

    const timeTenths = parseInteger(timePart?.trim());
    const time = timeTenths === undefined ? null : Math.trunc(timeTenths / 10);
    splits.push({ controlCode, time });
  }

  return splits;
}

function parseTeamAssignments(value: unknown) {
  const raw = getText(value);
  if (!raw) {
    return [] as Array<{ meosCompetitorId: number; leg: number | null }>;
  }

  const legs = raw
    .split(";")
    .map(item => item.trim())
    .filter(Boolean);

  const assignments: Array<{ meosCompetitorId: number; leg: number | null }> = [];

  for (let legIndex = 0; legIndex < legs.length; legIndex += 1) {
    const leg = legs[legIndex];
    if (!leg) {
      continue;
    }

    const competitorIds = leg
      .split(",")
      .map(item => item.trim())
      .filter(Boolean);

    for (const competitorIdRaw of competitorIds) {
      const meosCompetitorId = parsePositiveInteger(competitorIdRaw);
      if (!meosCompetitorId) {
        continue;
      }

      assignments.push({
        meosCompetitorId,
        leg: legIndex + 1,
      });
    }
  }

  return assignments;
}

async function clearManagedMeosData(eventId: string) {
  const meosClasses = await prisma.class.findMany({
    where: {
      eventId,
      externalId: { startsWith: MEOS_CLASS_EXTERNAL_PREFIX },
    },
    select: { id: true },
  });

  const classIds = meosClasses.map(item => item.id);
  if (classIds.length === 0) {
    return;
  }

  const competitors = await prisma.competitor.findMany({
    where: { classId: { in: classIds } },
    select: { id: true },
  });

  const competitorIds = competitors.map(item => item.id);

  if (competitorIds.length > 0) {
    await prisma.protocol.deleteMany({
      where: { competitorId: { in: competitorIds } },
    });
    await prisma.split.deleteMany({
      where: { competitorId: { in: competitorIds } },
    });
    await prisma.competitor.deleteMany({
      where: { id: { in: competitorIds } },
    });
  }

  await prisma.team.deleteMany({
    where: { classId: { in: classIds } },
  });

  await prisma.class.deleteMany({
    where: { id: { in: classIds } },
  });
}

async function resolveClassId(
  eventId: string,
  meosClassId: number,
  classIdCache: Map<number, number>,
  classExternalCache: Map<string, { id: number }>,
) {
  const cachedId = classIdCache.get(meosClassId);
  if (cachedId) {
    return cachedId;
  }

  const externalId = classExternalId(meosClassId);
  const existing = classExternalCache.get(externalId);

  if (existing) {
    classIdCache.set(meosClassId, existing.id);
    return existing.id;
  }

  const createdClass = await prisma.class.create({
    data: {
      eventId,
      name: `Class ${meosClassId}`,
      externalId,
    },
    select: { id: true },
  });

  classExternalCache.set(externalId, { id: createdClass.id });
  classIdCache.set(meosClassId, createdClass.id);
  return createdClass.id;
}

export async function ensureEventMeosMap(eventId: string) {
  const existing = await prisma.eventMeosMap.findUnique({
    where: { eventId },
    select: { competitionId: true },
  });

  if (existing) {
    return existing.competitionId;
  }

  try {
    const created = await prisma.eventMeosMap.create({
      data: { eventId },
      select: { competitionId: true },
    });
    return created.competitionId;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === "P2002"
    ) {
      const retry = await prisma.eventMeosMap.findUnique({
        where: { eventId },
        select: { competitionId: true },
      });

      if (retry) {
        return retry.competitionId;
      }
    }

    throw error;
  }
}

export async function getEventIdFromMeosCompetitionId(competitionId: number) {
  const mapping = await prisma.eventMeosMap.findUnique({
    where: { competitionId },
    select: { eventId: true },
  });

  return mapping?.eventId ?? null;
}

export async function parseMopXml(xmlPayload: string): Promise<{ rootName: MopRootName; root: MopObject }> {
  const parsed = await parser.parseStringPromise(xmlPayload);
  const parsedRecord = asObject(parsed);

  if (!parsedRecord) {
    throw new MopProcessingError("BADXML", "Unable to parse MOP XML body.");
  }

  let rootName: MopRootName | null = null;
  let rootNode: unknown;

  for (const [key, value] of Object.entries(parsedRecord)) {
    const normalized = normalizeTagName(key);
    if (normalized === "MOPComplete" || normalized === "MOPDiff") {
      rootName = normalized;
      rootNode = value;
      break;
    }
  }

  if (!rootName) {
    throw new MopProcessingError("BADDATA", "Unsupported MOP root element.");
  }

  const root = asObject(rootNode);
  if (!root) {
    throw new MopProcessingError("BADDATA", "MOP payload has invalid shape.");
  }

  return { rootName, root };
}

export async function processMeosMopPayload(eventId: string, xmlPayload: string) {
  const trimmedPayload = xmlPayload.trim();
  if (!trimmedPayload) {
    throw new MopProcessingError("BADXML", "Payload is empty.");
  }

  if (trimmedPayload.startsWith("PK")) {
    throw new MopProcessingError("NOZIP", "ZIP payloads are not supported.");
  }

  let rootName: MopRootName;
  let root: MopObject;

  try {
    const parsed = await parseMopXml(trimmedPayload);
    rootName = parsed.rootName;
    root = parsed.root;
  } catch (error) {
    if (error instanceof MopProcessingError) {
      throw error;
    }
    throw new MopProcessingError("BADXML", "Invalid XML payload.");
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, date: true },
  });

  if (!event) {
    throw new MopProcessingError("BADCMP", "Mapped event does not exist.");
  }

  if (rootName === "MOPComplete") {
    await clearManagedMeosData(eventId);
  }

  const classIdCache = new Map<number, number>();
  const classExternalCache = new Map<string, { id: number }>();

  const existingMeosClasses = await prisma.class.findMany({
    where: {
      eventId,
      externalId: { startsWith: MEOS_CLASS_EXTERNAL_PREFIX },
    },
    select: { id: true, externalId: true },
  });

  for (const classRow of existingMeosClasses) {
    if (!classRow.externalId) {
      continue;
    }
    classExternalCache.set(classRow.externalId, { id: classRow.id });
  }

  const organizationMap = new Map<number, string>();
  const orgNodes = toArray(root.org as MopObject | MopObject[] | undefined);
  for (const orgNode of orgNodes) {
    const attributes = getAttributes(orgNode);
    const orgId = parsePositiveInteger(attributes.id);
    if (!orgId) {
      continue;
    }

    if (parseBoolean(attributes.delete) === true) {
      organizationMap.delete(orgId);
      continue;
    }

    const name = getText(orgNode).trim();
    if (!name) {
      continue;
    }

    organizationMap.set(orgId, name);
  }

  const classNodes = toArray(root.cls as MopObject | MopObject[] | undefined);
  for (const classNode of classNodes) {
    const attributes = getAttributes(classNode);
    const meosClassId = parsePositiveInteger(attributes.id);
    if (!meosClassId) {
      continue;
    }

    const name = getText(classNode) || `Class ${meosClassId}`;
    const externalId = classExternalId(meosClassId);
    const existingClass = classExternalCache.get(externalId);

    if (existingClass) {
      await prisma.class.update({
        where: { id: existingClass.id },
        data: { name },
      });
      classIdCache.set(meosClassId, existingClass.id);
      continue;
    }

    const createdClass = await prisma.class.create({
      data: {
        eventId,
        name,
        externalId,
      },
      select: { id: true },
    });

    classExternalCache.set(externalId, { id: createdClass.id });
    classIdCache.set(meosClassId, createdClass.id);
  }

  const existingCompetitors = await prisma.competitor.findMany({
    where: {
      class: { eventId },
      externalId: { startsWith: MEOS_COMPETITOR_EXTERNAL_PREFIX },
    },
    select: {
      id: true,
      externalId: true,
      firstname: true,
      lastname: true,
      classId: true,
      status: true,
      time: true,
      startTime: true,
      finishTime: true,
      card: true,
      bibNumber: true,
      nationality: true,
      organisation: true,
    },
  });

  const competitorMap = new Map<string, ExistingCompetitor>();
  for (const competitor of existingCompetitors) {
    if (!competitor.externalId) {
      continue;
    }
    competitorMap.set(competitor.externalId, competitor);
  }

  const cmpNodes = toArray(root.cmp as MopObject | MopObject[] | undefined);

  for (const cmpNode of cmpNodes) {
    const cmpAttributes = getAttributes(cmpNode);
    const meosCompetitorId = parsePositiveInteger(cmpAttributes.id);
    if (!meosCompetitorId) {
      continue;
    }

    const externalId = competitorExternalId(meosCompetitorId);
    const existingCompetitor = competitorMap.get(externalId);
    const isDelete = parseBoolean(cmpAttributes.delete) === true;

    if (isDelete) {
      if (!existingCompetitor) {
        continue;
      }

      await prisma.protocol.deleteMany({
        where: { competitorId: existingCompetitor.id },
      });

      await prisma.split.deleteMany({
        where: { competitorId: existingCompetitor.id },
      });

      await prisma.competitor.delete({
        where: { id: existingCompetitor.id },
      });

      competitorMap.delete(externalId);
      continue;
    }

    const baseNode = asObject(cmpNode)?.base;
    const baseAttributes = getAttributes(baseNode);

    const meosClassId = parsePositiveInteger(baseAttributes.cls);
    const classId = meosClassId
      ? await resolveClassId(eventId, meosClassId, classIdCache, classExternalCache)
      : existingCompetitor?.classId;

    if (!classId) {
      continue;
    }

    const fullName = getText(baseNode);
    const nameParts = splitCompetitorName(fullName, existingCompetitor?.firstname, existingCompetitor?.lastname);

    const orgId = parsePositiveInteger(baseAttributes.org);
    const organisation = orgId
      ? (organizationMap.get(orgId) ?? existingCompetitor?.organisation ?? null)
      : (existingCompetitor?.organisation ?? null);

    const nationality = normalizeNationality(baseAttributes.nat, existingCompetitor?.nationality ?? null);

    const statusCode = parseInteger(baseAttributes.stat);
    const competing = parseBoolean(cmpAttributes.competing);
    const status = statusFromMeos(statusCode, competing, existingCompetitor?.status ?? "Inactive");

    const time = baseAttributes.rt !== undefined
      ? parseTenthsToSeconds(baseAttributes.rt) ?? null
      : (existingCompetitor?.time ?? null);

    const startTime = baseAttributes.st !== undefined
      ? (() => {
          const startSeconds = parseTenthsToSeconds(baseAttributes.st);
          if (startSeconds === undefined) {
            return existingCompetitor?.startTime ?? null;
          }
          return buildDateFromMidnight(event.date, startSeconds);
        })()
      : (existingCompetitor?.startTime ?? null);

    const finishTime = shouldClearFinishTime(status)
      ? null
      : (() => {
          if (startTime && typeof time === "number") {
            return new Date(startTime.getTime() + (time * 1000));
          }
          return existingCompetitor?.finishTime ?? null;
        })();

    const bibNumber = baseAttributes.bib !== undefined
      ? (parseInteger(baseAttributes.bib) ?? null)
      : (existingCompetitor?.bibNumber ?? null);

    const card = cmpAttributes.card !== undefined
      ? (() => {
          const parsedCard = parseInteger(cmpAttributes.card);
          if (parsedCard === undefined || parsedCard <= 0) {
            return null;
          }
          return parsedCard;
        })()
      : (existingCompetitor?.card ?? null);

    let competitorId = existingCompetitor?.id;

    if (competitorId) {
      await prisma.competitor.update({
        where: { id: competitorId },
        data: {
          classId,
          firstname: nameParts.firstname,
          lastname: nameParts.lastname,
          organisation,
          nationality,
          status,
          time,
          startTime,
          finishTime,
          bibNumber,
          card,
          externalId,
        },
      });
    } else {
      const created = await prisma.competitor.create({
        data: {
          classId,
          firstname: nameParts.firstname,
          lastname: nameParts.lastname,
          registration: createShortCompetitorHash(classId, nameParts.lastname, nameParts.firstname),
          organisation,
          nationality,
          status,
          time,
          startTime,
          finishTime,
          bibNumber,
          card,
          externalId,
        },
        select: {
          id: true,
        },
      });
      competitorId = created.id;
    }

    if (!competitorId) {
      continue;
    }

    competitorMap.set(externalId, {
      id: competitorId,
      externalId,
      firstname: nameParts.firstname,
      lastname: nameParts.lastname,
      classId,
      status,
      time,
      startTime,
      finishTime,
      card,
      bibNumber,
      nationality,
      organisation,
    });

    const hasRadioNode = Object.prototype.hasOwnProperty.call(asObject(cmpNode) ?? {}, "radio");
    if (!hasRadioNode) {
      continue;
    }

    const splits = parseRadioSplits(asObject(cmpNode)?.radio);
    await prisma.split.deleteMany({
      where: { competitorId },
    });

    if (splits.length > 0) {
      await prisma.split.createMany({
        data: splits.map(split => ({
          competitorId,
          controlCode: split.controlCode,
          time: split.time,
        })),
      });
    }
  }

  const existingTeams = await prisma.team.findMany({
    where: {
      class: { eventId },
    },
    select: {
      id: true,
      classId: true,
      bibNumber: true,
      name: true,
      organisation: true,
      shortName: true,
    },
  });

  const teamByKey = new Map<string, ExistingTeam>();
  for (const team of existingTeams) {
    teamByKey.set(`${team.classId}:${team.bibNumber}`, team);
  }

  const assignments: TeamAssignment[] = [];
  const teamNodes = toArray(root.tm as MopObject | MopObject[] | undefined);
  for (const teamNode of teamNodes) {
    const teamAttributes = getAttributes(teamNode);
    const meosTeamId = parsePositiveInteger(teamAttributes.id);
    if (!meosTeamId) {
      continue;
    }

    const baseNode = asObject(teamNode)?.base;
    const baseAttributes = getAttributes(baseNode);
    const meosClassId = parsePositiveInteger(baseAttributes.cls);
    if (!meosClassId) {
      continue;
    }

    const classId = await resolveClassId(eventId, meosClassId, classIdCache, classExternalCache);
    const bibNumber = parsePositiveInteger(baseAttributes.bib) ?? meosTeamId;
    const teamKey = `${classId}:${bibNumber}`;
    const existingTeam = teamByKey.get(teamKey);

    if (parseBoolean(teamAttributes.delete) === true) {
      if (existingTeam) {
        await prisma.competitor.updateMany({
          where: { teamId: existingTeam.id },
          data: {
            teamId: null,
            leg: null,
          },
        });

        await prisma.team.delete({
          where: { id: existingTeam.id },
        });

        teamByKey.delete(teamKey);
      }

      continue;
    }

    const teamName = getText(baseNode) || existingTeam?.name || `Team ${meosTeamId}`;
    const orgId = parsePositiveInteger(baseAttributes.org);
    const teamOrganisation = orgId
      ? (organizationMap.get(orgId) ?? existingTeam?.organisation ?? null)
      : (existingTeam?.organisation ?? null);
    const shortName = teamName.slice(0, 10);

    let teamId = existingTeam?.id;
    if (teamId) {
      await prisma.team.update({
        where: { id: teamId },
        data: {
          name: teamName,
          organisation: teamOrganisation,
          shortName,
        },
      });
    } else {
      const createdTeam = await prisma.team.create({
        data: {
          classId,
          name: teamName,
          organisation: teamOrganisation,
          shortName,
          bibNumber,
        },
        select: { id: true },
      });
      teamId = createdTeam.id;
    }

    if (!teamId) {
      continue;
    }

    teamByKey.set(teamKey, {
      id: teamId,
      classId,
      bibNumber,
      name: teamName,
      organisation: teamOrganisation,
      shortName,
    });

    const members = parseTeamAssignments(asObject(teamNode)?.r);
    for (const member of members) {
      assignments.push({
        meosCompetitorId: member.meosCompetitorId,
        teamId,
        leg: member.leg,
      });
    }
  }

  for (const assignment of assignments) {
    const extId = competitorExternalId(assignment.meosCompetitorId);
    const competitor = competitorMap.get(extId);
    if (!competitor) {
      continue;
    }

    await prisma.competitor.update({
      where: { id: competitor.id },
      data: {
        teamId: assignment.teamId,
        leg: assignment.leg ?? null,
      },
    });
  }
}

export const meosTestingHelpers = {
  parseMopXml,
  parseRadioSplits,
  parseTeamAssignments,
};
