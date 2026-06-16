/**
 * Pure parsing helpers for IOF XML values. No DB access, no side effects —
 * suitable for direct unit testing without Prisma mocking.
 */

import type { ResultStatus, Sex } from '../../generated/prisma/enums.js';
import { ResultStatus as ResultStatusEnum } from '../../generated/prisma/enums.js';
import { parseIofDateTime } from '../../utils/time.js';

const RESULT_STATUSES = new Set<ResultStatus>(Object.values(ResultStatusEnum));

const RESULT_STATUS_ALIASES: Record<string, ResultStatus> = {
  DNS: 'DidNotStart',
  DNF: 'DidNotFinish',
  DSQ: 'Disqualified',
  MP: 'MissingPunch',
  OT: 'OverTime',
  NC: 'NotCompeting',
  NENT: 'DidNotEnter',
};

export function normalizeStatusToken(value: string): string {
  return value
    .trim()
    .replace(/[\s_-]+/g, '')
    .toUpperCase();
}

export function getIofTextValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === 'number') {
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

  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const direct =
    getIofTextValue(record._) ??
    getIofTextValue(record.value) ??
    getIofTextValue(record['#text']) ??
    getIofTextValue(record.text);
  if (direct) {
    return direct;
  }

  const attrCandidate = record.ATTR;
  if (attrCandidate && typeof attrCandidate === 'object') {
    const attrs = attrCandidate as Record<string, unknown>;
    const fromAttrs =
      getIofTextValue(attrs.value) ?? getIofTextValue(attrs.status) ?? getIofTextValue(attrs.code);
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

export function getIofDateTime(value: unknown, timeZone: string): Date | undefined {
  const raw = getIofTextValue(value);
  if (!raw) return undefined;
  return parseIofDateTime(raw, timeZone);
}

export function getIofIntegerValue(value: unknown): number | null {
  const raw = getIofTextValue(value);
  if (!raw) return null;

  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function getIofFloatValue(value: unknown): number | null {
  const raw = getIofTextValue(value);
  if (!raw) return null;

  const parsed = Number.parseFloat(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

export function toResultStatus(value: unknown, fallback: ResultStatus): ResultStatus {
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

export function toSex(value: string | undefined, fallback: Sex): Sex {
  if (value === 'M' || value === 'F' || value === 'B') {
    return value;
  }

  return fallback;
}

/**
 * Infer sex from the IOF class name prefix.
 * HDR (mixed handicapped/recreational) must be checked before the generic H→M rule.
 * M/F prefixes are treated as sex markers only when followed by an age number (for example M21/F16).
 */
export function inferClassSex(className: string): Sex {
  if (className.startsWith('HDR')) return 'B';
  if (className.charAt(0) === 'H') return 'M';
  if (className.charAt(0) === 'D') return 'F';
  if (/^M\d/.test(className)) return 'M';
  if (/^F\d/.test(className)) return 'F';
  return 'B';
}
