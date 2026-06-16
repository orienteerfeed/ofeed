import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MopDocument } from '../meos.parser.js';

// ---------------------------------------------------------------------------
// Prisma mock
// ---------------------------------------------------------------------------

const mockPrisma = vi.hoisted(() => {
  const tx = {
    split: { deleteMany: vi.fn(), create: vi.fn() },
    protocol: { createMany: vi.fn(), deleteMany: vi.fn() },
    competitor: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    team: { deleteMany: vi.fn(), findFirst: vi.fn(), upsert: vi.fn() },
    class: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    organisation: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
  };
  return {
    ...tx,
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<void>) => fn(tx)),
    _tx: tx,
  };
});

vi.mock('../../../utils/context.js', () => ({ default: mockPrisma }));

// Convenience alias resolved after hoisting
const mockTx = mockPrisma._tx;

import {
  resetEventData,
  upsertMeosOrg,
  upsertMeosClass,
  upsertMeosCompetitor,
  upsertMeosTeam,
  deleteMeosCompetitor,
  deleteMeosOrg,
  processMopDocument,
} from '../meos.service.js';

const EVENT_ID = 'cltest123';
const EVENT = {
  id: EVENT_ID,
  date: new Date('2024-06-15T00:00:00.000Z'),
  timezone: 'Europe/Prague',
  authorId: 11,
};

function existingCompetitor(overrides: Record<string, unknown> = {}) {
  return {
    id: 555,
    classId: 7,
    firstname: 'Old',
    lastname: 'Name',
    nationality: null,
    registration: '',
    license: null,
    organisationId: null,
    organisation: null,
    card: null,
    bibNumber: null,
    startTime: null,
    finishTime: null,
    time: null,
    status: 'Inactive',
    lateStart: false,
    leg: null,
    note: null,
    externalId: null,
    splits: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default mocks for upsert/create
  mockTx.organisation.upsert.mockResolvedValue({ id: 10 });
  mockTx.organisation.create.mockResolvedValue({ id: 10 });
  mockTx.organisation.update.mockResolvedValue({ id: 10 });
  mockTx.class.upsert.mockResolvedValue({ id: 5 });
  mockTx.class.create.mockResolvedValue({ id: 5 });
  mockTx.class.update.mockResolvedValue({ id: 5 });
  mockTx.protocol.createMany.mockResolvedValue({ count: 1 });
  mockTx.competitor.create.mockResolvedValue({ id: 101, classId: 7 });
  mockTx.competitor.upsert.mockResolvedValue({ id: 101 });
  mockTx.competitor.update.mockResolvedValue({ id: 101 });
  mockTx.team.upsert.mockResolvedValue({ id: 300 });
  mockTx.split.deleteMany.mockResolvedValue({ count: 0 });
  mockTx.competitor.findFirst.mockResolvedValue(null);
  mockTx.class.findFirst.mockResolvedValue(null);
  mockTx.class.findMany.mockResolvedValue([]);
  mockTx.organisation.findFirst.mockResolvedValue(null);
  mockTx.organisation.findUnique.mockResolvedValue(null);
  mockTx.organisation.findMany.mockResolvedValue([]);
  mockTx.team.findFirst.mockResolvedValue(null);
  mockTx.competitor.updateMany.mockResolvedValue({ count: 0 });
});

// ---------------------------------------------------------------------------
// resetEventData
// ---------------------------------------------------------------------------

describe('resetEventData', () => {
  it('deletes in correct FK-safe order', async () => {
    const callOrder: string[] = [];
    mockTx.split.deleteMany.mockImplementation(async () => {
      callOrder.push('split');
      return { count: 0 };
    });
    mockTx.protocol.deleteMany.mockImplementation(async () => {
      callOrder.push('protocol');
      return { count: 0 };
    });
    mockTx.competitor.deleteMany.mockImplementation(async () => {
      callOrder.push('competitor');
      return { count: 0 };
    });
    mockTx.team.deleteMany.mockImplementation(async () => {
      callOrder.push('team');
      return { count: 0 };
    });
    mockTx.class.deleteMany.mockImplementation(async () => {
      callOrder.push('class');
      return { count: 0 };
    });
    mockTx.organisation.deleteMany.mockImplementation(async () => {
      callOrder.push('organisation');
      return { count: 0 };
    });

    await resetEventData(mockTx as never, EVENT_ID);

    expect(callOrder).toEqual(['split', 'protocol', 'competitor', 'team', 'class', 'organisation']);
  });
});

