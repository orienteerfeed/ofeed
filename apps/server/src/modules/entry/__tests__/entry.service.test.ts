import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockStoreCompetitor = vi.hoisted(() => vi.fn());
const mockNotifyEntryOrderReceived = vi.hoisted(() => vi.fn());
const mockNotifyEntryOrderProcessed = vi.hoisted(() => vi.fn());

vi.mock('../../event/event.service.js', () => ({
  storeCompetitor: mockStoreCompetitor,
}));

vi.mock('../entry.email.js', () => ({
  notifyEntryOrderReceived: mockNotifyEntryOrderReceived,
  notifyEntryOrderProcessed: mockNotifyEntryOrderProcessed,
}));

import type { EntryOrderItemInput } from '@repo/shared';

import { ConflictError, NotFoundError, ValidationError } from '../../../exceptions/index.js';
import {
  computeEntryOrderTotal,
  createEntryOrder,
  generatePaymentReference,
  getEventEntryStats,
  priceEntryOrderItems,
  processEntryOrder,
  updateEntryOrderForGraphQL,
  type EntryOrderClassInfo,
  type EntryOrderPricingContext,
} from '../entry.service.js';
import { hasEntryOrderAccess } from '../entry-public-access.js';

const NOW = new Date('2026-07-02T10:00:00.000Z');
const SLOT_A = new Date('2026-07-10T08:00:00.000Z');
const SLOT_B = new Date('2026-07-10T08:02:00.000Z');

function makeClass(overrides: Partial<EntryOrderClassInfo> = {}): EntryOrderClassInfo {
  return {
    id: 10,
    name: 'H21',
    minAge: null,
    maxAge: null,
    maxNumberOfCompetitors: 50,
    startMode: 'FreeStart',
    fee: 100,
    lateEntryFeeDisabled: false,
    competitorCount: 0,
    slotStartTimes: [],
    ...overrides,
  };
}

function makeContext(overrides: Partial<EntryOrderPricingContext> = {}): EntryOrderPricingContext {
  return {
    now: NOW,
    entriesCloseAt: new Date('2026-07-08T23:59:59.000Z'),
    lateEntryFeePercent: null,
    vatPayer: false,
    vatRate: null,
    defaultStartMode: 'StartList',
    cardRental: { enabled: true, price: 50 },
    ...overrides,
  };
}

function makeItem(overrides: Partial<EntryOrderItemInput> = {}): EntryOrderItemInput {
  return {
    classId: 10,
    firstname: 'Jan',
    lastname: 'Novak',
    registration: 'CHC9501',
    cardRental: false,
    card: 8123456,
    ...overrides,
  };
}

describe('getEventEntryStats', () => {
  it('counts submitted Entry records instead of propagated competitors', async () => {
    const prisma = {
      entry: { count: vi.fn().mockResolvedValue(7) },
      protocol: { count: vi.fn().mockResolvedValue(3) },
    };

    await expect(getEventEntryStats(prisma as never, 'event-1')).resolves.toEqual({
      entriesCount: 7,
      changesCount: 3,
    });

    expect(prisma.entry.count).toHaveBeenCalledWith({ where: { eventId: 'event-1' } });
    expect(prisma.protocol.count).toHaveBeenCalledWith({ where: { eventId: 'event-1' } });
  });
});

