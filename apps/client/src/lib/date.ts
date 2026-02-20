import type { Locale } from 'date-fns';
import { format, formatDuration, isValid, parse, parseISO } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { cs, de, enGB, es, sv } from 'date-fns/locale';

export const DATE_FORMATS = {
  date: 'd. M. yyyy',
  datetime: 'dd. MM. yyyy HH:mm',
  dateWithDay: 'ccc, dd. MM. yyyy',
  timeHms: 'HH:mm:ss',
  timeHhMm: 'HH:mm',
} as const;

export type LocaleKey = 'cs' | 'enGB' | 'es' | 'de' | 'sv';
const LOCALES: Record<LocaleKey, Locale> = { cs, enGB, es, de, sv };
const TIME_HH_MM_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const TIME_HH_MM_SS_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;
const ISO_DATE_PREFIX_PATTERN = /^(\d{4}-\d{2}-\d{2})/;

export function getLocaleKey(language?: string): LocaleKey {
  if (!language) return 'cs';
  const normalized = language.toLowerCase();
  if (normalized.startsWith('cs')) return 'cs';
  if (normalized.startsWith('de')) return 'de';
  if (normalized.startsWith('es')) return 'es';
  if (normalized.startsWith('sv')) return 'sv';
  return 'enGB';
}

/** build date-fns options only when we actually have a locale (exactOptionalPropertyTypes-safe) */
function fmtOpts(key?: LocaleKey) {
  return key ? { locale: LOCALES[key] } : undefined;
}

