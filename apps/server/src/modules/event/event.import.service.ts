import { Parser } from "xml2js";

import env from "../../config/env.js";
import prisma from "../../utils/context.js";
import type {
  EventImportPreviewBody,
  EventImportSearchBody,
  ExternalEventProvider,
} from "./event.schema.js";

type GenericRecord = Record<string, unknown>;

export type ExternalEventSearchResult = {
  provider: ExternalEventProvider;
  externalEventId: string;
  name: string;
  date?: string;
  organizer?: string;
  location?: string;
};

export type ExternalEventPreview = {
  provider: ExternalEventProvider;
  externalEventId: string;
  name: string;
  sportId?: number;
  date?: string;
  timezone?: string;
  organizer?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  countryCode?: string;
  zeroTime?: string;
  ranking?: boolean;
  coefRanking?: number;
  relay?: boolean;
  published?: boolean;
  hundredthPrecision?: boolean;
};

type InternalCandidate = {
  externalEventId: string;
  name: string;
  date?: string;
  organizer?: string;
  location?: string;
  countryRaw?: string;
  timezoneRaw?: string;
  sportRaw?: string;
  zeroTimeRaw?: string;
  latitude?: number;
  longitude?: number;
  ranking?: boolean;
  coefRanking?: number;
  relay?: boolean;
  score: number;
};

type ProviderCredentials = {
  apiKey?: string;
};

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RECORDS = 8_000;
const DEFAULT_SEARCH_LIMIT = 8;
const XML_PARSER = new Parser({ explicitArray: false, trim: true, mergeAttrs: true });

const ORIS_DEFAULT_TIMEZONE = "Europe/Prague";
const EVENTOR_DEFAULT_TIMEZONE = "Europe/Prague";

const ORIS_API_BASE_URL = env.ORIS_API_BASE_URL || "https://oris.orientacnisporty.cz/API/";
const EVENTOR_API_BASE_URL = env.EVENTOR_API_BASE_URL || "https://eventor.orienteering.sport/api";

const ID_KEYS = [
  "id",
  "ID",
  "eventId",
  "EventId",
  "eventID",
  "EventID",
  "EventRaceId",
  "eventRaceId",
];
const NAME_KEYS = [
  "name",
  "Name",
  "eventName",
  "EventName",
  "title",
  "Title",
  "Nazev",
  "Název",
];
const DATE_KEYS = [
  "date",
  "Date",
  "eventDate",
  "EventDate",
  "day",
  "Day",
  "datum",
  "Datum",
  "startDate",
  "StartDate",
];
const ZERO_TIME_KEYS = [
  "zeroTime",
  "ZeroTime",
  "startTime",
  "StartTime",
  "firstStart",
  "FirstStart",
];
const ORGANIZER_KEYS = [
  "organizer",
  "Organizer",
  "organiser",
  "Organiser",
  "organization",
  "Organization",
  "organisation",
  "Organisation",
  "club",
  "Club",
  // ORIS uses nested organizer object, e.g. Org1 -> Name
  "Org1",
];
const LOCATION_KEYS = [
  "location",
  "Location",
  "place",
  "Place",
  "venue",
  "Venue",
  "city",
  "City",
  "town",
  "Town",
  "arena",
  "Arena",
  "misto",
  "Misto",
  "místo",
  "Místo",
];
const COUNTRY_KEYS = [
  "countryCode",
  "CountryCode",
  "country",
  "Country",
  "nation",
  "Nation",
  "nationality",
  "Nationality",
];
const TIMEZONE_KEYS = ["timezone", "Timezone", "timeZone", "TimeZone", "tz", "TZ"];
const SPORT_KEYS = [
  "sport",
  "Sport",
  "sportId",
  "SportId",
  "discipline",
  "Discipline",
  "eventForm",
  "EventForm",
];
const LATITUDE_KEYS = ["latitude", "Latitude", "lat", "Lat", "gpslat", "GPSLat"];
const LONGITUDE_KEYS = ["longitude", "Longitude", "lon", "Lon", "gpslon", "GPSLon"];
const RANKING_KEYS = ["ranking", "Ranking", "ranked", "Ranked"];
const COEF_RANKING_KEYS = ["coefRanking", "CoefRanking", "rankingCoef", "RankingCoef"];
const RELAY_KEYS = ["relay", "Relay", "isRelay", "IsRelay"];