describe('priceEntryOrderItems', () => {
  it('prices a plain FreeStart item with the class fee', () => {
    const [priced] = priceEntryOrderItems([makeItem()], [makeClass()], makeContext());

    expect(priced).toMatchObject({
      classId: 10,
      firstname: 'Jan',
      lastname: 'Novak',
      registration: 'CHC9501',
      birthYear: 1995,
      card: 8123456,
      cardRental: false,
      startTime: null,
      fee: 100,
      cardRentalFee: null,
    });
  });

  it('rejects an unknown class', () => {
    expect(() =>
      priceEntryOrderItems([makeItem({ classId: 99 })], [makeClass()], makeContext()),
    ).toThrow(ValidationError);
  });

  it('rejects a full class', () => {
    const cls = makeClass({ maxNumberOfCompetitors: 10, competitorCount: 10 });
    expect(() => priceEntryOrderItems([makeItem()], [cls], makeContext())).toThrow(ConflictError);
  });

  it('counts earlier items of the same order against the remaining capacity', () => {
    const cls = makeClass({ maxNumberOfCompetitors: 10, competitorCount: 9 });
    expect(() => priceEntryOrderItems([makeItem(), makeItem()], [cls], makeContext())).toThrow(
      ConflictError,
    );
  });

  it('rejects a birth year outside the class limits', () => {
    // minAge 14 / maxAge 20 with reference year 2026 -> birth years 2006..2012.
    const cls = makeClass({ minAge: 14, maxAge: 20 });
    expect(() =>
      priceEntryOrderItems(
        [makeItem({ registration: undefined, birthYear: 1995 })],
        [cls],
        makeContext(),
      ),
    ).toThrow(/not allowed in class/);
  });

  it('derives the birth year from the registration for eligibility', () => {
    const cls = makeClass({ minAge: 14, maxAge: 40 }); // 1986..2012
    const [priced] = priceEntryOrderItems(
      [makeItem({ registration: 'CHC9501' })],
      [cls],
      makeContext(),
    );
    expect(priced.birthYear).toBe(1995);
  });

  it('rejects an age-restricted class when no birth year can be resolved', () => {
    const cls = makeClass({ minAge: 14 });
    const item = { ...makeItem(), registration: undefined, birthYear: undefined };
    expect(() => priceEntryOrderItems([item], [cls], makeContext())).toThrow(/age-restricted/);
  });

  it('requires a start time for slot-based start modes', () => {
    const cls = makeClass({ startMode: 'StartList', slotStartTimes: [SLOT_A] });
    expect(() => priceEntryOrderItems([makeItem()], [cls], makeContext())).toThrow(
      /start time selection is required/i,
    );
  });

  it('accepts a matching start slot and records it', () => {
    const cls = makeClass({ startMode: 'StartList', slotStartTimes: [SLOT_A, SLOT_B] });
    const [priced] = priceEntryOrderItems(
      [makeItem({ startTime: SLOT_A.toISOString() })],
      [cls],
      makeContext(),
    );
    expect(priced.startTime).toEqual(SLOT_A);
  });

  it('rejects a start time that has no vacancy', () => {
    const cls = makeClass({ startMode: 'StartList', slotStartTimes: [SLOT_A] });
    expect(() =>
      priceEntryOrderItems([makeItem({ startTime: SLOT_B.toISOString() })], [cls], makeContext()),
    ).toThrow(/not available/);
  });

  it('rejects two items claiming the same slot within one order', () => {
    const cls = makeClass({ startMode: 'StartList', slotStartTimes: [SLOT_A, SLOT_B] });
    const items = [
      makeItem({ startTime: SLOT_A.toISOString() }),
      makeItem({ startTime: SLOT_A.toISOString() }),
    ];
    expect(() => priceEntryOrderItems(items, [cls], makeContext())).toThrow(
      /already taken by another entry in this order/,
    );
  });

  it('falls back to the event default start mode when the class has none', () => {
    const cls = makeClass({ startMode: null, slotStartTimes: [SLOT_A] });
    // Event default is StartList -> slot required.
    expect(() => priceEntryOrderItems([makeItem()], [cls], makeContext())).toThrow(
      /start time selection is required/i,
    );
  });

  it('charges the card rental price as an extra item fee', () => {
    const [priced] = priceEntryOrderItems(
      [makeItem({ card: undefined, cardRental: true })],
      [makeClass()],
      makeContext(),
    );
    expect(priced.cardRentalFee).toBe(50);
  });

  it('treats a null card rental price as free', () => {
    const [priced] = priceEntryOrderItems(
      [makeItem({ card: undefined, cardRental: true })],
      [makeClass()],
      makeContext({ cardRental: { enabled: true, price: null } }),
    );
    expect(priced.cardRentalFee).toBe(0);
  });

  it('rejects card rental when the service is not enabled', () => {
    expect(() =>
      priceEntryOrderItems(
        [makeItem({ card: undefined, cardRental: true })],
        [makeClass()],
        makeContext({ cardRental: { enabled: false, price: null } }),
      ),
    ).toThrow(/Card rental is not available/);
  });

  it('applies the late entry surcharge after the deadline', () => {
    const [priced] = priceEntryOrderItems(
      [makeItem()],
      [makeClass()],
      makeContext({
        entriesCloseAt: new Date('2026-07-01T00:00:00.000Z'),
        lateEntryFeePercent: 50,
      }),
    );
    expect(priced.fee).toBe(150);
  });

  it('prices a class without a configured fee as 0', () => {
    const [priced] = priceEntryOrderItems([makeItem()], [makeClass({ fee: null })], makeContext());
    expect(priced.fee).toBe(0);
  });
});

