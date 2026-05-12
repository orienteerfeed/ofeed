import { describe, it, expect } from 'vitest';
import { parseMopDocument, mapMopStat, meosTimeToDateTime } from '../meos.parser.js';

const MOP_NS = 'http://www.melin.nu/mop';

const makeComplete = (inner: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><MOPComplete xmlns="${MOP_NS}">${inner}</MOPComplete>`;

const makeDiff = (inner: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><MOPDiff xmlns="${MOP_NS}">${inner}</MOPDiff>`;

describe('parseMopDocument', () => {
  it('returns null for invalid XML', () => {
    expect(parseMopDocument('<not valid xml<<')).toBeNull();
  });

  it('returns null for unsupported root element', () => {
    expect(parseMopDocument('<MOPStatus status="OK"></MOPStatus>')).toBeNull();
  });

  it('parses MOPComplete root type', () => {
    const doc = parseMopDocument(makeComplete(''));
    expect(doc).not.toBeNull();
    expect(doc!.rootType).toBe('MOPComplete');
  });

  it('parses MOPDiff root type', () => {
    const doc = parseMopDocument(makeDiff(''));
    expect(doc).not.toBeNull();
    expect(doc!.rootType).toBe('MOPDiff');
  });

  it('parses competition element', () => {
    const xml = makeComplete(
      `<competition date="2024-06-15" zeroTime="10:00:00" id="42" organizer="OK Jihlava">Test Race</competition>`,
    );
    const doc = parseMopDocument(xml);
    expect(doc!.competition).toEqual({
      id: 42,
      name: 'Test Race',
      date: '2024-06-15',
      zeroTime: '10:00:00',
      organizer: 'OK Jihlava',
    });
  });

  it('parses org elements', () => {
    const xml = makeDiff(
      `<org id="10" nat="CZE">SK Praga</org>` +
        `<org id="11" nat="SWE" short="IFK">IFK Göteborg</org>`,
    );
    const doc = parseMopDocument(xml);
    expect(doc!.orgs).toHaveLength(2);
    expect(doc!.orgs[0]).toEqual({
      id: 10,
      name: 'SK Praga',
      nationality: 'CZE',
      shortName: undefined,
      delete: false,
    });
    expect(doc!.orgs[1]).toEqual({
      id: 11,
      name: 'IFK Göteborg',
      nationality: 'SWE',
      shortName: 'IFK',
      delete: false,
    });
  });

  it('parses org delete flag', () => {
    const xml = makeDiff(`<org id="99" delete="true"></org>`);
    const doc = parseMopDocument(xml);
    expect(doc!.orgs[0]).toMatchObject({ id: 99, delete: true });
  });

  it('parses cls elements', () => {
    const xml = makeDiff(`<cls id="5" ord="1" radio="31,32;33">H21</cls>`);
    const doc = parseMopDocument(xml);
    expect(doc!.classes).toHaveLength(1);
    expect(doc!.classes[0]).toEqual({
      id: 5,
      name: 'H21',
      ord: 1,
      radioCodes: [[31, 32], [33]],
      delete: false,
    });
  });

  it('parses competitor with base and radio splits', () => {
    const xml = makeDiff(
      `<cmp id="101" card="1234567">` +
        `<base cls="5" org="10" stat="1" st="360000" rt="36000" bib="20">Štěpán Novák</base>` +
        `<radio>31,18000;32,27000</radio>` +
        `</cmp>`,
    );
    const doc = parseMopDocument(xml);
    expect(doc!.competitors).toHaveLength(1);
    const cmp = doc!.competitors[0];
    expect(cmp.id).toBe(101);
    expect(cmp.card).toBe(1234567);
    expect(cmp.firstname).toBe('Štěpán');
    expect(cmp.lastname).toBe('Novák');
    expect(cmp.classId).toBe(5);
    expect(cmp.orgId).toBe(10);
    expect(cmp.bibNumber).toBe(20);
    expect(cmp.stat).toBe(1);
    expect(cmp.startTenths).toBe(360000);
    expect(cmp.runTimeTenths).toBe(36000);
    expect(cmp.splits).toEqual([
      { code: 31, tenths: 18000 },
      { code: 32, tenths: 27000 },
    ]);
    expect(cmp.delete).toBe(false);
  });

  it('parses competitor with single-word name', () => {
    const xml = makeDiff(`<cmp id="200"><base cls="5" org="10" stat="20">Åsa</base></cmp>`);
    const doc = parseMopDocument(xml);
    const cmp = doc!.competitors[0];
    expect(cmp.firstname).toBe('Åsa');
    expect(cmp.lastname).toBe('');
    expect(cmp.card).toBeUndefined();
    expect(cmp.bibNumber).toBeUndefined();
    expect(cmp.startTenths).toBeUndefined();
    expect(cmp.runTimeTenths).toBeUndefined();
  });

  it('ignores invalid bib values', () => {
    const xml = makeDiff(`<cmp id="201"><base cls="5" org="10" bib="20A" stat="1">Test Runner</base></cmp>`);
    const doc = parseMopDocument(xml);
    expect(doc!.competitors[0].bibNumber).toBeUndefined();
  });

  it('parses competitor delete flag', () => {
    const xml = makeDiff(`<cmp id="55" delete="true"></cmp>`);
    const doc = parseMopDocument(xml);
    expect(doc!.competitors[0]).toMatchObject({ id: 55, delete: true });
  });

  it('parses team element', () => {
    const xml = makeDiff(
      `<tm id="300"><base cls="5" org="10" bib="7" stat="1">Rapid A</base><r>101;102,103</r></tm>`,
    );
    const doc = parseMopDocument(xml);
    expect(doc!.teams).toHaveLength(1);
    expect(doc!.teams[0]).toEqual({
      id: 300,
      name: 'Rapid A',
      classId: 5,
      orgId: 10,
      bibNumber: 7,
      stat: 1,
      members: [
        { competitorId: 101, leg: 1 },
        { competitorId: 102, leg: 2 },
        { competitorId: 103, leg: 2 },
      ],
      delete: false,
    });
  });

  it('parses team delete flag', () => {
    const xml = makeDiff(`<tm id="77" delete="true"></tm>`);
    const doc = parseMopDocument(xml);
    expect(doc!.teams[0]).toMatchObject({ id: 77, delete: true });
  });

  it('handles empty radio element', () => {
    const xml = makeDiff(
      `<cmp id="102" card="0"><base cls="5" org="10" stat="1" st="0" rt="0">Test Runner</base><radio></radio></cmp>`,
    );
    const doc = parseMopDocument(xml);
    expect(doc!.competitors[0].splits).toEqual([]);
  });
});

describe('mapMopStat', () => {
  it.each([
    [0, 'Inactive'],
    [1, 'OK'],
    [2, 'OK'],
    [3, 'MissingPunch'],
    [4, 'DidNotFinish'],
    [5, 'Disqualified'],
    [6, 'OverTime'],
    [15, 'NotCompeting'],
    [20, 'DidNotStart'],
    [21, 'Cancelled'],
    [99, 'NotCompeting'],
    [42, 'Inactive'],
  ])('maps MOP stat %i → %s', (stat, expected) => {
    expect(mapMopStat(stat)).toBe(expected);
  });
});

describe('meosTimeToDateTime', () => {
  it('converts tenths-of-second from midnight to DateTime', () => {
    const eventDate = new Date('2024-06-15T00:00:00.000Z');
    // 36000 tenths = 3600 seconds = 1 hour = 01:00:00 UTC
    const result = meosTimeToDateTime(36000, eventDate);
    expect(result.toISOString()).toBe('2024-06-15T01:00:00.000Z');
  });

  it('converts zero tenths to midnight', () => {
    const eventDate = new Date('2024-06-15T00:00:00.000Z');
    const result = meosTimeToDateTime(0, eventDate);
    expect(result.toISOString()).toBe('2024-06-15T00:00:00.000Z');
  });

  it('converts MOP local time using event timezone', () => {
    const eventDate = new Date('2026-05-12T00:00:00.000Z');
    // 648000 tenths = 18:00:00 local Prague time, which is 16:00 UTC in CEST.
    const result = meosTimeToDateTime(648000, eventDate, 'Europe/Prague');
    expect(result.toISOString()).toBe('2026-05-12T16:00:00.000Z');
  });
});
