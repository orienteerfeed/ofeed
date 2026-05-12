import type { ProtocolType } from '../../generated/prisma/enums.js';
import { normalizeValue } from '../../utils/normalize.js';
import { organisationSelect } from '../event/organisation.helpers.js';

type CompetitorDiffField = {
  key: string;
  type: 'string' | 'number' | 'date';
  protocol: ProtocolType;
};

/**
 * Field comparison plan for change detection. Order is preserved in protocol output.
 */
const COMPETITOR_DIFF_FIELDS: readonly CompetitorDiffField[] = [
  { key: 'classId', type: 'number', protocol: 'class_change' },
  { key: 'firstname', type: 'string', protocol: 'firstname_change' },
  { key: 'lastname', type: 'string', protocol: 'lastname_change' },
  { key: 'nationality', type: 'string', protocol: 'nationality_change' },
  { key: 'registration', type: 'string', protocol: 'registration_change' },
  { key: 'organisation', type: 'string', protocol: 'organisation_change' },
  { key: 'shortName', type: 'string', protocol: 'short_name_change' },
  { key: 'bibNumber', type: 'number', protocol: 'bibNumber_change' },
  { key: 'startTime', type: 'date', protocol: 'start_time_change' },
  { key: 'finishTime', type: 'date', protocol: 'finish_time_change' },
  { key: 'time', type: 'number', protocol: 'time_change' },
  { key: 'card', type: 'number', protocol: 'si_card_change' },
  { key: 'status', type: 'string', protocol: 'status_change' },
  { key: 'teamId', type: 'number', protocol: 'team_change' },
  { key: 'leg', type: 'number', protocol: 'leg_change' },
];

export type CompetitorChange = {
  type: ProtocolType;
  previousValue: string | null;
  newValue: string | null;
};

/**
 * Pure diff between an incoming competitor snapshot and the DB row. Skips a field when the
 * incoming value is `undefined` (i.e. payload didn't carry it).
 */
export function detectCompetitorChanges(
  previous: Record<string, unknown>,
  incoming: Record<string, unknown>,
  previousOverrides: { organisation?: string | null; shortName?: string | null } = {},
): CompetitorChange[] {
  const out: CompetitorChange[] = [];
  for (const { key, type, protocol } of COMPETITOR_DIFF_FIELDS) {
    const incomingValue = incoming[key];
    if (incomingValue === undefined) continue;

    const previousFlat =
      key === 'organisation'
        ? previousOverrides.organisation ?? null
        : key === 'shortName'
        ? previousOverrides.shortName ?? null
        : previous[key];

    if (normalizeValue(type, incomingValue) === normalizeValue(type, previousFlat)) continue;

    out.push({
      type: protocol,
      previousValue: previousFlat?.toString() ?? null,
      newValue: incomingValue?.toString() ?? null,
    });
  }
  return out;
}

export const COMPETITOR_DIFF_SELECT = {
  id: true,
  classId: true,
  firstname: true,
  lastname: true,
  nationality: true,
  registration: true,
  license: true,
  organisationId: true,
  organisation: { select: organisationSelect },
  card: true,
  bibNumber: true,
  startTime: true,
  finishTime: true,
  time: true,
  status: true,
  lateStart: true,
  leg: true,
  note: true,
  externalId: true,
} as const;