describe('computeEntryOrderTotal', () => {
  it('sums fees and card rental fees', () => {
    const items = priceEntryOrderItems(
      [makeItem(), makeItem({ card: undefined, cardRental: true })],
      [makeClass()],
      makeContext(),
    );
    expect(computeEntryOrderTotal(items)).toBe(250);
  });
});

describe('generatePaymentReference', () => {
  it('produces a 10-digit numeric string prefixed with the two-digit year', () => {
    const reference = generatePaymentReference(NOW);
    expect(reference).toMatch(/^26\d{8}$/);
  });
});

type PrismaStub = {
  user: { findUnique: ReturnType<typeof vi.fn> };
  event: { findUnique: ReturnType<typeof vi.fn> };
  entry: {
    create: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  entryItem: { update: ReturnType<typeof vi.fn> };
};

function makePrismaStub(): PrismaStub {
  return {
    user: { findUnique: vi.fn() },
    event: { findUnique: vi.fn() },
    entry: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    entryItem: { update: vi.fn() },
  };
}

const decimal = (value: number) => ({ toNumber: () => value });

function makeEventRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'event-1',
    date: new Date('2026-07-10T00:00:00.000Z'),
    discipline: 'MIDDLE',
    entriesOpenAt: new Date('2026-06-01T00:00:00.000Z'),
    entriesCloseAt: new Date('2026-07-08T23:59:59.000Z'),
    defaultStartMode: 'FreeStart',
    vatPayer: false,
    vatRate: null,
    lateEntryFeePercent: null,
    currency: { iso4217Alpha3: 'CZK' },
    ofeedPaymentAvailable: false,
    bankAccountIban: null,
    paymentMethods: [],
    services: [{ active: true, price: decimal(50) }],
    classes: [
      {
        id: 10,
        name: 'H21',
        minAge: null,
        maxAge: null,
        maxNumberOfCompetitors: 50,
        startMode: 'FreeStart',
        fee: decimal(100),
        lateEntryFeeDisabled: false,
        startSlotVacancies: [],
        _count: { competitors: 3 },
      },
    ],
    ...overrides,
  };
}

function makeStoredEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    eventId: 'event-1',
    status: 'RECEIVED',
    paid: false,
    paymentMethod: 'CASH',
    paymentReference: '2612345678',
    userId: null,
    contactEmail: 'jan@example.com',
    contactFirstname: 'Jan',
    contactLastname: 'Novak',
    totalAmount: decimal(100),
    currency: 'CZK',
    createdAt: NOW,
    items: [
      {
        id: 1,
        classId: 10,
        class: { name: 'H21' },
        firstname: 'Jan',
        lastname: 'Novak',
        registration: 'CHC9501',
        birthYear: 1995,
        organisation: null,
        license: null,
        note: null,
        card: 8123456,
        cardRental: false,
        startTime: null,
        fee: decimal(100),
        cardRentalFee: null,
        competitorId: null,
      },
    ],
    ...overrides,
  };
}

const ORDER_INPUT = {
  contactEmail: 'jan@example.com',
  contactFirstname: 'Jan',
  contactLastname: 'Novak',
  paymentMethod: 'CASH' as const,
  items: [makeItem()],
};

