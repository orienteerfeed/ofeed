import type { Locale } from 'date-fns';
import { format, formatDuration, parseISO } from 'date-fns';
import { cs, enGB, es } from 'date-fns/locale';

export const DATE_FORMATS = {
  date: 'd. M. yyyy',
  datetime: 'dd. MM. yyyy HH:mm',
  dateWithDay: 'ccc, dd. MM. yyyy',
  timeHms: 'HH:mm:ss',
  timeHhMm: 'HH:mm',
} as const;

export type LocaleKey = 'cs' | 'enGB' | 'es';
const LOCALES: Record<LocaleKey, Locale> = { cs, enGB, es };

export function getLocaleKey(language?: string): LocaleKey {
  if (!language) return 'cs';
  const normalized = language.toLowerCase();
  if (normalized.startsWith('cs')) return 'cs';
  if (normalized.startsWith('es')) return 'es';
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
  if (!d) return '';
  return format(d, DATE_FORMATS.timeHms);
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