// ---------------------------------------------------------------------------
// upsertMeosOrg
// ---------------------------------------------------------------------------

describe('upsertMeosOrg', () => {
  it('creates an organisation and returns its DB id', async () => {
    mockTx.organisation.create.mockResolvedValue({ id: 42 });
    const org = { id: 10, name: 'SK Praga', nationality: 'CZE', shortName: 'SKP', delete: false };

    const result = await upsertMeosOrg(mockTx as never, EVENT_ID, org);

    expect(result).toBe(42);
    expect(mockTx.organisation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: EVENT_ID,
        externalId: '10',
        name: 'SK Praga',
      }),
      select: { id: true },
    });
  });

  it('links a MOP organisation to an existing IOF organisation by name', async () => {
    mockTx.organisation.findUnique.mockResolvedValue({ id: 42, externalId: '339' });
    const org = {
      id: 25,
      name: 'OK Skogsfalken',
      nationality: 'SWE',
      shortName: undefined,
      delete: false,
    };

    const result = await upsertMeosOrg(mockTx as never, EVENT_ID, org);

    expect(result).toBe(42);
    expect(mockTx.organisation.create).not.toHaveBeenCalled();
    expect(mockTx.organisation.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: {
        nationality: 'SWE',
      },
    });
  });

  it('falls back to organisation name when a mixed IOF/MOP external id points elsewhere', async () => {
    mockTx.organisation.findFirst.mockResolvedValue({ id: 7 });
    mockTx.organisation.findUnique.mockResolvedValue({ id: 42, externalId: '339' });
    const org = {
      id: 25,
      name: 'OK Skogsfalken',
      nationality: 'SWE',
      shortName: undefined,
      delete: false,
    };

    const result = await upsertMeosOrg(mockTx as never, EVENT_ID, org);

    expect(result).toBe(42);
    expect(mockTx.organisation.create).not.toHaveBeenCalled();
    expect(mockTx.organisation.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: {
        nationality: 'SWE',
      },
    });
  });
});

// ---------------------------------------------------------------------------
// upsertMeosClass
// ---------------------------------------------------------------------------

describe('upsertMeosClass', () => {
  it('creates a class and returns its DB id', async () => {
    mockTx.class.create.mockResolvedValue({ id: 7 });
    const cls = { id: 5, name: 'H21', ord: 1, radioCodes: [[31, 32]], delete: false };

    const result = await upsertMeosClass(mockTx as never, EVENT_ID, cls);

    expect(result).toBe(7);
    expect(mockTx.class.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventId: EVENT_ID, externalId: '5', name: 'H21' }),
      select: { id: true },
    });
  });
});

// ---------------------------------------------------------------------------
// upsertMeosCompetitor
// ---------------------------------------------------------------------------

