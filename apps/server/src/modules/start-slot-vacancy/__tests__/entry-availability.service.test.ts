import { describe, expect, it, vi } from 'vitest';

import { listEventEntryAvailability } from '../start-slot-vacancy.service.js';

const DEADLINE = new Date('2026-06-10T23:59:59.000Z');

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    entriesOpenAt: new Date('2026-05-01T00:00:00.000Z'),
    entriesCloseAt: DEADLINE,
    defaultStartMode: 'StartList',
    vatPayer: false,
    vatRate: null,
    lateEntryFeePercent: null,
    currency: { iso4217Alpha3: 'CZK', name: 'Czech koruna' },
    classes: [],
    ...overrides,
  };
}

function makeClass(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    name: 'H21E',
    sex: 'M',
    minAge: null,
    maxAge: null,
    maxNumberOfCompetitors: 100,
    startMode: null,
    fee: null,
    startSlotVacancies: [],
    _count: { competitors: 0 },
    ...overrides,
  };
}

describe('listEventEntryAvailability', () => {
  it('returns null when event does not exist', async () => {
    const prisma = { event: { findUnique: vi.fn().mockResolvedValue(null) } };
    await expect(
      listEventEntryAvailability(prisma as never, 'missing-id'),
    ).resolves.toBeNull();
  });

  it('maps event-level metadata correctly', async () => {
    const prisma = {
      event: { findUnique: vi.fn().mockResolvedValue(makeEvent()) },
    };
    const result = await listEventEntryAvailability(prisma as never, 'event-1');
    expect(result?.currency).toEqual({ code: 'CZK', name: 'Czech koruna' });
    expect(result?.vatPayer).toBe(false);
    expect(result?.defaultStartMode).toBe('StartList');
  });

  it('StartList class: availableCount = vacancyCount, slots populated', async () => {
    const slot1 = { id: 1, startTime: new Date('2026-06-15T08:00:00.000Z'), bibNumber: 10 };
    const slot2 = { id: 2, startTime: new Date('2026-06-15T08:02:00.000Z'), bibNumber: null };
    const prisma = {
      event: {
        findUnique: vi.fn().mockResolvedValue(
          makeEvent({
            classes: [
              makeClass({
                startMode: null,
                startSlotVacancies: [slot1, slot2],
                _count: { competitors: 80 },
              }),
            ],
          }),
        ),
      },
    };

    const result = await listEventEntryAvailability(prisma as never, 'event-1');
    const cls = result!.classes[0];
    expect(cls.availableCount).toBe(2);
    expect(cls.isFull).toBe(false);
    expect(cls.slots).toEqual([slot1, slot2]);
    expect(cls.startMode).toBe('StartList');
    expect(cls.competitorCount).toBe(80);
  });

  it('FreeStart class: availableCount = max - competitorCount, slots empty', async () => {
    const prisma = {
      event: {
        findUnique: vi.fn().mockResolvedValue(
          makeEvent({
            classes: [
              makeClass({
                startMode: 'FreeStart',
                maxNumberOfCompetitors: 50,
                startSlotVacancies: [],
                _count: { competitors: 17 },
              }),
            ],
          }),
        ),
      },
    };

    const result = await listEventEntryAvailability(prisma as never, 'event-1');
    const cls = result!.classes[0];
    expect(cls.availableCount).toBe(33);
    expect(cls.slots).toEqual([]);
    expect(cls.startMode).toBe('FreeStart');
  });

  it('null max: availableCount = 0 for FreeStart', async () => {
    const prisma = {
      event: {
        findUnique: vi.fn().mockResolvedValue(
          makeEvent({
            classes: [
              makeClass({
                startMode: 'FreeStart',
                maxNumberOfCompetitors: null,
                _count: { competitors: 5 },
              }),
            ],
          }),
        ),
      },
    };

    const result = await listEventEntryAvailability(prisma as never, 'event-1');
    expect(result!.classes[0].availableCount).toBe(0);
    expect(result!.classes[0].isFull).toBe(true);
  });

  it('null max: availableCount = 0 and maxNumberOfCompetitors = 0 for StartSlot even if slots exist', async () => {
    const slot = { id: 1, startTime: new Date('2026-06-15T08:00:00.000Z'), bibNumber: null };
    const prisma = {
      event: {
        findUnique: vi.fn().mockResolvedValue(
          makeEvent({
            classes: [
              makeClass({
                startMode: null,
                maxNumberOfCompetitors: null,
                startSlotVacancies: [slot],
                _count: { competitors: 10 },
              }),
            ],
          }),
        ),
      },
    };

    const result = await listEventEntryAvailability(prisma as never, 'event-1');
    expect(result!.classes[0].availableCount).toBe(0);
    expect(result!.classes[0].maxNumberOfCompetitors).toBe(0);
    expect(result!.classes[0].isFull).toBe(true);
  });

  it('StartSlot: maxNumberOfCompetitors = min(dbMax, vacancyCount) and caps availableCount', async () => {
    const slots = Array.from({ length: 25 }, (_, i) => ({
      id: i + 1,
      startTime: new Date('2026-06-15T08:00:00.000Z'),
      bibNumber: null,
    }));
    const prisma = {
      event: {
        findUnique: vi.fn().mockResolvedValue(
          makeEvent({
            classes: [
              makeClass({
                startMode: null,
                maxNumberOfCompetitors: 120,
                startSlotVacancies: slots,
                _count: { competitors: 105 },
              }),
            ],
          }),
        ),
      },
    };

    const result = await listEventEntryAvailability(prisma as never, 'event-1');
    const cls = result!.classes[0];
    expect(cls.maxNumberOfCompetitors).toBe(25); // min(120, 25 slots)
    expect(cls.availableCount).toBe(15);          // min(25 slots, 120-105=15 headroom)
  });

  it('StartSlot: maxNumberOfCompetitors = dbMax when slots exceed dbMax', async () => {
    const slots = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      startTime: new Date('2026-06-15T08:00:00.000Z'),
      bibNumber: null,
    }));
    const prisma = {
      event: {
        findUnique: vi.fn().mockResolvedValue(
          makeEvent({
            classes: [
              makeClass({
                startMode: null,
                maxNumberOfCompetitors: 100,
                startSlotVacancies: slots,
                _count: { competitors: 10 },
              }),
            ],
          }),
        ),
      },
    };

    const result = await listEventEntryAvailability(prisma as never, 'event-1');
    const cls = result!.classes[0];
    expect(cls.maxNumberOfCompetitors).toBe(5);  // min(100, 5 slots)
    expect(cls.availableCount).toBe(5);           // min(5 slots, 100-10=90 headroom)
  });

  it('FreeStart: maxNumberOfCompetitors = dbMax (slots ignored)', async () => {
    const prisma = {
      event: {
        findUnique: vi.fn().mockResolvedValue(
          makeEvent({
            classes: [
              makeClass({
                startMode: 'FreeStart',
                maxNumberOfCompetitors: 50,
                startSlotVacancies: [],
                _count: { competitors: 17 },
              }),
            ],
          }),
        ),
      },
    };

    const result = await listEventEntryAvailability(prisma as never, 'event-1');
    expect(result!.classes[0].maxNumberOfCompetitors).toBe(50);
  });

  it('class inherits event defaultStartMode when startMode is null', async () => {
    const prisma = {
      event: {
        findUnique: vi.fn().mockResolvedValue(
          makeEvent({
            defaultStartMode: 'MassStart',
            classes: [makeClass({ startMode: null })],
          }),
        ),
      },
    };

    const result = await listEventEntryAvailability(prisma as never, 'event-1');
    expect(result!.classes[0].startMode).toBe('MassStart');
  });

  it('computes fee fields using computeClassFee', async () => {
    const prisma = {
      event: {
        findUnique: vi.fn().mockResolvedValue(
          makeEvent({
            entriesCloseAt: DEADLINE,
            vatPayer: true,
            vatRate: { toNumber: () => 21 },
            lateEntryFeePercent: null,
            classes: [
              makeClass({
                fee: { toNumber: () => 242 },
              }),
            ],
          }),
        ),
      },
    };

    const result = await listEventEntryAvailability(prisma as never, 'event-1');
    const cls = result!.classes[0];
    expect(cls.fee).toEqual({ amount: 242, net: 200, vat: 42 });
  });

  it('fee is null when no fee is configured on the class', async () => {
    const prisma = {
      event: {
        findUnique: vi.fn().mockResolvedValue(makeEvent({ classes: [makeClass({ fee: null })] })),
      },
    };
    const result = await listEventEntryAvailability(prisma as never, 'event-1');
    expect(result!.classes[0].fee).toBeNull();
  });

  it('calls prisma with the correct select shape', async () => {
    const prisma = {
      event: { findUnique: vi.fn().mockResolvedValue(makeEvent()) },
    };

    await listEventEntryAvailability(prisma as never, 'event-42');

    expect(prisma.event.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'event-42' },
      }),
    );
    const select = prisma.event.findUnique.mock.calls[0][0].select;
    expect(select.classes.select).toHaveProperty('startSlotVacancies');
    expect(select.classes.select).toHaveProperty('_count');
    expect(select.currency).toBeDefined();
  });
});
