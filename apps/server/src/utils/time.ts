const HH_MM_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const HH_MM_SS_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;
const HAS_TIMEZONE_PATTERN = /(?:[zZ]|[+-]\d{2}:\d{2})$/;
const DATETIME_TIME_PART_PATTERN = /(?:T|\s)(\d{2}):(\d{2})(?::(\d{2}))?/;

function padTime(value: string): string {
  return value.length === 5 ? `${value}:00` : value;
}

function isValidDate(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

export function normalizeUtcTimeString(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    if (!isValidDate(value)) {
      return null;
    }

    return value.toISOString().slice(11, 19);
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (HH_MM_SS_PATTERN.test(trimmed)) {
    return trimmed;
  }

  if (HH_MM_PATTERN.test(trimmed)) {
    return `${trimmed}:00`;
  }

  if (HAS_TIMEZONE_PATTERN.test(trimmed)) {
    const parsedWithTimezone = new Date(trimmed);
    if (isValidDate(parsedWithTimezone)) {
      return parsedWithTimezone.toISOString().slice(11, 19);
    }
  }

  const localDateTimeMatch = trimmed.match(DATETIME_TIME_PART_PATTERN);
  if (localDateTimeMatch) {
    const [, hh, mm, ss] = localDateTimeMatch;
    const candidate = padTime(`${hh}:${mm}${ss ? `:${ss}` : ''}`);
    if (HH_MM_SS_PATTERN.test(candidate)) {
      return candidate;
    }
  }

  const parsed = new Date(trimmed);
  if (!isValidDate(parsed)) {
    return null;
  }

  return parsed.toISOString().slice(11, 19);
}

export function toPrismaTimeDate(utcTime: string): Date {
  return new Date(`1970-01-01T${utcTime}Z`);
}