describe('upsertMeosCompetitor', () => {
  it('creates a competitor with protocol and splits', async () => {
    const orgIdMap = new Map([[10, 42]]);
    const classIdMap = new Map([[5, 7]]);
    const cmp = {
      id: 101,
      card: 1234567,
      firstname: 'Štěpán',
      lastname: 'Novák',
      classId: 5,
      orgId: 10,
      bibNumber: 20,
      stat: 1,
      startTenths: 360000,
      runTimeTenths: 36000,
      splits: [
        { code: 31, tenths: 18000 },
        { code: 32, tenths: 27000 },
      ],
      delete: false,
    };

    await upsertMeosCompetitor(mockTx as never, EVENT_ID, cmp, orgIdMap, classIdMap, EVENT);

    expect(mockTx.competitor.create).toHaveBeenCalledOnce();
    const createCall = mockTx.competitor.create.mock.calls[0][0];
    expect(createCall.data).toMatchObject({
      classId: 7,
      organisationId: 42,
      externalId: '101',
      bibNumber: 20,
      card: 1234567,
      firstname: 'Štěpán',
      lastname: 'Novák',
      status: 'OK',
      finishTime: new Date('2024-06-15T09:00:00.000Z'),
      time: 3600,
    });
    expect(createCall.data.startTime.toISOString()).toBe('2024-06-15T08:00:00.000Z');
    expect(mockTx.protocol.createMany).toHaveBeenCalledWith({
      data: [
        {
          eventId: EVENT_ID,
          competitorId: 101,
          origin: 'IT',
          type: 'competitor_create',
          previousValue: null,
          newValue: 'Novák Štěpán',
          authorId: 11,
        },
      ],
    });
    expect(mockTx.split.create).toHaveBeenCalledTimes(2);
  });

  it('updates an existing competitor matched by name instead of creating a duplicate', async () => {
    mockTx.competitor.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingCompetitor());
    mockTx.competitor.update.mockResolvedValueOnce({ id: 555 });

    const cmp = {
      id: 23,
      card: 502266,
      firstname: 'Lennart',
      lastname: 'Ekman',
      classId: 1,
      orgId: 25,
      bibNumber: 26,
      stat: 0,
      startTenths: 678000,
      runTimeTenths: 0,
      splits: [],
      delete: false,
    };

    await upsertMeosCompetitor(
      mockTx as never,
      EVENT_ID,
      cmp,
      new Map([[25, 42]]),
      new Map([[1, 7]]),
      EVENT,
    );

    expect(mockTx.competitor.upsert).not.toHaveBeenCalled();
    expect(mockTx.competitor.create).not.toHaveBeenCalled();
    expect(mockTx.competitor.update).toHaveBeenCalledWith({
      where: { id: 555 },
      data: expect.objectContaining({
        classId: 7,
        externalId: '23',
        firstname: 'Lennart',
        lastname: 'Ekman',
        bibNumber: 26,
        card: 502266,
        organisationId: 42,
        status: 'Inactive',
      }),
      select: { id: true },
    });
    expect(mockTx.protocol.createMany).toHaveBeenCalled();
  });

  it('skips competitor if classId not in classIdMap', async () => {
    const cmp = {
      id: 200,
      card: 0,
      firstname: 'X',
      lastname: 'Y',
      classId: 999,
      orgId: undefined,
      stat: 0,
      startTenths: undefined,
      runTimeTenths: undefined,
      splits: [],
      delete: false,
    };

    await upsertMeosCompetitor(mockTx as never, EVENT_ID, cmp, new Map(), new Map(), EVENT);

    expect(mockTx.competitor.upsert).not.toHaveBeenCalled();
    expect(mockTx.competitor.create).not.toHaveBeenCalled();
    expect(mockTx.competitor.update).not.toHaveBeenCalled();
  });

  it('does not clear card, organisation, start or time when optional MOP attributes are absent', async () => {
    mockTx.competitor.findFirst.mockResolvedValueOnce(
      existingCompetitor({
        id: 101,
        classId: 7,
        firstname: 'A',
        lastname: 'B',
        status: 'Inactive',
      }),
    );
    const cmp = {
      id: 101,
      card: undefined,
      firstname: 'A',
      lastname: 'B',
      classId: 5,
      orgId: undefined,
      stat: 1,
      startTenths: undefined,
      runTimeTenths: undefined,
      splits: [],
      delete: false,
    };

    await upsertMeosCompetitor(mockTx as never, EVENT_ID, cmp, new Map(), new Map([[5, 7]]), EVENT);

    const updateData = mockTx.competitor.update.mock.calls[0][0].data;
    expect(updateData.card).toBeUndefined();
    expect(updateData.organisationId).toBeUndefined();
    expect(updateData.startTime).toBeUndefined();
    expect(updateData.finishTime).toBeUndefined();
    expect(updateData.time).toBeUndefined();
  });

  it('clears finishTime when the competitor has not finished but timing data is present', async () => {
    const cmp = {
      id: 102,
      card: 999,
      firstname: 'D',
      lastname: 'E',
      classId: 5,
      orgId: 10,
      bibNumber: 21,
      stat: 4,
      startTenths: 360000,
      runTimeTenths: 36000,
      splits: [],
      delete: false,
    };

    await upsertMeosCompetitor(
      mockTx as never,
      EVENT_ID,
      cmp,
      new Map([[10, 42]]),
      new Map([[5, 7]]),
      EVENT,
    );

    const createCall = mockTx.competitor.create.mock.calls[0][0];
    expect(createCall.data.finishTime).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// upsertMeosTeam
// ---------------------------------------------------------------------------

describe('upsertMeosTeam', () => {
  it('upserts a team with class and org ids resolved', async () => {
    const classIdMap = new Map([[5, 7]]);
    const orgIdMap = new Map([[10, 42]]);
    const tm = {
      id: 300,
      name: 'Rapid A',
      classId: 5,
      orgId: 10,
      bibNumber: 7,
      stat: 1,
      delete: false,
    };

    await upsertMeosTeam(mockTx as never, EVENT_ID, tm, classIdMap, orgIdMap);

    expect(mockTx.team.upsert).toHaveBeenCalledOnce();
    const call = mockTx.team.upsert.mock.calls[0][0];
    expect(call.create).toMatchObject({ classId: 7, organisationId: 42, bibNumber: 7 });
  });

  it('assigns team members and legs from MOP r element', async () => {
    const tm = {
      id: 300,
      name: 'Rapid A',
      classId: 5,
      orgId: 10,
      bibNumber: 7,
      stat: 1,
      members: [
        { competitorId: 101, leg: 1 },
        { competitorId: 102, leg: 2 },
      ],
      delete: false,
    };

    await upsertMeosTeam(mockTx as never, EVENT_ID, tm, new Map([[5, 7]]), new Map([[10, 42]]));

    expect(mockTx.competitor.updateMany).toHaveBeenCalledWith({
      where: { teamId: 300, class: { eventId: EVENT_ID } },
      data: { teamId: null, leg: null },
    });
    expect(mockTx.competitor.updateMany).toHaveBeenCalledWith({
      where: { externalId: '101', class: { eventId: EVENT_ID } },
      data: { teamId: 300, leg: 1 },
    });
    expect(mockTx.competitor.updateMany).toHaveBeenCalledWith({
      where: { externalId: '102', class: { eventId: EVENT_ID } },
      data: { teamId: 300, leg: 2 },
    });
  });

  it('skips team if classId not in classIdMap', async () => {
    const tm = {
      id: 400,
      name: 'X',
      classId: 999,
      orgId: undefined,
      bibNumber: 0,
      stat: 0,
      delete: false,
    };

    await upsertMeosTeam(mockTx as never, EVENT_ID, tm, new Map(), new Map());

    expect(mockTx.team.upsert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deleteMeosCompetitor
// ---------------------------------------------------------------------------

describe('deleteMeosCompetitor', () => {
  it('deletes splits, protocols, then competitor', async () => {
    mockTx.competitor.findFirst.mockResolvedValue({ id: 55 });

    await deleteMeosCompetitor(mockTx as never, EVENT_ID, 55);

    expect(mockTx.split.deleteMany).toHaveBeenCalledWith({ where: { competitorId: 55 } });
    expect(mockTx.protocol.deleteMany).toHaveBeenCalledWith({ where: { competitorId: 55 } });
    expect(mockTx.competitor.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ externalId: '55' }) }),
    );
  });

  it('removes protocol rows before the competitor to satisfy the FK constraint', async () => {
    // Regression: a competitor added then deleted in MeOS still has a
    // `competitor_create` protocol row referencing it. Deleting the competitor
    // before its protocols violates the Protocol → Competitor foreign key and
    // crashes the whole MOPDiff upload.
    mockTx.competitor.findFirst.mockResolvedValue({ id: 55 });

    const callOrder: string[] = [];
    mockTx.split.deleteMany.mockImplementation(async () => {
      callOrder.push('split');
      return { count: 0 };
    });
    mockTx.protocol.deleteMany.mockImplementation(async () => {
      callOrder.push('protocol');
      return { count: 1 };
    });
    mockTx.competitor.deleteMany.mockImplementation(async () => {
      callOrder.push('competitor');
      return { count: 1 };
    });

    await deleteMeosCompetitor(mockTx as never, EVENT_ID, 55);

    expect(callOrder).toEqual(['split', 'protocol', 'competitor']);
  });

  it('is a no-op if competitor not found', async () => {
    mockTx.competitor.findFirst.mockResolvedValue(null);

    await deleteMeosCompetitor(mockTx as never, EVENT_ID, 999);

    expect(mockTx.split.deleteMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deleteMeosOrg
// ---------------------------------------------------------------------------

describe('deleteMeosOrg', () => {
  it('deletes organisation by externalId scoped to eventId', async () => {
    await deleteMeosOrg(mockTx as never, EVENT_ID, 99);

    expect(mockTx.organisation.deleteMany).toHaveBeenCalledWith({
      where: { eventId: EVENT_ID, externalId: '99' },
    });
  });
});

// ---------------------------------------------------------------------------
// processMopDocument
// ---------------------------------------------------------------------------

describe('processMopDocument', () => {
  it('does not reset event data for MOPComplete', async () => {
    const doc: MopDocument = {
      rootType: 'MOPComplete',
      orgs: [],
      classes: [],
      competitors: [],
      teams: [],
    };

    await processMopDocument(EVENT_ID, doc, EVENT);

    expect(mockTx.split.deleteMany).not.toHaveBeenCalled();
    expect(mockTx.protocol.deleteMany).not.toHaveBeenCalled();
    expect(mockTx.competitor.deleteMany).not.toHaveBeenCalled();
    expect(mockTx.team.deleteMany).not.toHaveBeenCalled();
    expect(mockTx.class.deleteMany).not.toHaveBeenCalled();
    expect(mockTx.organisation.deleteMany).not.toHaveBeenCalled();
  });

  it('does NOT call resetEventData for MOPDiff', async () => {
    const doc: MopDocument = {
      rootType: 'MOPDiff',
      orgs: [],
      classes: [],
      competitors: [],
      teams: [],
    };

    await processMopDocument(EVENT_ID, doc, EVENT);

    expect(mockTx.organisation.deleteMany).not.toHaveBeenCalled();
    expect(mockTx.class.deleteMany).not.toHaveBeenCalled();
    expect(mockTx.competitor.deleteMany).not.toHaveBeenCalled();
  });

  it('processes orgs → classes → competitors → teams in order', async () => {
    const callOrder: string[] = [];
    mockTx.organisation.create.mockImplementation(async () => {
      callOrder.push('org');
      return { id: 10 };
    });
    mockTx.organisation.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 10, name: 'SK Praga', shortName: null });
    mockTx.class.create.mockImplementation(async () => {
      callOrder.push('class');
      return { id: 5 };
    });
    mockTx.competitor.create.mockImplementation(async () => {
      callOrder.push('competitor');
      return { id: 101, classId: 5 };
    });
    mockTx.team.upsert.mockImplementation(async () => {
      callOrder.push('team');
      return { id: 300 };
    });

    const doc: MopDocument = {
      rootType: 'MOPDiff',
      orgs: [{ id: 10, name: 'SK Praga', delete: false }],
      classes: [{ id: 5, name: 'H21', radioCodes: [], delete: false }],
      competitors: [
        {
          id: 101,
          card: 0,
          firstname: 'A',
          lastname: 'B',
          classId: 5,
          orgId: 10,
          stat: 1,
          startTenths: 0,
          runTimeTenths: 0,
          splits: [],
          delete: false,
        },
      ],
      teams: [
        { id: 300, name: 'Rapid A', classId: 5, orgId: 10, bibNumber: 0, stat: 1, delete: false },
      ],
    };

    await processMopDocument(EVENT_ID, doc, EVENT);

    expect(callOrder).toEqual(['org', 'class', 'competitor', 'team']);
  });

  it('loads existing class and organisation maps for MOPComplete competitor updates', async () => {
    mockTx.class.findMany.mockResolvedValue([{ id: 7, externalId: '5' }]);
    mockTx.organisation.findMany.mockResolvedValue([
      { id: 42, externalId: '10', name: 'SK Praga', shortName: null },
    ]);

    const doc: MopDocument = {
      rootType: 'MOPComplete',
      orgs: [],
      classes: [],
      competitors: [
        {
          id: 101,
          card: undefined,
          firstname: 'A',
          lastname: 'B',
          classId: 5,
          orgId: 10,
          stat: 1,
          startTenths: undefined,
          runTimeTenths: undefined,
          splits: [],
          delete: false,
        },
      ],
      teams: [],
    };

    const result = await processMopDocument(EVENT_ID, doc, EVENT);

    expect(mockTx.competitor.create).toHaveBeenCalledOnce();
    const call = mockTx.competitor.create.mock.calls[0][0];
    expect(call.data).toMatchObject({ organisationId: 42 });
    expect(result).toEqual({ updatedClassIds: [7], updatedCompetitorIds: [101] });
  });
});