describe('createEntryOrder', () => {
  let prisma: PrismaStub;

  beforeEach(() => {
    prisma = makePrismaStub();
    mockNotifyEntryOrderReceived.mockReset();
  });

  const run = (
    context: { userId?: number | null; now?: Date; paymentLinkLanguage?: string } = {},
  ) =>
    createEntryOrder(
      prisma as never,
      {
        eventId: 'event-1',
        userId: context.userId ?? null,
        now: context.now ?? NOW,
        paymentLinkLanguage: context.paymentLinkLanguage,
      },
      ORDER_INPUT,
    );

  it('creates an order with server-side prices and a payment reference', async () => {
    prisma.event.findUnique.mockResolvedValue(makeEventRecord());
    prisma.entry.create.mockResolvedValue(makeStoredEntry());

    const order = await run({ userId: 7 });

    expect(prisma.entry.create).toHaveBeenCalledTimes(1);
    const createArgs = prisma.entry.create.mock.calls[0][0];
    expect(createArgs.data).toMatchObject({
      eventId: 'event-1',
      status: 'RECEIVED',
      userId: 7,
      contactEmail: 'jan@example.com',
      paymentMethod: 'CASH',
      totalAmount: 100,
      currency: 'CZK',
    });
    expect(createArgs.data.paymentReference).toMatch(/^26\d{8}$/);
    expect(createArgs.data.items.create).toHaveLength(1);
    expect(createArgs.data.items.create[0]).toMatchObject({
      classId: 10,
      birthYear: 1995,
      fee: 100,
    });

    expect(order).toMatchObject({
      id: 'entry-1',
      status: 'RECEIVED',
      paymentReference: '2612345678',
      totalAmount: 100,
      currency: 'CZK',
      detailAccessToken: expect.any(String),
    });
    expect(order.items[0]).toMatchObject({ className: 'H21', fee: 100 });
    expect(mockNotifyEntryOrderReceived).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'entry-1', contactEmail: 'jan@example.com' }),
      expect.objectContaining({ id: 'event-1' }),
      expect.objectContaining({ method: 'CASH' }),
    );
  });

  it('persists an optional note for an individual entry item', async () => {
    prisma.event.findUnique.mockResolvedValue(makeEventRecord());
    prisma.entry.create.mockResolvedValue(
      makeStoredEntry({
        items: [{ ...makeStoredEntry().items[0], note: 'Bezlepková strava.' }],
      }),
    );

    const order = await createEntryOrder(
      prisma as never,
      { eventId: 'event-1', userId: null, now: NOW },
      { ...ORDER_INPUT, items: [{ ...ORDER_INPUT.items[0], note: '  Bezlepková strava.  ' }] },
    );

    expect(prisma.entry.create.mock.calls[0][0].data.items.create[0].note).toBe(
      'Bezlepková strava.',
    );
    expect(order.items[0].note).toBe('Bezlepková strava.');
  });

  it('returns a signed detail access token for a cash order', async () => {
    prisma.event.findUnique.mockResolvedValue(makeEventRecord());
    prisma.entry.create.mockResolvedValue(makeStoredEntry());

    const order = await run();

    expect(order.detailAccessToken).toEqual(expect.any(String));
    expect(hasEntryOrderAccess(order.detailAccessToken!, order.id, NOW)).toBe(true);
  });

  it('returns QR Platba instructions only for a QR payment order', async () => {
    prisma.event.findUnique.mockResolvedValue(
      makeEventRecord({
        bankAccountIban: 'CZ6508000000192000145399',
        bankAccountName: 'OK Chrudim',
        paymentMethods: [
          {
            type: 'QR_PAYMENT',
            enabled: true,
            position: 0,
            displayName: null,
            paymentLinkTemplate: null,
          },
        ],
      }),
    );
    prisma.entry.create.mockResolvedValue(makeStoredEntry({ paymentMethod: 'QR_PAYMENT' }));

    const order = await createEntryOrder(
      prisma as never,
      { eventId: 'event-1', userId: null, now: NOW },
      { ...ORDER_INPUT, paymentMethod: 'QR_PAYMENT' },
    );

    const paymentReference = prisma.entry.create.mock.calls[0][0].data.paymentReference;
    expect(order.qrPayment).toEqual({
      payload:
        `SPD*1.0*ACC:CZ6508000000192000145399*AM:100.00*CC:CZK*X-VS:${paymentReference}` +
        '*X-KS:0308*MSG:OFeed QR payment - Novak Jan',
      bankAccountIban: 'CZ6508000000192000145399',
      bankAccountName: 'OK Chrudim',
      amount: 100,
      currency: 'CZK',
      paymentReference,
      constantSymbol: '0308',
      recipientMessage: 'OFeed QR payment - Novak Jan',
    });
    expect(prisma.entry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          paymentAccountIban: expect.anything(),
          paymentAccountName: expect.anything(),
          paymentConstantSymbol: expect.anything(),
          paymentRecipientMessage: expect.anything(),
        }),
      }),
    );
  });

  it('returns a server-interpolated payment URL only for a custom payment link', async () => {
    prisma.event.findUnique.mockResolvedValue(
      makeEventRecord({
        paymentMethods: [
          {
            type: 'CUSTOM_PAYMENT_LINK',
            enabled: true,
            position: 0,
            displayName: 'Online payment',
            paymentLinkTemplate:
              'https://pay.example/checkout?amount=#amount#&currency=#currency#&vs=#paymentreference#&email=#email#&lang=#language#',
          },
        ],
      }),
    );
    prisma.entry.create.mockResolvedValue(
      makeStoredEntry({ paymentMethod: 'CUSTOM_PAYMENT_LINK' }),
    );

    const order = await createEntryOrder(
      prisma as never,
      {
        eventId: 'event-1',
        userId: null,
        now: NOW,
        paymentLinkLanguage: 'en-US,en;q=0.9',
      },
      { ...ORDER_INPUT, paymentMethod: 'CUSTOM_PAYMENT_LINK' },
    );

    const paymentReference = prisma.entry.create.mock.calls[0][0].data.paymentReference;
    expect(order.paymentUrl).toBe(
      `https://pay.example/checkout?amount=100.00&currency=CZK&vs=${paymentReference}&email=jan%40example.com&lang=en`,
    );
    expect(order).not.toHaveProperty('paymentLinkTemplate');
  });

  it('rejects an unknown event', async () => {
    prisma.event.findUnique.mockResolvedValue(null);
    await expect(run()).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects a payment method that is not ready for the event', async () => {
    prisma.event.findUnique.mockResolvedValue(makeEventRecord());

    await expect(
      createEntryOrder(
        prisma as never,
        { eventId: 'event-1', userId: null, now: NOW },
        { ...ORDER_INPUT, paymentMethod: 'OFEED_PAYMENT' },
      ),
    ).rejects.toThrow('selected payment method is not available');
    expect(prisma.entry.create).not.toHaveBeenCalled();
  });

  it('rejects relay events', async () => {
    prisma.event.findUnique.mockResolvedValue(makeEventRecord({ discipline: 'RELAY' }));
    await expect(run()).rejects.toThrow(/non-relay/);
  });

  it('rejects events without configured entries', async () => {
    prisma.event.findUnique.mockResolvedValue(
      makeEventRecord({ entriesOpenAt: null, entriesCloseAt: null }),
    );
    await expect(run()).rejects.toThrow(/not configured/);
  });

  it('rejects orders before entries open', async () => {
    prisma.event.findUnique.mockResolvedValue(
      makeEventRecord({ entriesOpenAt: new Date('2026-07-05T00:00:00.000Z') }),
    );
    await expect(run()).rejects.toThrow(/not open yet/);
  });

  it('rejects orders after entries close', async () => {
    prisma.event.findUnique.mockResolvedValue(
      makeEventRecord({ entriesCloseAt: new Date('2026-07-01T00:00:00.000Z') }),
    );
    await expect(run()).rejects.toThrow(/closed/);
  });

  it('retries payment reference generation on a unique constraint collision', async () => {
    prisma.event.findUnique.mockResolvedValue(makeEventRecord());
    prisma.entry.create
      .mockRejectedValueOnce({ code: 'P2002' })
      .mockResolvedValue(makeStoredEntry());

    const order = await run();

    expect(prisma.entry.create).toHaveBeenCalledTimes(2);
    expect(order.id).toBe('entry-1');
  });
});

