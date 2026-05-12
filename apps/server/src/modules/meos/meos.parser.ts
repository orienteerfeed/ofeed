import { DOMParser, type Document as XmlDocument } from '@xmldom/xmldom';
import type { ResultStatus } from '../../generated/prisma/enums.js';

export type MopRootType = 'MOPComplete' | 'MOPDiff';

export interface MopCompetition {
  id: number;
  name: string;
  date?: string;
  zeroTime?: string;
  organizer?: string;
}

export interface MopOrg {
  id: number;
  name: string;
  nationality?: string;
  shortName?: string;
  delete: boolean;
}

export interface MopClass {
  id: number;
  name: string;
  ord?: number;
  radioCodes: number[][];
  delete: boolean;
}

export interface MopSplit {
  code: number;
  tenths: number;
}

export interface MopCompetitor {
  id: number;
  card?: number;
  firstname: string;
  lastname: string;
  classId?: number;
  orgId?: number;
  bibNumber?: number;
  stat: number;
  startTenths?: number;
  runTimeTenths?: number;
  splits: MopSplit[];
  delete: boolean;
}

export interface MopTeamMember {
  competitorId: number;
  leg: number;
}

export interface MopTeam {
  id: number;
  name: string;
  classId?: number;
  orgId?: number;
  bibNumber?: number;
  stat: number;
  members?: MopTeamMember[];
  delete: boolean;
}

export interface MopDocument {
  rootType: MopRootType;
  competition?: MopCompetition;
  orgs: MopOrg[];
  classes: MopClass[];
  competitors: MopCompetitor[];
  teams: MopTeam[];
}

const STAT_MAP: Record<number, ResultStatus> = {
  0: 'Inactive',
  1: 'OK',
  2: 'OK',
  3: 'MissingPunch',
  4: 'DidNotFinish',
  5: 'Disqualified',
  6: 'OverTime',
  15: 'NotCompeting',
  20: 'DidNotStart',
  21: 'Cancelled',
  99: 'NotCompeting',
};

export function mapMopStat(stat: number): ResultStatus {
  return STAT_MAP[stat] ?? 'Inactive';
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const zonedAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );

  return zonedAsUtc - date.getTime();
}

function localDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset = getTimeZoneOffsetMs(new Date(localAsUtc), timeZone);
  let utc = localAsUtc - offset;

  const adjustedOffset = getTimeZoneOffsetMs(new Date(utc), timeZone);
  if (adjustedOffset !== offset) {
    utc = localAsUtc - adjustedOffset;
  }

  return new Date(utc);
}

export function meosTimeToDateTime(
  tenths: number,
  eventDate: Date,
  timeZone: string = 'UTC',
): Date {
  const wholeSeconds = Math.floor(tenths / 10);
  const localClock = new Date(
    Date.UTC(
      eventDate.getUTCFullYear(),
      eventDate.getUTCMonth(),
      eventDate.getUTCDate(),
      0,
      0,
      wholeSeconds,
    ),
  );

  return localDateTimeToUtc(
    localClock.getUTCFullYear(),
    localClock.getUTCMonth() + 1,
    localClock.getUTCDate(),
    localClock.getUTCHours(),
    localClock.getUTCMinutes(),
    localClock.getUTCSeconds(),
    timeZone,
  );
}

function attr(el: Element, name: string): string | undefined {
  const v = el.getAttribute(name);
  return v !== null && v !== '' ? v : undefined;
}

function numAttr(el: Element, name: string): number | undefined {
  const v = attr(el, name);
  return v !== undefined ? parseInt(v, 10) : undefined;
}

function positiveIntAttr(el: Element, name: string): number | undefined {
  const v = attr(el, name);
  if (v === undefined) return undefined;
  if (!/^\d+$/.test(v)) return undefined;

  const parsed = Number(v);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function isDeleteEl(el: Element): boolean {
  return el.getAttribute('delete') === 'true';
}

function parseOrg(el: Element): MopOrg {
  const id = numAttr(el, 'id') ?? 0;
  const name = el.textContent?.trim() ?? '';
  return {
    id,
    name,
    nationality: attr(el, 'nat'),
    shortName: attr(el, 'short'),
    delete: isDeleteEl(el),
  };
}

function parseClass(el: Element): MopClass {
  const id = numAttr(el, 'id') ?? 0;
  const name = el.textContent?.trim() ?? '';
  const ordStr = attr(el, 'ord');
  const radioStr = attr(el, 'radio');
  const radioCodes = radioStr
    ? radioStr.split(';').map((leg) =>
        leg
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n)),
      )
    : [];
  return {
    id,
    name,
    ord: ordStr !== undefined ? parseInt(ordStr, 10) : undefined,
    radioCodes,
    delete: isDeleteEl(el),
  };
}

function parseSplits(radioText: string): MopSplit[] {
  const text = radioText.trim();
  if (!text) return [];
  return text
    .split(/[;\s]+/)
    .map((pair) => {
      const parts = pair.split(',');
      if (parts.length !== 2) return null;
      const code = parseInt(parts[0], 10);
      const tenths = parseInt(parts[1], 10);
      if (isNaN(code) || isNaN(tenths)) return null;
      return { code, tenths };
    })
    .filter((s): s is MopSplit => s !== null);
}