const ALPHA3_TO_ALPHA2_COUNTRIES: Record<string, string> = {
  CZE: "CZ",
  SVK: "SK",
  POL: "PL",
  AUT: "AT",
  DEU: "DE",
  SWE: "SE",
  NOR: "NO",
  FIN: "FI",
  DNK: "DK",
  GBR: "GB",
  USA: "US",
  ESP: "ES",
  FRA: "FR",
  ITA: "IT",
  CHE: "CH",
  HUN: "HU",
};

export class ExternalImportError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
  }
}

function isRecord(value: unknown): value is GenericRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStringValue(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === "number" || typeof value === "boolean") {
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
    const possibleText = [
      value._,
      value["#text"],
      value.value,
      value.text,
      value.Name,
      value.name,
      value.ID,
      value.id,
    ];

    for (const item of possibleText) {
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

  const normalized = parsedValue.replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return parsed;
}

function toBooleanValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  const parsedValue = toStringValue(value);
  if (!parsedValue) {
    return undefined;
  }

  const normalized = parsedValue.toLowerCase();
  if (["1", "true", "yes", "y", "ano"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "n", "ne"].includes(normalized)) {
    return false;
  }

  return undefined;
}

function getCaseInsensitiveValue(record: GenericRecord, key: string): unknown {
  const match = Object.entries(record).find(([candidate]) => candidate.toLowerCase() === key.toLowerCase());
  return match?.[1];
}

function readString(record: GenericRecord, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const candidate = getCaseInsensitiveValue(record, key);
    const parsed = toStringValue(candidate);
    if (parsed) {
      return parsed;
    }
  }

  return undefined;
}

