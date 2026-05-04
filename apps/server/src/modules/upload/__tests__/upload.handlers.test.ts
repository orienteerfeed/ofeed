import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Sex } from '../../../generated/prisma/enums.js';
import { parseXmlForTesting } from '../upload.handlers.js';

const {
  checkXmlType,
  parseXml,
  findExistingClass,
  getCompetitorKeys,
  detectCompetitorChanges,
  extractTeamExternalId,
  resolveExistingTeam,
  normalizeIncomingSplits,
  isSplitWriteConflict,
  loadSplitCache,
} = parseXmlForTesting;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('upload.handlers testing helpers', () => {
  it('parseXml parses valid XML payload', async () => {
    const parsed = await parseXml(Buffer.from('<xml>test</xml>'));

    expect(parsed).toEqual({ xml: 'test' });
  });

  it('parseXml throws for invalid XML payload', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(parseXml(Buffer.from('<xml>test'))).rejects.toThrow('Error parsing file');

    expect(consoleErrorSpy).toHaveBeenCalledOnce();
  });

  it('checkXmlType returns only supported IOF XML root types', () => {
    const result = checkXmlType({
      ResultList: [{ id: 1 }],
      Unknown: [{ id: 2 }],
      CourseData: [{ id: 3 }],
    });

    expect(result).toEqual([
      { isArray: true, jsonKey: 'ResultList', jsonValue: [{ id: 1 }] },
      { isArray: true, jsonKey: 'CourseData', jsonValue: [{ id: 3 }] },
    ]);
  });
});

describe('findExistingClass', () => {
  const dbClassLists: { id: number; externalId: string | null; name: string; sex: Sex | null }[] = [
    { id: 1, externalId: '198732', name: 'D10C', sex: null },
    { id: 2, externalId: '10', name: 'H10', sex: null },
    { id: 3, externalId: null, name: 'D21', sex: null },
  ];

  it('matches by externalId when XML carries an Id', () => {
    expect(findExistingClass('198732', 'D10C', dbClassLists)).toEqual(dbClassLists[0]);
  });

  it('does not match by name when XML carries an Id but no row has that Id', () => {
    // Allows a producer with a different stable Id to coexist alongside the
    // same display name — caller will INSERT a new class.
    expect(findExistingClass('999999', 'D10C', dbClassLists)).toBeUndefined();
  });

  it('falls back to name match when XML omits the Id', () => {
    expect(findExistingClass(null, 'D21', dbClassLists)).toEqual(dbClassLists[2]);
  });

  it('matches by name even when the existing row has an externalId set', () => {
    // Producer that previously sent an Id and now sends none should still
    // resolve to the same class instead of creating a duplicate.
    expect(findExistingClass(null, 'H10', dbClassLists)).toEqual(dbClassLists[1]);
  });

  it('returns undefined when neither Id nor name matches', () => {
    expect(findExistingClass(null, 'NONEXISTENT', dbClassLists)).toBeUndefined();
  });
});

describe('getCompetitorKeys', () => {
  const person = (ids: Array<{ _: string; ATTR?: { type?: string } }>) =>
    ({ Id: ids, Name: [{ Family: ['Doe'], Given: ['Jane'] }] }) as never;

  it('prefers CZE id for registration and QuickEvent id for system', () => {
    const result = getCompetitorKeys(1, person([
      { _: '12345', ATTR: { type: 'CZE' } },
      { _: 'qe-99', ATTR: { type: 'QuickEvent' } },
      { _: 'oris-7', ATTR: { type: 'ORIS' } },
    ]));
    expect(result).toEqual({ registration: '12345', system: 'qe-99' });
  });

  it('falls back from QuickEvent to ORIS for system when QuickEvent missing', () => {
    const result = getCompetitorKeys(1, person([
      { _: 'oris-7', ATTR: { type: 'ORIS' } },
    ]));
    expect(result.system).toBe('oris-7');
  });

  it('falls back to first non-empty id for registration when CZE missing', () => {
    const result = getCompetitorKeys(1, person([
      { _: '   ', ATTR: { type: 'CZE' } },
      { _: 'fallback-id' },
    ]));
    expect(result.registration).toBe('fallback-id');
  });

  it('emits identical fallback hash for both keys when person.Id is empty', () => {
    const result = getCompetitorKeys(1, { Id: [], Name: [{ Family: ['X'], Given: ['Y'] }] } as never);
    expect(result.registration).toBe(result.system);
    expect(result.registration.length).toBeGreaterThan(0);
  });

  it('iterates person.Id only once (single-pass guarantee)', () => {
    const ids: Array<{ _: string; ATTR?: { type?: string } }> = [
      { _: 'a', ATTR: { type: 'ORIS' } },
      { _: 'b', ATTR: { type: 'QuickEvent' } },
      { _: 'c', ATTR: { type: 'CZE' } },
    ];
    let touches = 0;
    const proxy = new Proxy(ids, {
      get(target, prop, receiver) {
        if (prop === Symbol.iterator) touches += 1;
        return Reflect.get(target, prop, receiver);
      },
    });
    getCompetitorKeys(1, { Id: proxy, Name: [{ Family: ['Z'], Given: ['Q'] }] } as never);
    expect(touches).toBe(1);
  });
});

