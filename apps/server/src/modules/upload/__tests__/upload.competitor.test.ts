import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  detectCompetitorChanges,
  normalizeOrganisationInput,
  upsertCompetitor,
} from '../upload.competitor.js';
import * as subscriptionUtils from '../../../utils/subscriptionUtils.js';

// ---------------------------------------------------------------------------
// Prisma mock shared by upsertCompetitor tests
// ---------------------------------------------------------------------------

const mockTransaction = vi.fn();
const mockPrisma = vi.hoisted(() => ({
  competitor: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  protocol: { createMany: vi.fn() },
  organisation: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock('../../../utils/context.js', () => ({ default: mockPrisma }));
vi.mock('../../../utils/subscriptionUtils.js', () => ({
  publishUpdatedCompetitor: vi.fn(),
}));

// ---------------------------------------------------------------------------
// normalizeOrganisationInput
// ---------------------------------------------------------------------------

describe('normalizeOrganisationInput', () => {
  it('returns name and shortName when both are present', () => {
    expect(normalizeOrganisationInput({ name: 'Sportcentrum Jičín', shortName: 'SJC' })).toEqual({
      effectiveName: 'Sportcentrum Jičín',
      effectiveShortName: 'SJC',
    });
  });

  it('trims whitespace from both fields', () => {
    expect(normalizeOrganisationInput({ name: '  OK Lokomotiva  ', shortName: '  LPU  ' })).toEqual(
      { effectiveName: 'OK Lokomotiva', effectiveShortName: 'LPU' },
    );
  });

  it('returns null effectiveName when name is empty string, even if shortName is present', () => {
    // <Name></Name><ShortName>NNN</ShortName>: name="" → null, no org will be
    // created, so effectiveShortName must also be null to prevent false
    // short_name_change protocol entries on every re-import.
    expect(normalizeOrganisationInput({ name: '', shortName: 'NNN' })).toEqual({
      effectiveName: null,
      effectiveShortName: null,
    });
  });

  it('returns null effectiveName when name is whitespace-only', () => {
    expect(normalizeOrganisationInput({ name: '   ', shortName: 'NNN' })).toEqual({
      effectiveName: null,
      effectiveShortName: null,
    });
  });

  it('returns null effectiveName when name is null', () => {
    expect(normalizeOrganisationInput({ name: null, shortName: 'NNN' })).toEqual({
      effectiveName: null,
      effectiveShortName: null,
    });
  });

  it('returns null effectiveName when name is undefined', () => {
    expect(normalizeOrganisationInput({ name: undefined, shortName: 'NNN' })).toEqual({
      effectiveName: null,
      effectiveShortName: null,
    });
  });

  it('returns both null when name and shortName are both null', () => {
    expect(normalizeOrganisationInput({ name: null, shortName: null })).toEqual({
      effectiveName: null,
      effectiveShortName: null,
    });
  });

  it('converts empty-string shortName to null when name is valid', () => {
    expect(normalizeOrganisationInput({ name: 'Club A', shortName: '' })).toEqual({
      effectiveName: 'Club A',
      effectiveShortName: null,
    });
  });

  it('returns null effectiveShortName when shortName is null and name is valid', () => {
    expect(normalizeOrganisationInput({ name: 'Club A', shortName: null })).toEqual({
      effectiveName: 'Club A',
      effectiveShortName: null,
    });
  });
});

// ---------------------------------------------------------------------------
// detectCompetitorChanges — organisation / shortName scenarios
// ---------------------------------------------------------------------------

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

describe('detectCompetitorChanges — repeated identical import (no false org entries)', () => {
  it('creates no entries when competitor has no org and XML sends no org', () => {
    const incoming = { ...baseDb, organisation: null, shortName: null };
    const changes = detectCompetitorChanges(baseDb, incoming, {
      organisation: null,
      shortName: null,
    });
    expect(changes).toEqual([]);
  });

  it('creates no entries when XML sends empty name + shortName and DB has no org (re-import)', () => {
    // normalizeOrganisationInput: effectiveName=null, effectiveShortName=null.
    // upsertOrganisation: !name && !externalId → returns null, no org created.
    // DB: organisationId=null → both previous values null → no diff.
    const incoming = { ...baseDb, organisation: null, shortName: null };
    const changes = detectCompetitorChanges(baseDb, incoming, {
      organisation: null,
      shortName: null,
    });
    expect(changes.find((c) => c.type === 'organisation_change')).toBeUndefined();
    expect(changes.find((c) => c.type === 'short_name_change')).toBeUndefined();
  });

  it('creates no entries when valid org is re-imported with same name and shortName', () => {
    const incoming = { ...baseDb, organisation: 'Sportcentrum Jičín', shortName: 'SJC' };
    const changes = detectCompetitorChanges(baseDb, incoming, {
      organisation: 'Sportcentrum Jičín',
      shortName: 'SJC',
    });
    expect(changes).toEqual([]);
  });

  it('creates no entries when sameOrgByExternalId and XML display name differs from DB', () => {
    // buildCompetitorSnapshot replaces incoming org values with DB values when
    // the incoming externalId matches the stored org's externalId.
    const dbOrgName = 'Bourgogne-Franche-Comté';
    const incoming = { ...baseDb, organisation: dbOrgName, shortName: null };
    const changes = detectCompetitorChanges(baseDb, incoming, {
      organisation: dbOrgName,
      shortName: null,
    });
    expect(changes).toEqual([]);
  });
});

describe('detectCompetitorChanges — organisation actually changes', () => {
  it('emits organisation_change and short_name_change when org is assigned for first time', () => {
    const incoming = { ...baseDb, organisation: 'OK Lokomotiva Pardubice', shortName: 'LPU' };
    const changes = detectCompetitorChanges(baseDb, incoming, {
      organisation: null,
      shortName: null,
    });
    const orgChange = changes.find((c) => c.type === 'organisation_change');
    const shortChange = changes.find((c) => c.type === 'short_name_change');
    expect(orgChange?.previousValue).toBeNull();
    expect(orgChange?.newValue).toBe('OK Lokomotiva Pardubice');
    expect(shortChange?.previousValue).toBeNull();
    expect(shortChange?.newValue).toBe('LPU');
  });

  it('emits only organisation_change (not short_name_change) when XML has name + no shortName', () => {
    // effectiveShortName = null when shortName is absent → no short_name_change
    const incoming = { ...baseDb, organisation: 'Club A', shortName: null };
    const changes = detectCompetitorChanges(baseDb, incoming, {
      organisation: null,
      shortName: null,
    });
    expect(changes.find((c) => c.type === 'organisation_change')).toBeDefined();
    expect(changes.find((c) => c.type === 'short_name_change')).toBeUndefined();
  });

  it('emits organisation_change when org name changes between imports', () => {
    const incoming = { ...baseDb, organisation: 'SK Nový Klub', shortName: 'SNK' };
    const changes = detectCompetitorChanges(baseDb, incoming, {
      organisation: 'OK Starý Klub',
      shortName: 'OSK',
    });
    const orgChange = changes.find((c) => c.type === 'organisation_change');
    expect(orgChange?.previousValue).toBe('OK Starý Klub');
    expect(orgChange?.newValue).toBe('SK Nový Klub');
  });

  it('emits organisation_change when org is removed (name becomes null)', () => {
    const incoming = { ...baseDb, organisation: null, shortName: null };
    const changes = detectCompetitorChanges(baseDb, incoming, {
      organisation: 'Sportcentrum Jičín',
      shortName: 'SJC',
    });
    const orgChange = changes.find((c) => c.type === 'organisation_change');
    expect(orgChange?.previousValue).toBe('Sportcentrum Jičín');
    expect(orgChange?.newValue).toBeNull();
  });

  it('emits short_name_change when shortName is added to an existing org', () => {
    const incoming = { ...baseDb, organisation: 'Club A', shortName: 'CA' };
    const changes = detectCompetitorChanges(baseDb, incoming, {
      organisation: 'Club A',
      shortName: null,
    });
    expect(changes.find((c) => c.type === 'organisation_change')).toBeUndefined();
    const shortChange = changes.find((c) => c.type === 'short_name_change');
    expect(shortChange?.previousValue).toBeNull();
    expect(shortChange?.newValue).toBe('CA');
  });
});

// ---------------------------------------------------------------------------
// upsertCompetitor — authorId is threaded to protocol rows
// ---------------------------------------------------------------------------

const minimalPerson = {
  Id: [{ _: 'REG001', ATTR: { type: 'CZE' } }],
  Name: [{ Family: ['Novák'], Given: ['Jan'] }],
  Nationality: [{ ATTR: { code: 'CZE' } }],
};

describe('upsertCompetitor — authorId written to protocol', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('writes the caller-supplied authorId to competitor_create protocol row (JWT user scenario)', async () => {
    // Organisation lookup returns null (no org for this competitor).
    mockPrisma.organisation.findFirst.mockResolvedValue(null);
    mockPrisma.organisation.upsert.mockResolvedValue(null);

    // No existing competitor → insert path.
    mockPrisma.competitor.findUnique.mockResolvedValue(null);

    const createdId = 42;
    let capturedProtocolData: any[] = [];
    mockPrisma.$transaction.mockImplementation(async (cb) => {
      const txProxy = {
        competitor: {
          create: vi.fn().mockResolvedValue({ id: createdId }),
        },
        protocol: {
          createMany: vi.fn().mockImplementation(({ data }) => {
            capturedProtocolData = data;
            return Promise.resolve({ count: data.length });
          }),
        },
      };
      return cb(txProxy);
    });

    const JWT_USER_ID = 7;
    const result = await upsertCompetitor(
      'event-abc',
      1,
      minimalPerson as never,
      null,
      null,
      null,
      'UTC',
      null,
      null,
      JWT_USER_ID,
    );

    expect(result).toEqual({ id: createdId, updated: true });
    expect(capturedProtocolData).toHaveLength(1);
    expect(capturedProtocolData[0]).toMatchObject({
      type: 'competitor_create',
      authorId: JWT_USER_ID,
    });
  });

  it('writes the event-creator authorId to competitor_create protocol row (Basic Auth scenario)', async () => {
    mockPrisma.organisation.findFirst.mockResolvedValue(null);
    mockPrisma.competitor.findUnique.mockResolvedValue(null);

    let capturedProtocolData: any[] = [];
    mockPrisma.$transaction.mockImplementation(async (cb) => {
      const txProxy = {
        competitor: { create: vi.fn().mockResolvedValue({ id: 99 }) },
        protocol: {
          createMany: vi.fn().mockImplementation(({ data }) => {
            capturedProtocolData = data;
            return Promise.resolve({ count: data.length });
          }),
        },
      };
      return cb(txProxy);
    });

    const EVENT_CREATOR_ID = 3; // resolved from event.authorId for Basic Auth
    await upsertCompetitor(
      'event-abc',
      1,
      minimalPerson as never,
      null,
      null,
      null,
      'UTC',
      null,
      null,
      EVENT_CREATOR_ID,
    );

    expect(capturedProtocolData[0]).toMatchObject({
      type: 'competitor_create',
      authorId: EVENT_CREATOR_ID,
    });
  });

  it('writes the caller-supplied authorId to update protocol rows', async () => {
    mockPrisma.organisation.findFirst.mockResolvedValue(null);

    const dbCompetitor = {
      id: 10,
      classId: 1,
      firstname: 'Jan',
      lastname: 'Novák',
      nationality: 'SVK', // different → triggers update
      registration: 'REG001',
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
      externalId: 'REG001',
    };
    mockPrisma.competitor.findUnique.mockResolvedValue(dbCompetitor);

    let capturedProtocolData: any[] = [];
    mockPrisma.$transaction.mockImplementation(async (cb) => {
      const txProxy = {
        competitor: { update: vi.fn().mockResolvedValue({}) },
        protocol: {
          createMany: vi.fn().mockImplementation(({ data }) => {
            capturedProtocolData = data;
            return Promise.resolve({ count: data.length });
          }),
        },
      };
      return cb(txProxy);
    });

    const JWT_USER_ID = 5;
    await upsertCompetitor(
      'event-abc',
      1,
      minimalPerson as never,
      null,
      null,
      null,
      'UTC',
      null,
      null,
      JWT_USER_ID,
    );

    expect(capturedProtocolData.length).toBeGreaterThan(0);
    for (const row of capturedProtocolData) {
      expect(row.authorId).toBe(JWT_USER_ID);
    }
  });

  it('updates the existing event competitor when an import moves them to another class', async () => {
    mockPrisma.organisation.findFirst.mockResolvedValue(null);
    mockPrisma.competitor.findUnique.mockResolvedValue(null);

    const dbCompetitor = {
      id: 10,
      classId: 1,
      firstname: 'Jan',
      lastname: 'Novák',
      nationality: 'CZE',
      registration: 'REG001',
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
      externalId: 'REG001',
    };
    mockPrisma.competitor.findFirst.mockResolvedValue(dbCompetitor);

    let capturedUpdateData: any;
    let capturedProtocolData: any[] = [];
    mockPrisma.$transaction.mockImplementation(async (cb) => {
      const txProxy = {
        competitor: {
          update: vi.fn().mockImplementation(({ data }) => {
            capturedUpdateData = data;
            return Promise.resolve({});
          }),
        },
        protocol: {
          createMany: vi.fn().mockImplementation(({ data }) => {
            capturedProtocolData = data;
            return Promise.resolve({ count: data.length });
          }),
        },
      };
      return cb(txProxy);
    });

    const result = await upsertCompetitor(
      'event-abc',
      2,
      minimalPerson as never,
      null,
      null,
      null,
      'UTC',
      null,
      null,
      5,
    );

    expect(result).toEqual({ id: 10, updated: true });
    expect(mockPrisma.competitor.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { class: { eventId: 'event-abc' }, externalId: 'REG001' },
      }),
    );
    expect(capturedUpdateData.class).toEqual({ connect: { id: 2 } });
    expect(capturedProtocolData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'class_change',
          previousValue: '1',
          newValue: '2',
        }),
      ]),
    );
  });

  it('does not reference IOF_IMPORT_AUTHOR_ID — constant is absent from the module', async () => {
    // This test fails at import time if the constant is still exported,
    // providing a compile-time + runtime safety net.
    const mod = await import('../upload.constants.js');
    expect((mod as any).IOF_IMPORT_AUTHOR_ID).toBeUndefined();
  });

  it('does NOT call publishUpdatedCompetitor during the update path (publish is class-level only)', async () => {
    mockPrisma.organisation.findFirst.mockResolvedValue(null);

    const dbCompetitor = {
      id: 20,
      classId: 1,
      firstname: 'Jan',
      lastname: 'Novák',
      nationality: 'SVK', // different from incoming CZE → triggers update
      registration: 'REG001',
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
      externalId: 'REG001',
    };
    mockPrisma.competitor.findUnique.mockResolvedValue(dbCompetitor);
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => {
      const txProxy = {
        competitor: { update: vi.fn().mockResolvedValue({}) },
        protocol: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      };
      return cb(txProxy);
    });

    await upsertCompetitor(
      'event-abc',
      1,
      minimalPerson as never,
      null,
      null,
      null,
      'UTC',
      null,
      null,
      5,
    );

    expect(subscriptionUtils.publishUpdatedCompetitor).not.toHaveBeenCalled();
  });
});