describe('updateEntryOrderForGraphQL', () => {
  it('allows an event owner to correct an order after public entries close', async () => {
    const prisma = makePrismaStub() as PrismaStub & {
      event: PrismaStub['event'] & { findUniqueOrThrow: ReturnType<typeof vi.fn> };
      entry: PrismaStub['entry'] & { findUnique: ReturnType<typeof vi.fn> };
    };
    prisma.entry.findUnique = vi.fn().mockResolvedValue({ eventId: 'event-1', status: 'RECEIVED' });
    prisma.event.findUnique.mockResolvedValue({ id: 'event-1', authorId: 7 });
    prisma.user.findUnique.mockResolvedValue({ role: 'USER' });
    prisma.event.findUniqueOrThrow = vi.fn().mockResolvedValue(
      makeEventRecord({
        entriesCloseAt: new Date('2026-07-01T00:00:00.000Z'),
        paymentMethods: [
          {
            type: 'CASH',
            enabled: true,
            position: 0,
            displayName: null,
            paymentLinkTemplate: null,
          },
        ],
      }),
    );

    await updateEntryOrderForGraphQL(
      prisma as never,
      { isAuthenticated: true, type: 'jwt', userId: 7 } as never,
      { entryId: 'entry-1', ...ORDER_INPUT },
    );

    expect(prisma.entry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'entry-1' },
        data: expect.objectContaining({
          contactEmail: 'jan@example.com',
          paymentMethod: 'CASH',
        }),
      }),
    );
  });
});