describe('detectCompetitorChanges', () => {
  const baseDb = {
    classId: 1,
    firstname: 'Jana',
    lastname: 'Nováková',
    nationality: 'CZE',
    registration: 'NOV9001',
    bibNumber: 12,
    startTime: new Date('2026-04-01T08:00:00Z'),
    finishTime: null,
    time: null,
    card: 87654,
    status: 'Inactive',
    leg: null,
  };

  it('returns empty array when all fields match', () => {
    const incoming = { ...baseDb, organisation: 'OK Praha', shortName: 'OKP' };
    const changes = detectCompetitorChanges(baseDb, incoming, {
      organisation: 'OK Praha',
      shortName: 'OKP',
    });
    expect(changes).toEqual([]);
  });

  it('detects status and time change in a single pass with stable order', () => {
    const incoming = {
      ...baseDb,
      organisation: 'OK Praha',
      shortName: 'OKP',
      time: 3601,
      status: 'OK',
      finishTime: new Date('2026-04-01T09:00:01Z'),
    };
    const changes = detectCompetitorChanges(baseDb, incoming, {
      organisation: 'OK Praha',
      shortName: 'OKP',
    });
    expect(changes.map((c) => c.type)).toEqual([
      'finish_time_change',
      'time_change',
      'status_change',
    ]);
    expect(changes.find((c) => c.type === 'time_change')?.newValue).toBe('3601');
  });

  it('detects organisation rename via override map (not flat DB row)', () => {
    const incoming = { ...baseDb, organisation: 'SK Karlovy Vary', shortName: 'SKK' };
    const changes = detectCompetitorChanges(baseDb, incoming, {
      organisation: 'OK Praha',
      shortName: 'OKP',
    });
    expect(changes.map((c) => c.type)).toEqual(['organisation_change', 'short_name_change']);
  });

  it('skips fields where incoming value is undefined (legacy teamId behaviour)', () => {
    const incoming = { ...baseDb, organisation: 'OK Praha', shortName: 'OKP' };
    // teamId not present on incoming → should not produce team_change even if DB has a value
    const dbWithTeam = { ...baseDb, teamId: 99 };
    const changes = detectCompetitorChanges(dbWithTeam, incoming, {
      organisation: 'OK Praha',
      shortName: 'OKP',
    });
    expect(changes.find((c) => c.type === 'team_change')).toBeUndefined();
  });

  it('treats date string and Date object with same timestamp as equal', () => {
    const incoming = {
      ...baseDb,
      organisation: 'OK Praha',
      shortName: 'OKP',
      startTime: '2026-04-01T08:00:00.000Z',
    };
    const changes = detectCompetitorChanges(baseDb, incoming, {
      organisation: 'OK Praha',
      shortName: 'OKP',
    });
    expect(changes.find((c) => c.type === 'start_time_change')).toBeUndefined();
  });
});

