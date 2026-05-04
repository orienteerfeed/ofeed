/**
 * Shared TypeScript shapes for parsed IOF XML payloads.
 *
 * Why a separate file: keeps both `upload.handlers.ts` (orchestration) and
 * `upload.competitor.ts` (write logic) free from cyclic imports — both can
 * depend on these types without depending on each other.
 */

export type IofSourceId = {
  ATTR?: { type?: string };
  _?: string;
};

export type IofPersonName = {
  Family?: string[];
  Given?: string[];
};

export type IofPerson = {
  Id?: IofSourceId[];
  Name?: IofPersonName[];
  Nationality?: Array<{ ATTR?: { code?: string } }>;
};

export type IofOrganisation = {
  ATTR?: { id?: string };
  Id?: IofSourceId[];
  Name?: string[];
  ShortName?: string[];
  Country?: Array<{ ATTR?: { code?: string } }>;
} | null;

export type IofStart = {
  BibNumber?: string[];
  StartTime?: string[];
  ControlCard?: string[];
  Leg?: Array<string | number>;
};

export type IofSplitTime = {
  ControlCode?: string[];
  Time?: string[];
};

export type IofResult = {
  BibNumber?: string[];
  StartTime?: string[];
  FinishTime?: string[];
  Time?: string[];
  ControlCard?: string[];
  Status?: unknown;
  SplitTime?: IofSplitTime[];
  Leg?: Array<string | number>;
};

export type TeamWithBib = {
  EntryId?: string[];
  Name: string[];
  BibNumber?: string[];
};

export type IofPayloadType = 'ResultList' | 'StartList' | 'CourseData';
export type IofTypeMatch = { isArray: true; jsonKey: IofPayloadType; jsonValue: unknown };

export const IOF_PAYLOAD_TYPES: readonly IofPayloadType[] = [
  'ResultList',
  'StartList',
  'CourseData',
];

export function isIofPayloadType(value: string): value is IofPayloadType {
  return (IOF_PAYLOAD_TYPES as readonly string[]).includes(value);
}
