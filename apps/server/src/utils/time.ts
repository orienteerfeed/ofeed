const HH_MM_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const HH_MM_SS_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;
const HAS_TIMEZONE_PATTERN = /(?:[zZ]|[+-]\d{2}:\d{2})$/;
const DATETIME_TIME_PART_PATTERN = /(?:T|\s)(\d{2}):(\d{2})(?::(\d{2}))?/;
const LOCAL_DATETIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:T|\s)(\d{2}):(\d{2})(?::(\d{2}))?$/;

type LocalDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function padTime(value: string): string {
  return value.length === 5 ? `${value}:00` : value;
}

function isValidDate(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

function getDateTimeFormatter(timeZone: string): Intl.DateTimeFormat | null {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    return null;
  }
}

function getLocalDateTimeParts(
  date: Date,
  timeZone: string,
): LocalDateTimeParts | null {
  const formatter = getDateTimeFormatter(timeZone);
  if (!formatter) {
    return null;
  }

  const parts = formatter.formatToParts(date);
  const values = {
    year: '',
    month: '',
    day: '',
    hour: '',
    minute: '',
    second: '',
  };

  for (const part of parts) {
    if (
      part.type === 'year' ||
      part.type === 'month' ||
      part.type === 'day' ||
      part.type === 'hour' ||
      part.type === 'minute' ||
      part.type === 'second'
    ) {
      values[part.type] = part.value;
    }
  }

  if (Object.values(values).some((value) => value.length === 0)) {
    return null;
  }

  return {
    year: Number.parseInt(values.year, 10),
    month: Number.parseInt(values.month, 10),
    day: Number.parseInt(values.day, 10),
    hour: Number.parseInt(values.hour, 10),
    minute: Number.parseInt(values.minute, 10),
    second: Number.parseInt(values.second, 10),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number | null {
  const zoned = getLocalDateTimeParts(date, timeZone);
  if (!zoned) {
    return null;
  }

  const utcTimestamp = Date.UTC(
    zoned.year,
    zoned.month - 1,
    zoned.day,
    zoned.hour,
    zoned.minute,
    zoned.second,
  );

  return utcTimestamp - date.getTime();
}

function sameLocalDateTime(
  a: LocalDateTimeParts,
  b: LocalDateTimeParts | null,
): boolean {
  return (
    b !== null &&
    a.year === b.year &&
    a.month === b.month &&
    a.day === b.day &&
    a.hour === b.hour &&
    a.minute === b.minute &&
    a.second === b.second
  );
}

function parseLocalDateTime(value: string): LocalDateTimeParts | null {
  const match = value.match(LOCAL_DATETIME_PATTERN);
  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, second = '00'] = match;
  return {
    year: Number.parseInt(year, 10),
    month: Number.parseInt(month, 10),
    day: Number.parseInt(day, 10),
    hour: Number.parseInt(hour, 10),
    minute: Number.parseInt(minute, 10),
    second: Number.parseInt(second, 10),
  };
}

function parseLocalDateTimeInTimeZone(
  value: string,
  timeZone: string,
): Date | undefined {
  const requested = parseLocalDateTime(value);
  if (!requested) {
    return undefined;
  }

  const utcGuess = Date.UTC(
    requested.year,
    requested.month - 1,
    requested.day,
    requested.hour,
    requested.minute,
    requested.second,
  );

  const initialOffset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  if (initialOffset === null) {
    return undefined;
  }

  let resolved = new Date(utcGuess - initialOffset);
  const correctedOffset = getTimeZoneOffsetMs(resolved, timeZone);
  if (correctedOffset !== null && correctedOffset !== initialOffset) {
    resolved = new Date(utcGuess - correctedOffset);
  }

  return sameLocalDateTime(requested, getLocalDateTimeParts(resolved, timeZone))
    ? resolved
    : undefined;
}

export function parseIofDateTime(
  value: string | Date | null | undefined,
  timeZone = 'UTC',
): Date | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (value instanceof Date) {
    return isValidDate(value) ? value : undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  if (HAS_TIMEZONE_PATTERN.test(trimmed)) {
    const parsedWithTimezone = new Date(trimmed);
    return isValidDate(parsedWithTimezone) ? parsedWithTimezone : undefined;
  }

  return parseLocalDateTimeInTimeZone(trimmed, timeZone);
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