describe('extractTeamExternalId', () => {
  it('returns the EntryId string when present', () => {
    expect(extractTeamExternalId({ EntryId: ['369'], Name: ['VSP 1'] })).toBe('369');
  });

  it('returns null when EntryId is absent', () => {
    expect(extractTeamExternalId({ Name: ['VSP 1'] })).toBeNull();
  });

  it('returns null when EntryId array is empty', () => {
    expect(extractTeamExternalId({ EntryId: [], Name: ['VSP 1'] })).toBeNull();
  });

  it('returns null when EntryId contains only whitespace', () => {
    expect(extractTeamExternalId({ EntryId: ['   '], Name: ['VSP 1'] })).toBeNull();
  });

  it('trims surrounding whitespace from EntryId', () => {
    expect(extractTeamExternalId({ EntryId: [' 42 '], Name: ['Team A'] })).toBe('42');
  });
});

const mockPrisma = vi.hoisted(() => ({
  team: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  split: {
    findMany: vi.fn(),
  },
}));

vi.mock('../../../utils/context.js', () => ({ default: mockPrisma }));

describe('resolveExistingTeam', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('looks up by externalId first when available and returns the match', async () => {
    mockPrisma.team.findUnique.mockResolvedValue({ id: 7 });

    const result = await resolveExistingTeam('evt1', 3, '369', 782);

    expect(mockPrisma.team.findUnique).toHaveBeenCalledWith({
      where: { classId_externalId: { classId: 3, externalId: '369' } },
      select: { id: true },
    });
    expect(mockPrisma.team.findFirst).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 7 });
  });

  it('falls back to bibNumber lookup when externalId is not found', async () => {
    mockPrisma.team.findUnique.mockResolvedValue(null);
    mockPrisma.team.findFirst.mockResolvedValue({ id: 9 });

    const result = await resolveExistingTeam('evt1', 3, '999', 782);

    expect(mockPrisma.team.findUnique).toHaveBeenCalledTimes(1);
    expect(mockPrisma.team.findFirst).toHaveBeenCalledWith({
      where: { class: { eventId: 'evt1' }, bibNumber: 782 },
      select: { id: true },
    });
    expect(result).toEqual({ id: 9 });
  });

  it('skips externalId lookup and uses bibNumber directly when externalId is null', async () => {
    mockPrisma.team.findFirst.mockResolvedValue({ id: 5 });

    const result = await resolveExistingTeam('evt1', 3, null, 782);

    expect(mockPrisma.team.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.team.findFirst).toHaveBeenCalledWith({
      where: { class: { eventId: 'evt1' }, bibNumber: 782 },
      select: { id: true },
    });
    expect(result).toEqual({ id: 5 });
  });

  it('returns null when neither externalId match nor bibNumber match exists', async () => {
    mockPrisma.team.findUnique.mockResolvedValue(null);
    mockPrisma.team.findFirst.mockResolvedValue(null);

    const result = await resolveExistingTeam('evt1', 3, '999', 782);

    expect(result).toBeNull();
  });

  it('returns null without any DB call when both externalId and bibNumber are null', async () => {
    const result = await resolveExistingTeam('evt1', 3, null, null);

    expect(mockPrisma.team.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.team.findFirst).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});

describe('normalizeIncomingSplits', () => {
  it('returns empty array when result has no SplitTime', () => {
    expect(normalizeIncomingSplits({} as never)).toEqual([]);
  });

  it('returns empty array when SplitTime is an empty array', () => {
    expect(normalizeIncomingSplits({ SplitTime: [] } as never)).toEqual([]);
  });

  it('returns a single split with its time', () => {
    const result = normalizeIncomingSplits({
      SplitTime: [{ ControlCode: ['31'], Time: ['120'] }],
    } as never);
    expect(result).toEqual([{ controlCode: 31, time: 120 }]);
  });

  it('preserves IOF XML order — does not sort by controlCode', () => {
    const result = normalizeIncomingSplits({
      SplitTime: [
        { ControlCode: ['50'], Time: ['300'] },
        { ControlCode: ['31'], Time: ['120'] },
        { ControlCode: ['40'], Time: ['210'] },
      ],
    } as never);
    expect(result.map((s) => s.controlCode)).toEqual([50, 31, 40]);
  });

  it('preserves duplicate controlCodes in order (butterfly loops)', () => {
    // Control 31 appears twice — both entries must be kept, in order.
    const result = normalizeIncomingSplits({
      SplitTime: [
        { ControlCode: ['31'], Time: ['120'] },
        { ControlCode: ['32'], Time: ['180'] },
        { ControlCode: ['31'], Time: ['350'] },
      ],
    } as never);
    expect(result).toEqual([
      { controlCode: 31, time: 120 },
      { controlCode: 32, time: 180 },
      { controlCode: 31, time: 350 },
    ]);
  });

  it('stores null time when Time is absent', () => {
    const result = normalizeIncomingSplits({
      SplitTime: [{ ControlCode: ['31'] }],
    } as never);
    expect(result).toEqual([{ controlCode: 31, time: null }]);
  });

  it('stores null time when Time is not a valid integer', () => {
    const result = normalizeIncomingSplits({
      SplitTime: [{ ControlCode: ['31'], Time: ['abc'] }],
    } as never);
    expect(result).toEqual([{ controlCode: 31, time: null }]);
  });

  it('skips entries with a missing or non-integer ControlCode', () => {
    const result = normalizeIncomingSplits({
      SplitTime: [
        { ControlCode: ['notANumber'], Time: ['120'] },
        { ControlCode: ['31'], Time: ['180'] },
        { Time: ['999'] },
      ],
    } as never);
    expect(result).toEqual([{ controlCode: 31, time: 180 }]);
  });
});

