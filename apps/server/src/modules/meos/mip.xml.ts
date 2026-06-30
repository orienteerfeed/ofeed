import type { ResultStatus } from '../../generated/prisma/enums.js';
import { MEOS_MIP_NAMESPACE } from './meos.protocol.js';

export type MipEntry = {
  id: number;
  localId?: number;
  extId?: string;
  classId?: number;
  className?: string;
  firstname: string;
  lastname: string;
  nationality?: string | null;
  club?: string | null;
  card?: number | null;
  bibNumber?: number | null;
  rank?: number | null;
  note?: string | null;
  status?: ResultStatus;
};

export type MipPunch = {
  code: number;
  time: number;
  card?: number;
  startNumber?: number;
};

export type MipDocument = {
  firstId?: number;
  lastId: number;
  entries: MipEntry[];
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function attr(name: string, value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  return ` ${name}="${escapeXml(String(value))}"`;
}

function element(name: string, value: string | number | null | undefined, attrs = ''): string {
  if (value === null || value === undefined || value === '') return '';
  return `<${name}${attrs}>${escapeXml(String(value))}</${name}>`;
}

export function mapResultStatusToMipStatus(status: ResultStatus | undefined): string | undefined {
  switch (status) {
    case 'OK':
    case 'Finished':
      return 'OK';
    case 'MissingPunch':
      return 'MP';
    case 'Disqualified':
      return 'DQ';
    case 'DidNotFinish':
      return 'DNF';
    case 'DidNotStart':
      return 'NS';
    case 'OverTime':
      return 'OT';
    case 'NotCompeting':
      return 'NP';
    case 'Cancelled':
      return 'CANCEL';
    default:
      return undefined;
  }
}

function formatEntryName(entry: MipEntry): string {
  const lastname = entry.lastname.trim();
  const firstname = entry.firstname.trim();
  if (lastname && firstname) return `${lastname}, ${firstname}`;
  return lastname || firstname;
}

function renderEntry(entry: MipEntry): string {
  const mipStatus = mapResultStatusToMipStatus(entry.status);
  const attributes =
    attr('localId', entry.localId) +
    (entry.localId === undefined ? attr('id', entry.id) : '') +
    attr('extId', entry.extId) +
    attr('classid', entry.classId) +
    (entry.classId === undefined ? attr('classname', entry.className) : '');

  const body =
    element('name', formatEntryName(entry), attr('nationality', entry.nationality)) +
    element('status', mipStatus) +
    element('club', entry.club) +
    element('card', entry.card) +
    element('bib', entry.bibNumber) +
    element('rank', entry.rank) +
    element('text', entry.note);

  return `<entry${attributes}>${body}</entry>`;
}

function activeStatusPunch(entry: MipEntry): MipPunch | undefined {
  if (entry.status !== 'Active') return undefined;
  if (entry.card !== null && entry.card !== undefined && entry.card > 0) {
    return { code: 0, card: entry.card, time: 0 };
  }
  if (entry.bibNumber !== null && entry.bibNumber !== undefined && entry.bibNumber > 0) {
    return { code: 0, startNumber: entry.bibNumber, time: 0 };
  }
  return undefined;
}

function renderPunch(punch: MipPunch): string {
  const identity =
    punch.card !== undefined ? attr('card', punch.card) : attr('sno', punch.startNumber);

  return `<p${attr('code', punch.code)}${identity}${attr('time', punch.time)}/>`;
}

export function renderMipDocument(document: MipDocument): string {
  const firstIdAttribute = document.firstId !== undefined ? attr('firstid', document.firstId) : '';
  const entries = document.entries
    .flatMap((entry) => {
      const punch = activeStatusPunch(entry);
      return punch ? [renderEntry(entry), renderPunch(punch)] : [renderEntry(entry)];
    })
    .join('');

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<MIPData xmlns="${MEOS_MIP_NAMESPACE}"${firstIdAttribute}${attr('lastid', document.lastId)}>` +
    entries +
    '</MIPData>'
  );
}