/** Safe parse: Date | string (ISO) | number(ms). Returns Date or null. */
export function parseDate(value: Date | string | number): Date | null {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string') {
    try {
      const d = parseISO(value);
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }
  if (typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function formatDate(
  value: Date | string | number,
  locale?: LocaleKey
): string {
  const d = parseDate(value);
  if (!d) return '';
  return format(d, DATE_FORMATS.date, fmtOpts(locale));
}

export function formatDateTime(
  value: Date | string | number,
  locale?: LocaleKey
): string {
  const d = parseDate(value);
  if (!d) return '';
  return format(d, DATE_FORMATS.datetime, fmtOpts(locale));
}

export function formatDateWithDay(
  value: Date | string | number,
  locale: LocaleKey = 'cs'
): string {
  const d = parseDate(value);
  if (!d) return '';
  return format(d, DATE_FORMATS.dateWithDay, { locale: LOCALES[locale] });
}

export function formatTimeToHms(value: Date | string | number): string {
  const d = parseDate(value);
  if (!d && typeof value === 'string') {
    return normalizeTimeInput(value) ?? '';
  }
  if (!d) return '';
  return format(d, DATE_FORMATS.timeHms);
}

export function normalizeTimeInput(value?: string): string | undefined {
  if (!value) return undefined;

  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;

  if (TIME_HH_MM_SS_PATTERN.test(trimmed)) {
    return trimmed;
  }

  if (TIME_HH_MM_PATTERN.test(trimmed)) {
    return `${trimmed}:00`;
  }

  const parsedIso = parseISO(trimmed);
  if (isValid(parsedIso)) {
    return formatInTimeZone(parsedIso, 'UTC', DATE_FORMATS.timeHms);
  }

  const fallbackFormats = [
    'yyyy-MM-dd HH:mm:ss',
    'yyyy-MM-dd HH:mm',
    'dd.MM.yyyy HH:mm:ss',
    'dd.MM.yyyy HH:mm',
  ];

  for (const fallbackFormat of fallbackFormats) {
    const parsedFallback = parse(trimmed, fallbackFormat, new Date());
    if (isValid(parsedFallback)) {
      return format(parsedFallback, DATE_FORMATS.timeHms);
    }
  }

  return undefined;
}

function extractIsoDatePart(value: Date | string | number): string | null {
  if (typeof value === 'string') {
    const directMatch = value.trim().match(ISO_DATE_PREFIX_PATTERN);
    if (directMatch) {
      return directMatch[1] ?? null;
    }
  }

  const parsed = parseDate(value);
  if (!parsed) return null;

  return formatInTimeZone(parsed, 'UTC', 'yyyy-MM-dd');
}

function buildUtcDateFromStoredTime(
  utcTime: string,
  eventDate: Date | string | number
): Date | null {
  const normalizedUtcTime = normalizeTimeInput(utcTime);
  const eventDatePart = extractIsoDatePart(eventDate);
  if (!normalizedUtcTime || !eventDatePart) return null;

  const date = parseISO(`${eventDatePart}T${normalizedUtcTime}Z`);
  if (!isValid(date)) return null;

  return date;
}

export function localTimeToUtcTimeForStorage(
  localTime: string,
  eventDate: Date | string | number,
  userTimezone: string
): string | undefined {
  const normalizedLocalTime = normalizeTimeInput(localTime);
  const eventDatePart = extractIsoDatePart(eventDate);
  if (!normalizedLocalTime || !eventDatePart) return undefined;

  const localDateTime = `${eventDatePart}T${normalizedLocalTime}`;
  const utcDate = fromZonedTime(localDateTime, userTimezone);

  return formatInTimeZone(utcDate, 'UTC', DATE_FORMATS.timeHms);
}

export function formatStoredUtcTimeForInput(
  utcTime: string,
  eventDate: Date | string | number,
  userTimezone: string
): string {
  const utcDate = buildUtcDateFromStoredTime(utcTime, eventDate);
  if (!utcDate) return '';

  return formatInTimeZone(utcDate, userTimezone, DATE_FORMATS.timeHms);
}

export function formatStoredUtcTimeForTimezone(
  utcTime: string,
  eventDate: Date | string | number,
  timezone: string
): string {
  const utcDate = buildUtcDateFromStoredTime(utcTime, eventDate);
  if (!utcDate) return '';

  return formatInTimeZone(utcDate, timezone, DATE_FORMATS.timeHms);
}

export function formatTimestamp(
  timestamp: number | string,
  locale: string = 'cs-CZ'
): string {
  const n = typeof timestamp === 'string' ? Number(timestamp) : timestamp;
  const d = new Date(n);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

/** duration (seconds) → localized "X hours Y minutes Z seconds" */
export function formatDurationTime(
  seconds: number,
  locale: LocaleKey = 'cs'
): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return formatDuration(
    { hours: hrs, minutes: mins, seconds: secs },
    { locale: LOCALES[locale] }
  );
}

/** seconds → "HH:MM:SS" if >= 3h, otherwise "M:SS" */
export function formatSecondsToTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h >= 3) return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  const totalMinutes = Math.floor(seconds / 60);
  return `${totalMinutes}:${pad2(s)}`;
}

/** seconds → "HH:mm" (total hours can exceed 24) */
export function formatSecondsToHhMm(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${pad2(h)}:${pad2(m)}`;
}

/** milliseconds → "M:SS" */
export function millisToMinutesAndSeconds(millis: number): string {
  if (!Number.isFinite(millis) || millis < 0) return '';
  const minutes = Math.floor(millis / 60000);
  const seconds = Math.floor((millis % 60000) / 1000);
  return `${minutes}:${pad2(seconds)}`;
}

/** seconds → "H:MM:SS" (mode 'hms') or "H:MM" (mode 'hm'); hours can exceed 24 */
export function secondsToHms(
  seconds: number,
  mode: 'hms' | 'hm' = 'hms'
): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  const totalHours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return mode === 'hm'
    ? `${totalHours}:${pad2(minutes)}`
    : `${pad2(totalHours)}:${pad2(minutes)}:${pad2(secs)}`;
}

/** Date → "YYYY-MM-DD" for <input type="date" /> */
export function formatDateForInput(date: Date | string | number): string {
  const d = parseDate(date);
  if (!d) return '';
  return format(d, 'yyyy-MM-dd');
}

/** Date → "YYYY-MM-DDTHH:MM" for <input type="datetime-local" /> */
export function formatDateTimeForInput(date: Date | string | number): string {
  const d = parseDate(date);
  if (!d) return '';
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}