function readNumber(record: GenericRecord, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const candidate = getCaseInsensitiveValue(record, key);
    const parsed = toNumberValue(candidate);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

function readBoolean(record: GenericRecord, keys: readonly string[]): boolean | undefined {
  for (const key of keys) {
    const candidate = getCaseInsensitiveValue(record, key);
    const parsed = toBooleanValue(candidate);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

function collectRecords(input: unknown, maxDepth: number = 9): GenericRecord[] {
  const result: GenericRecord[] = [];

  const visit = (value: unknown, depth: number) => {
    if (value === null || value === undefined || depth > maxDepth || result.length >= MAX_RECORDS) {
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

function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function toComparableId(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeDate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const dottedMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dottedMatch) {
    const day = dottedMatch[1].padStart(2, "0");
    const month = dottedMatch[2].padStart(2, "0");
    const year = dottedMatch[3];
    return `${year}-${month}-${day}`;
  }

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const day = slashMatch[1].padStart(2, "0");
    const month = slashMatch[2].padStart(2, "0");
    const year = slashMatch[3];
    return `${year}-${month}-${day}`;
  }

  const parsedDate = new Date(trimmed);
  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate.toISOString().slice(0, 10);
  }

  return undefined;
}

function normalizeTime(value: string | undefined, fallbackDate?: string): string | undefined {
  if (!value && fallbackDate) {
    return "00:00:00";
  }

  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  const directTime = trimmed.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (directTime) {
    const seconds = directTime[3] ? directTime[3] : "00";
    return `${directTime[1]}:${directTime[2]}:${seconds}`;
  }

  const directMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (directMatch) {
    const seconds = directMatch[6] ? directMatch[6] : "00";
    return `${directMatch[4]}:${directMatch[5]}:${seconds}`;
  }

  const dottedMatch = trimmed.match(
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?/,
  );
  if (dottedMatch) {
    const seconds = dottedMatch[6] ? dottedMatch[6] : "00";
    return `${dottedMatch[4]}:${dottedMatch[5]}:${seconds}`;
  }

  const parsedDate = new Date(trimmed);
  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate.toISOString().slice(11, 19);
  }

  if (fallbackDate) {
    return "00:00:00";
  }

  return undefined;
}

function normalizeCountryCode(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(normalized)) {
    return normalized;
  }

  if (/^[A-Z]{3}$/.test(normalized)) {
    return ALPHA3_TO_ALPHA2_COUNTRIES[normalized];
  }

  return undefined;
}

function looksLikeEventRecord(record: GenericRecord): boolean {
  const externalEventId = readString(record, ID_KEYS);
  const name = readString(record, NAME_KEYS);

  if (!externalEventId || !name) {
    return false;
  }

  const hasContext =
    Boolean(readString(record, DATE_KEYS)) ||
    Boolean(readString(record, ORGANIZER_KEYS)) ||
    Boolean(readString(record, LOCATION_KEYS)) ||
    Boolean(readString(record, SPORT_KEYS));

  const keySignature = Object.keys(record).join(" ").toLowerCase();
  const mentionsEvent = keySignature.includes("event") || keySignature.includes("zavod") || keySignature.includes("závod");

  return hasContext || mentionsEvent;
}

function scoreCandidate(record: GenericRecord): number {
  let score = 0;

  if (readString(record, DATE_KEYS)) {
    score += 3;
  }
  if (readString(record, ORGANIZER_KEYS)) {
    score += 2;
  }
  if (readString(record, LOCATION_KEYS)) {
    score += 2;
  }
  if (readString(record, SPORT_KEYS)) {
    score += 1;
  }

  const signature = Object.keys(record).join(" ").toLowerCase();
  if (signature.includes("event")) {
    score += 2;
  }

  return score;
}

function extractCandidates(payload: unknown): InternalCandidate[] {
  const records = collectRecords(payload);
  const candidates: InternalCandidate[] = [];

  for (const record of records) {
    if (!looksLikeEventRecord(record)) {
      continue;
    }

    const externalEventId = readString(record, ID_KEYS);
    const name = readString(record, NAME_KEYS);
    if (!externalEventId || !name) {
      continue;
    }

    const candidate: InternalCandidate = {
      externalEventId,
      name,
      date: normalizeDate(readString(record, DATE_KEYS)),
      organizer: readString(record, ORGANIZER_KEYS),
      location: readString(record, LOCATION_KEYS),
      countryRaw: readString(record, COUNTRY_KEYS),
      timezoneRaw: readString(record, TIMEZONE_KEYS),
      sportRaw: readString(record, SPORT_KEYS),
      zeroTimeRaw: readString(record, ZERO_TIME_KEYS),
      latitude: readNumber(record, LATITUDE_KEYS),
      longitude: readNumber(record, LONGITUDE_KEYS),
      ranking: readBoolean(record, RANKING_KEYS),
      coefRanking: readNumber(record, COEF_RANKING_KEYS),
      relay: readBoolean(record, RELAY_KEYS),
      score: scoreCandidate(record),
    };

    candidates.push(candidate);
  }

  return candidates;
}

function buildOrisUrl(method: "getEventList" | "getEvent", params: Record<string, string>): string {
  const url = new URL(ORIS_API_BASE_URL);
  url.searchParams.set("format", "json");
  url.searchParams.set("method", method);

  for (const [key, value] of Object.entries(params)) {
    if (value.length > 0) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function buildEventorUrl(pathname: string, params: Record<string, string> = {}): string {
  const baseUrl = ensureTrailingSlash(EVENTOR_API_BASE_URL);
  const url = new URL(pathname.replace(/^\//, ""), baseUrl);

  for (const [key, value] of Object.entries(params)) {
    if (value.length > 0) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

function formatEventorDateTime(date: Date, mode: "start" | "end"): string {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  const time = mode === "start" ? "00:00:00" : "23:59:59";
  return `${year}-${month}-${day} ${time}`;
}

function getEventorApiKey(credentials?: ProviderCredentials): string {
  const apiKey = credentials?.apiKey?.trim() || env.EVENTOR_API_KEY?.trim();

  if (!apiKey) {
    throw new ExternalImportError("Eventor API key is required.", 422);
  }

  return apiKey;
}

async function parseExternalResponse(response: Response): Promise<unknown> {
  const rawBody = await response.text();

  if (!rawBody.trim()) {
    throw new ExternalImportError("External provider returned an empty response.", 502);
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(rawBody);
    } catch {
      throw new ExternalImportError("Failed to parse JSON response from external provider.", 502);
    }
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    // keep trying XML parser
  }

  try {
    return await XML_PARSER.parseStringPromise(rawBody);
  } catch {
    throw new ExternalImportError("Unsupported response format from external provider.", 502);
  }
}

async function fetchExternalPayload(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
        ...headers,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new ExternalImportError("External event was not found.", 404);
      }

      if (response.status === 401 || response.status === 403) {
        throw new ExternalImportError("External provider authentication failed.", response.status);
      }

      if (response.status >= 500) {
        throw new ExternalImportError("External provider is currently unavailable.", 502);
      }

      throw new ExternalImportError(
        `External provider request failed with status ${response.status}.`,
        502,
      );
    }

    return parseExternalResponse(response);
  } catch (error) {
    if (error instanceof ExternalImportError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new ExternalImportError("External provider request timed out.", 504);
    }

    throw new ExternalImportError("Unable to reach external provider.", 502);
  } finally {
    clearTimeout(timeout);
  }
}

function buildSearchResults(
  provider: ExternalEventProvider,
  query: string,
  candidates: InternalCandidate[],
  limit: number,
): ExternalEventSearchResult[] {
  const normalizedQuery = normalizeForSearch(query);
  const deduplicated = new Map<string, InternalCandidate & { relevance: number }>();

  for (const candidate of candidates) {
    const normalizedName = normalizeForSearch(candidate.name);
    if (!normalizedName.includes(normalizedQuery)) {
      continue;
    }

    const relevance = normalizedName.startsWith(normalizedQuery) ? 3 : 1;
    const key = toComparableId(candidate.externalEventId);
    const existing = deduplicated.get(key);

    if (!existing || candidate.score + relevance > existing.score + existing.relevance) {
      deduplicated.set(key, { ...candidate, relevance });
    }
  }

  return Array.from(deduplicated.values())
    .sort((left, right) => {
      const scoreDelta = right.score + right.relevance - (left.score + left.relevance);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      const leftDate = left.date ? Date.parse(left.date) : 0;
      const rightDate = right.date ? Date.parse(right.date) : 0;
      return rightDate - leftDate;
    })
    .slice(0, limit)
    .map(candidate => ({
      provider,
      externalEventId: candidate.externalEventId,
      name: candidate.name,
      date: candidate.date,
      organizer: candidate.organizer,
      location: candidate.location,
    }));
}

function normalizeSportSource(provider: ExternalEventProvider, value: string): string[] {
  const normalized = normalizeForSearch(value);
  const keywords = new Set<string>();

  if (provider === "ORIS") {
    if (normalized === "1" || normalized.includes(" ob") || normalized.startsWith("ob")) {
      keywords.add("ob");
      keywords.add("orienteering");
    }
    if (normalized === "2" || normalized.includes("lob") || normalized.includes("ski")) {
      keywords.add("lob");
      keywords.add("ski");
    }
    if (normalized === "3" || normalized.includes("mtbo") || normalized.includes("bike")) {
      keywords.add("mtbo");
      keywords.add("bike");
    }
    if (normalized === "4" || normalized.includes("trail")) {
      keywords.add("trail");
    }
  }

  if (normalized.includes("orienteering")) {
    keywords.add("orienteering");
  }
  if (normalized.includes("relay") || normalized.includes("stafeta") || normalized.includes("štafeta")) {
    keywords.add("relay");
  }
  if (normalized.includes("trail")) {
    keywords.add("trail");
  }
  if (normalized.includes("mtbo") || normalized.includes("bike")) {
    keywords.add("mtbo");
  }
  if (normalized.includes("ski") || normalized.includes("lob")) {
    keywords.add("ski");
    keywords.add("lob");
  }
  if (normalized.includes("ob")) {
    keywords.add("ob");
  }

  return Array.from(keywords);
}

async function resolveSportId(provider: ExternalEventProvider, sportRaw?: string): Promise<number | undefined> {
  if (!sportRaw) {
    return undefined;
  }

  const keywords = normalizeSportSource(provider, sportRaw);
  if (keywords.length === 0) {
    return undefined;
  }

  const sports = await prisma.sport.findMany({
    select: {
      id: true,
      name: true,
    },
  });

  for (const sport of sports) {
    const normalizedName = normalizeForSearch(sport.name);
    if (keywords.some(keyword => normalizedName.includes(keyword) || keyword.includes(normalizedName))) {
      return sport.id;
    }
  }

  return undefined;
}

function pickPreviewCandidate(candidates: InternalCandidate[], externalEventId: string): InternalCandidate | undefined {
  const comparableId = toComparableId(externalEventId);

  const exactMatch = candidates.find(
    candidate => toComparableId(candidate.externalEventId) === comparableId,
  );
  if (exactMatch) {
    return exactMatch;
  }

  return [...candidates].sort((left, right) => right.score - left.score)[0];
}

async function fetchFromOrisForSearch(body: EventImportSearchBody): Promise<unknown> {
  const url = buildOrisUrl("getEventList", {
    name: body.query,
    all: "1",
  });

  return fetchExternalPayload(url);
}

async function fetchFromOrisForPreview(body: EventImportPreviewBody): Promise<unknown> {
  const url = buildOrisUrl("getEvent", {
    id: body.externalEventId,
  });

  return fetchExternalPayload(url);
}

async function fetchFromEventorForSearch(
  body: EventImportSearchBody,
  credentials?: ProviderCredentials,
): Promise<unknown> {
  const apiKey = getEventorApiKey(credentials);

  const now = new Date();
  const fromDate = new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1));
  const toDate = new Date(Date.UTC(now.getUTCFullYear() + 2, 11, 31));

  const url = buildEventorUrl("events", {
    fromDate: formatEventorDateTime(fromDate, "start"),
    toDate: formatEventorDateTime(toDate, "end"),
    includeAttributes: "true",
  });

  return fetchExternalPayload(url, {
    ApiKey: apiKey,
    "Api-Key": apiKey,
  });
}

async function fetchFromEventorForPreview(
  body: EventImportPreviewBody,
  credentials?: ProviderCredentials,
): Promise<unknown> {
  const apiKey = getEventorApiKey(credentials);
  const url = buildEventorUrl(`event/${encodeURIComponent(body.externalEventId)}`);

  return fetchExternalPayload(url, {
    ApiKey: apiKey,
    "Api-Key": apiKey,
  });
}

export async function searchExternalEvents(body: EventImportSearchBody): Promise<ExternalEventSearchResult[]> {
  const limit = body.limit ?? DEFAULT_SEARCH_LIMIT;

  const payload =
    body.provider === "ORIS"
      ? await fetchFromOrisForSearch(body)
      : await fetchFromEventorForSearch(body, { apiKey: body.apiKey });

  const candidates = extractCandidates(payload);

  return buildSearchResults(body.provider, body.query, candidates, limit);
}

export async function loadExternalEventPreview(body: EventImportPreviewBody): Promise<ExternalEventPreview> {
  const payload =
    body.provider === "ORIS"
      ? await fetchFromOrisForPreview(body)
      : await fetchFromEventorForPreview(body, { apiKey: body.apiKey });

  const candidates = extractCandidates(payload);
  const selected = pickPreviewCandidate(candidates, body.externalEventId);

  if (!selected) {
    throw new ExternalImportError("Unable to map external event data.", 404);
  }

  const sportId = await resolveSportId(body.provider, selected.sportRaw);
  const date = selected.date;

  const timezone =
    selected.timezoneRaw ||
    (body.provider === "ORIS" ? ORIS_DEFAULT_TIMEZONE : EVENTOR_DEFAULT_TIMEZONE);

  const countryCode =
    normalizeCountryCode(selected.countryRaw) ||
    (body.provider === "ORIS" ? "CZ" : undefined);

  return {
    provider: body.provider,
    externalEventId: selected.externalEventId,
    name: selected.name,
    sportId,
    date,
    timezone,
    organizer: selected.organizer,
    location: selected.location,
    latitude: selected.latitude,
    longitude: selected.longitude,
    countryCode,
    zeroTime: normalizeTime(selected.zeroTimeRaw, date),
    ranking: selected.ranking ?? false,
    coefRanking: selected.coefRanking,
    relay: selected.relay ?? false,
    published: false,
    hundredthPrecision: false,
  };
}