describe('isSplitWriteConflict', () => {
  it('returns true for MariaDB "record has changed" message (single-quoted variant)', () => {
    expect(isSplitWriteConflict(new Error("Record has changed since last read in table 'Split'"))).toBe(true);
  });

  it('returns true for MariaDB "record has changed" message (double-quoted variant)', () => {
    expect(isSplitWriteConflict(new Error('Record has changed since last read in table "Split"'))).toBe(true);
  });

  it('returns true for a deadlock error', () => {
    expect(isSplitWriteConflict(new Error('Deadlock found when trying to get lock'))).toBe(true);
  });

  it('returns true for a Prisma P2034 code embedded in the message', () => {
    expect(isSplitWriteConflict(new Error('Transaction failed due to a write conflict or a deadlock. P2034'))).toBe(true);
  });

  it('returns true for a write conflict message', () => {
    expect(isSplitWriteConflict(new Error('write conflict detected in transaction'))).toBe(true);
  });

  it('returns true for transaction timeout', () => {
    expect(isSplitWriteConflict(new Error('Unable to start a transaction in the given time'))).toBe(true);
  });

  it('returns false for an unrelated error', () => {
    expect(isSplitWriteConflict(new Error('Unique constraint failed on the fields: `id`'))).toBe(false);
  });

  it('returns false when the value is not an Error instance', () => {
    expect(isSplitWriteConflict('deadlock')).toBe(false);
    expect(isSplitWriteConflict(null)).toBe(false);
    expect(isSplitWriteConflict(42)).toBe(false);
  });
});

describe('loadSplitCache', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns an empty Map immediately without a DB call when competitorIds is empty', async () => {
    const cache = await loadSplitCache([]);

    expect(mockPrisma.split.findMany).not.toHaveBeenCalled();
    expect(cache.size).toBe(0);
  });

  it('groups splits by competitorId correctly', async () => {
    mockPrisma.split.findMany.mockResolvedValue([
      { id: 1, competitorId: 10, controlCode: 31, time: 120 },
      { id: 2, competitorId: 10, controlCode: 40, time: 210 },
      { id: 3, competitorId: 20, controlCode: 31, time: 135 },
    ]);

    const cache = await loadSplitCache([10, 20]);

    expect(cache.get(10)).toEqual([
      { id: 1, controlCode: 31, time: 120 },
      { id: 2, controlCode: 40, time: 210 },
    ]);
    expect(cache.get(20)).toEqual([{ id: 3, controlCode: 31, time: 135 }]);
  });

  it('does not create a Map entry for a competitor with no splits in the DB', async () => {
    mockPrisma.split.findMany.mockResolvedValue([
      { id: 1, competitorId: 10, controlCode: 31, time: 120 },
    ]);

    const cache = await loadSplitCache([10, 99]);

    expect(cache.has(99)).toBe(false);
  });

  it('queries only for the supplied competitorIds', async () => {
    mockPrisma.split.findMany.mockResolvedValue([]);

    await loadSplitCache([5, 6, 7]);

    expect(mockPrisma.split.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { competitorId: { in: [5, 6, 7] } },
      }),
    );
  });
});