describe('processEntryOrder', () => {
  let prisma: PrismaStub;

  beforeEach(() => {
    prisma = makePrismaStub();
    mockStoreCompetitor.mockReset();
    mockNotifyEntryOrderProcessed.mockReset();
  });

  const run = () =>
    processEntryOrder(prisma as never, {
      eventId: 'event-1',
      entryId: 'entry-1',
      userId: 42,
    });

  it('rejects a missing order', async () => {
    prisma.entry.findFirst.mockResolvedValue(null);
    await expect(run()).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects an unapproved order', async () => {
    prisma.entry.findFirst.mockResolvedValue(makeStoredEntry({ status: 'RECEIVED' }));
    await expect(run()).rejects.toThrow(/Only approved/);
  });

  it('rejects an already processed order', async () => {
    prisma.entry.findFirst.mockResolvedValue(makeStoredEntry({ status: 'PROCESSED' }));
    await expect(run()).rejects.toThrow(/already processed/);
  });

  it('stores a competitor per item, links it, and marks the order processed', async () => {
    prisma.entry.findFirst.mockResolvedValue(
      makeStoredEntry({
        status: 'APPROVED',
        event: makeEventRecord(),
        items: [{ ...makeStoredEntry().items[0], note: 'Potřebuji bezlepkovou stravu.' }],
      }),
    );
    mockStoreCompetitor.mockResolvedValue({ message: 'ok', competitor: { id: 555 } });
    prisma.entry.update.mockResolvedValue(makeStoredEntry({ status: 'PROCESSED' }));

    const order = await run();

    expect(mockStoreCompetitor).toHaveBeenCalledTimes(1);
    expect(mockStoreCompetitor).toHaveBeenCalledWith(
      'event-1',
      expect.objectContaining({
        classId: 10,
        firstname: 'Jan',
        lastname: 'Novak',
        registration: 'CHC9501',
        note: 'Potřebuji bezlepkovou stravu.',
        card: 8123456,
      }),
      42,
      'IT',
    );
    expect(prisma.entryItem.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { competitorId: 555 },
    });
    expect(prisma.entry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          status: 'PROCESSED',
          statusHistory: { create: { status: 'PROCESSED', changedById: 42 } },
        },
      }),
    );
    expect(order.status).toBe('PROCESSED');
    expect(mockNotifyEntryOrderProcessed).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'entry-1', status: 'PROCESSED' }),
      expect.objectContaining({ id: 'event-1' }),
    );
  });

  it('skips items already linked to a competitor (idempotent retry)', async () => {
    const entry = makeStoredEntry({ status: 'APPROVED', event: makeEventRecord() }) as {
      items: Array<Record<string, unknown>>;
    };
    entry.items[0].competitorId = 900;
    prisma.entry.findFirst.mockResolvedValue(entry);
    prisma.entry.update.mockResolvedValue(makeStoredEntry({ status: 'PROCESSED' }));

    await run();

    expect(mockStoreCompetitor).not.toHaveBeenCalled();
    expect(prisma.entryItem.update).not.toHaveBeenCalled();
  });
});