function parseCompetitor(el: Element): MopCompetitor {
  const id = numAttr(el, 'id') ?? 0;
  const card = numAttr(el, 'card');

  if (isDeleteEl(el)) {
    return {
      id,
      card,
      firstname: '',
      lastname: '',
      stat: 0,
      splits: [],
      delete: true,
    };
  }

  const baseEl = el.getElementsByTagName('base')[0];
  let firstname = '';
  let lastname = '';
  let classId: number | undefined;
  let orgId: number | undefined;
  let stat = 0;
  let startTenths: number | undefined;
  let runTimeTenths: number | undefined;

  if (baseEl) {
    const fullName = baseEl.textContent?.trim() ?? '';
    const spaceIdx = fullName.indexOf(' ');
    if (spaceIdx === -1) {
      firstname = fullName;
      lastname = '';
    } else {
      firstname = fullName.slice(0, spaceIdx);
      lastname = fullName.slice(spaceIdx + 1);
    }
    classId = numAttr(baseEl, 'cls');
    orgId = numAttr(baseEl, 'org');
    stat = numAttr(baseEl, 'stat') ?? 0;
    startTenths = numAttr(baseEl, 'st');
    runTimeTenths = numAttr(baseEl, 'rt');

    const tstatEl = el.getElementsByTagName('input')[0];
    if (tstatEl) {
      const tstat = numAttr(tstatEl, 'tstat');
      if (tstat !== undefined) stat = tstat;
    }
  }

  const radioEl = el.getElementsByTagName('radio')[0];
  const splits = radioEl ? parseSplits(radioEl.textContent ?? '') : [];

  return {
    id,
    card,
    firstname,
    lastname,
    classId,
    orgId,
    bibNumber: baseEl ? positiveIntAttr(baseEl, 'bib') : positiveIntAttr(el, 'bib'),
    stat,
    startTenths,
    runTimeTenths,
    splits,
    delete: false,
  };
}

function parseTeam(el: Element): MopTeam {
  const id = numAttr(el, 'id') ?? 0;
  const baseEl = el.getElementsByTagName('base')[0];
  const memberEl = el.getElementsByTagName('r')[0];

  if (isDeleteEl(el)) {
    return {
      id,
      name: '',
      stat: 0,
      delete: true,
    };
  }

  return {
    id,
    name: baseEl?.textContent?.trim() ?? el.textContent?.trim() ?? '',
    classId: baseEl ? numAttr(baseEl, 'cls') : numAttr(el, 'cls'),
    orgId: baseEl ? numAttr(baseEl, 'org') : numAttr(el, 'org'),
    bibNumber: baseEl ? numAttr(baseEl, 'bib') : numAttr(el, 'bib'),
    stat: (baseEl ? numAttr(baseEl, 'stat') : numAttr(el, 'stat')) ?? 0,
    members: memberEl ? parseTeamMembers(memberEl.textContent ?? '') : undefined,
    delete: isDeleteEl(el),
  };
}

function parseTeamMembers(text: string): MopTeamMember[] {
  return text
    .trim()
    .split(';')
    .flatMap((legText, legIndex) =>
      legText
        .split(',')
        .map((member) => {
          const competitorId = parseInt(member.trim(), 10);
          return Number.isNaN(competitorId) ? null : { competitorId, leg: legIndex + 1 };
        })
        .filter((member): member is MopTeamMember => member !== null),
    );
}

function parseCompetition(el: Element): MopCompetition {
  return {
    id: numAttr(el, 'id') ?? 0,
    name: el.textContent?.trim() ?? '',
    date: attr(el, 'date'),
    zeroTime: attr(el, 'zeroTime'),
    organizer: attr(el, 'organizer'),
  };
}

export function parseMopDocument(xml: string): MopDocument | null {
  let doc: XmlDocument;
  try {
    // onError suppresses namespace warnings; ParseError is still thrown for malformed XML
    const parser = new DOMParser({ onError: () => {} } as ConstructorParameters<
      typeof DOMParser
    >[0]);
    doc = parser.parseFromString(xml, 'text/xml');
  } catch {
    return null;
  }

  const root = doc.documentElement;
  if (!root) return null;

  const localName = root.localName ?? root.nodeName;
  if (localName !== 'MOPComplete' && localName !== 'MOPDiff') return null;

  const rootType = localName as MopRootType;

  let competition: MopCompetition | undefined;
  const orgs: MopOrg[] = [];
  const classes: MopClass[] = [];
  const competitors: MopCompetitor[] = [];
  const teams: MopTeam[] = [];

  const children = root.childNodes;
  for (let i = 0; i < children.length; i++) {
    const node = children[i];
    if (node.nodeType !== 1) continue; // element nodes only
    const el = node as unknown as Element;
    const tag = el.localName ?? el.nodeName;
    switch (tag) {
      case 'competition':
        competition = parseCompetition(el);
        break;
      case 'org':
        orgs.push(parseOrg(el));
        break;
      case 'cls':
        classes.push(parseClass(el));
        break;
      case 'cmp':
        competitors.push(parseCompetitor(el));
        break;
      case 'tm':
        teams.push(parseTeam(el));
        break;
      // ctrl elements are intentionally skipped
    }
  }

  return { rootType, competition, orgs, classes, competitors, teams };
}
