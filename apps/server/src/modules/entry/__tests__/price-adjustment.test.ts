import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppBindings } from '../../../types/index.js';

const db = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock('../../../utils/context.js', () => ({
  default: new Proxy({}, { get: (_target, key) => db.current[key as string] }),
}));
vi.mock('../../bank/bank-matching.js', () => ({ rematchEntryBankTransactions: vi.fn() }));
vi.mock('../entry.email.js', () => ({
  notifyEntryOrderReceived: vi.fn(),
  notifyEntryOrderProcessed: vi.fn(),
}));

import { Prisma } from '../../../generated/prisma/client.js';
import { registerPublicEventRoutes } from '../../event/event.public.handlers.js';
import { allocateEntryReportPrices } from '../entry-report-pricing.js';
import {
  applyPriceAdjustment,
  priceEntryOrderItems,
  updateEntryOrderForGraphQL,
  updateEntryOrderPaid,
} from '../entry.service.js';

const NOW = new Date('2026-07-02T10:00:00.000Z');
const decimal = (value: number) => new Prisma.Decimal(value);
const OWNER = 7;

const cashMethod = {
  type: 'CASH',
  enabled: true,
  position: 0,
  displayName: null,
  paymentLinkTemplate: null,
};

function eventRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'event-1',
    authorId: OWNER,
    date: new Date('2026-07-10T00:00:00.000Z'),
    discipline: 'MIDDLE',
    entriesOpenAt: new Date('2026-06-01T00:00:00.000Z'),
    entriesCloseAt: new Date('2026-07-08T23:59:59.000Z'),
    defaultStartMode: 'FreeStart',
    vatPayer: false,
    vatRate: null,
    lateEntryFeePercent: null,
    registrationFeeDiscounts: [],
    currency: { iso4217Alpha3: 'CZK' },
    ofeedPaymentAvailable: false,
    bankAccountIban: null,
    paymentMethods: [cashMethod],
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
        _count: { competitors: 0 },
      },
    ],
    ...overrides,
  };
}

const item = {
  classId: 10,
  firstname: 'Jan',
  lastname: 'Novak',
  registration: 'CHC9501',
  card: 8123456,
  cardRental: true,
};
const order = {
  contactEmail: 'jan@example.com',
  contactFirstname: 'Jan',
  contactLastname: 'Novak',
  paymentMethod: 'CASH' as const,
  items: [item],
};

/** In-memory stub good enough for the create, edit and mark-paid paths of one entry. */
function makeDatabase(role = 'USER') {
  const entry: Record<string, unknown> = {};
  const payments: Array<{ amount: Prisma.Decimal }> = [];
  const stub = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'entry-1' }]),
    $transaction: vi.fn(),
    user: { findUnique: vi.fn().mockResolvedValue({ role }) },
    registration: { findMany: vi.fn().mockResolvedValue([]) },
    event: {
      findUnique: vi.fn().mockResolvedValue(eventRecord()),
      findUniqueOrThrow: vi.fn().mockResolvedValue(eventRecord()),
    },
    entry: {
      create: vi.fn(async ({ data }) => {
        Object.assign(entry, {
          id: 'entry-1',
          eventId: 'event-1',
          status: 'RECEIVED',
          paid: false,
          userId: data.userId,
          createdAt: NOW,
          ...data,
          totalAmount: decimal(data.totalAmount),
          priceAdjustment:
            data.priceAdjustment === undefined ? null : decimal(data.priceAdjustment),
          priceAdjustmentReason: data.priceAdjustmentReason ?? null,
          items: data.items.create.map((created: Record<string, unknown>, index: number) => ({
            ...created,
            id: index + 1,
            fee: decimal(created.fee as number),
            cardRentalFee:
              created.cardRentalFee === null ? null : decimal(created.cardRentalFee as number),
            registrationDiscountPercent: decimal(created.registrationDiscountPercent as number),
            competitorId: null,
            actionKey: 'NEW_ENTRY',
            previousValue: null,
          })),
        });
        return entry;
      }),
      findUnique: vi.fn(async () => entry),
      findFirst: vi.fn(async () => entry),
      findUniqueOrThrow: vi.fn(async () => entry),
      update: vi.fn(async ({ data }) => {
        const { items: _items, ...fields } = data;
        for (const [key, value] of Object.entries(fields)) {
          entry[key] =
            typeof value === 'number' && key !== 'priceAdjustedById' ? decimal(value) : value;
        }
        return entry;
      }),
    },
    entryPayment: {
      count: vi.fn(async () => payments.length),
      aggregate: vi.fn(async () => ({
        _sum: {
          amount: payments.length
            ? payments.reduce((sum, payment) => sum.plus(payment.amount), decimal(0))
            : null,
        },
      })),
      create: vi.fn(async ({ data }) => {
        payments.push(data);
        return data;
      }),
    },
  };
  stub.$transaction.mockImplementation(async (operation) => operation(stub));
  db.current = stub;
  return { stub, entry, payments };
}

function app(userId: number | null) {
  const hono = new Hono<AppBindings>();
  hono.use('*', async (c, next) => {
    c.set(
      'authContext',
      userId === null
        ? { isAuthenticated: false, type: null }
        : { isAuthenticated: true, type: 'jwt', userId },
    );
    await next();
  });
  registerPublicEventRoutes(hono);
  return hono;
}

const post = (userId: number | null, body: object) =>
  app(userId).request('/event-1/entries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const auth = { isAuthenticated: true, type: 'jwt', userId: OWNER } as never;
const editInput = (overrides: Record<string, unknown> = {}) => ({
  entryId: 'entry-1',
  ...order,
  items: [{ ...item, entryItemId: 1 }],
  ...overrides,
});

describe('entry order price adjustment', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  it('lets the event owner create an adjusted order and records who set it', async () => {
    const { stub } = makeDatabase();
    const response = await post(OWNER, {
      ...order,
      priceAdjustment: -30.5,
      priceAdjustmentReason: '  Club volunteer  ',
    });
    expect(response.status).toBe(201);
    expect(stub.entry.create.mock.calls[0]![0].data).toMatchObject({
      totalAmount: 119.5,
      priceAdjustment: -30.5,
      priceAdjustmentReason: 'Club volunteer',
      priceAdjustedById: OWNER,
    });
    expect((await response.json()).results.data).toMatchObject({
      totalAmount: 119.5,
      priceAdjustment: -30.5,
      priceAdjustmentReason: 'Club volunteer',
    });
  });

  it('lets an admin who is not the author adjust the price', async () => {
    const { stub } = makeDatabase('ADMIN');
    const response = await post(99, {
      ...order,
      priceAdjustment: 20,
      priceAdjustmentReason: 'Map',
    });
    expect(response.status).toBe(201);
    expect(stub.entry.create.mock.calls[0]![0].data).toMatchObject({
      totalAmount: 170,
      priceAdjustedById: 99,
    });
  });

  it.each([
    ['anonymous', null],
    ['non-owner', 99],
  ])('rejects a %s adjustment with 403 and creates nothing', async (_label, userId) => {
    const { stub } = makeDatabase();
    const response = await post(userId, {
      ...order,
      priceAdjustment: -10,
      priceAdjustmentReason: 'Discount',
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: true, code: 403 });
    expect(stub.entry.create).not.toHaveBeenCalled();
  });

  it('still lets anonymous users create orders without an adjustment', async () => {
    const { stub } = makeDatabase();
    expect((await post(null, order)).status).toBe(201);
    expect(stub.entry.create.mock.calls[0]![0].data).toMatchObject({ totalAmount: 150 });
    expect(stub.entry.create.mock.calls[0]![0].data.priceAdjustment).toBeUndefined();
  });

  it('requires a reason for a non-zero adjustment (422)', async () => {
    const { stub } = makeDatabase();
    const response = await post(OWNER, { ...order, priceAdjustment: -10 });
    expect(response.status).toBe(422);
    expect(stub.entry.create).not.toHaveBeenCalled();
    expect(
      (await post(OWNER, { ...order, priceAdjustment: 0.001, priceAdjustmentReason: 'x' })).status,
    ).toBe(422);
  });

  it('rejects an adjustment that makes the total negative (422)', async () => {
    const { stub } = makeDatabase();
    const response = await post(OWNER, {
      ...order,
      priceAdjustment: -150.01,
      priceAdjustmentReason: 'Too much',
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ errors: 'PRICE_ADJUSTMENT_NEGATIVE_TOTAL' });
    expect(stub.entry.create).not.toHaveBeenCalled();
    expect(applyPriceAdjustment(150, -150)).toBe(0);
  });

  it('rejects overflowing totals before create or edit and accepts the exact limit', async () => {
    const { stub } = makeDatabase();
    const response = await post(OWNER, {
      ...order,
      priceAdjustment: 99_999_999.99,
      priceAdjustmentReason: 'Extra charge',
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ errors: 'PRICE_ADJUSTMENT_TOTAL_OVERFLOW' });
    expect(stub.entry.create).not.toHaveBeenCalled();
    expect(applyPriceAdjustment(150, 99_999_849.99)).toBe(99_999_999.99);

    await post(OWNER, order);
    await expect(
      updateEntryOrderForGraphQL(
        stub as never,
        auth,
        editInput({ priceAdjustment: 99_999_999.99, priceAdjustmentReason: 'Extra charge' }),
      ),
    ).rejects.toThrow('PRICE_ADJUSTMENT_TOTAL_OVERFLOW');
    expect(stub.entry.update).not.toHaveBeenCalled();
  });

  it('keeps, replaces and clears the adjustment on edit, and settles the adjusted total', async () => {
    const { stub, entry, payments } = makeDatabase();
    await post(OWNER, { ...order, priceAdjustment: -50, priceAdjustmentReason: 'Helper' });
    expect(entry.totalAmount).toEqual(decimal(100));

    // Omitted: keep the stored adjustment and reapply it to the recomputed total.
    await updateEntryOrderForGraphQL(
      stub as never,
      auth,
      editInput({ items: [{ ...item, entryItemId: 1, cardRental: false }] }),
    );
    let data = stub.entry.update.mock.calls.at(-1)![0].data;
    expect(data.totalAmount).toBe(50);
    expect(data).not.toHaveProperty('priceAdjustment');
    expect(data).not.toHaveProperty('priceAdjustmentReason');

    // Number: replace (reason required when non-zero).
    await expect(
      updateEntryOrderForGraphQL(stub as never, auth, editInput({ priceAdjustment: 25 })),
    ).rejects.toThrow('invalid');
    await updateEntryOrderForGraphQL(
      stub as never,
      auth,
      editInput({ priceAdjustment: 25, priceAdjustmentReason: 'Lost chip fee' }),
    );
    data = stub.entry.update.mock.calls.at(-1)![0].data;
    expect(data).toMatchObject({
      totalAmount: 175,
      priceAdjustment: 25,
      priceAdjustmentReason: 'Lost chip fee',
      priceAdjustedById: OWNER,
    });

    // A negative result is rejected on edit too.
    await expect(
      updateEntryOrderForGraphQL(
        stub as never,
        auth,
        editInput({ priceAdjustment: -200, priceAdjustmentReason: 'x' }),
      ),
    ).rejects.toThrow('PRICE_ADJUSTMENT_NEGATIVE_TOTAL');

    // The CASH receipt written by mark-paid equals the adjusted total.
    await updateEntryOrderPaid(stub as never, {
      eventId: 'event-1',
      entryId: 'entry-1',
      paid: true,
      changedById: OWNER,
    });
    expect(payments).toHaveLength(1);
    expect(payments[0]!.amount).toEqual(decimal(175));

    // Null: clear.
    await updateEntryOrderForGraphQL(stub as never, auth, editInput({ priceAdjustment: null }));
    data = stub.entry.update.mock.calls.filter(([call]) => 'totalAmount' in call.data).at(-1)![0]
      .data;
    expect(data).toMatchObject({
      totalAmount: 150,
      priceAdjustment: null,
      priceAdjustmentReason: null,
      priceAdjustedById: null,
    });
  });
});

describe('registration discount snapshots on edit', () => {
  const cls = {
    id: 10,
    name: 'H21',
    minAge: null,
    maxAge: null,
    maxNumberOfCompetitors: 50,
    startMode: 'FreeStart' as const,
    fee: 100,
    lateEntryFeeDisabled: false,
    competitorCount: 0,
    slotStartTimes: [],
  };
  const context = {
    now: NOW,
    entriesCloseAt: null,
    lateEntryFeePercent: null,
    vatPayer: false,
    vatRate: null,
    defaultStartMode: 'FreeStart' as const,
    cardRental: { enabled: true, price: 50 },
    registrationFeeDiscounts: [{ pattern: 'ABC*', discountPercent: 10 }],
    snapshots: new Map([
      [1, { registration: 'chc9501 ', discountPercent: 50, allowPromoCode: true }],
    ]),
  };

  it('keeps the snapshot when the registration is unchanged (normalized)', () => {
    const [priced] = priceEntryOrderItems(
      [{ ...item, entryItemId: 1, cardRental: false }],
      [cls],
      context,
    );
    expect(priced).toMatchObject({ fee: 50, registrationDiscountPercent: 50 });
  });

  it('reprices with current rules when the registration changed', () => {
    const [priced] = priceEntryOrderItems(
      [{ ...item, entryItemId: 1, registration: 'ABC9501', cardRental: false }],
      [cls],
      context,
    );
    expect(priced).toMatchObject({ fee: 90, registrationDiscountPercent: 10 });
    const [removed] = priceEntryOrderItems(
      [{ ...item, entryItemId: 1, registration: undefined, birthYear: 1995, cardRental: false }],
      [cls],
      context,
    );
    expect(removed).toMatchObject({ fee: 100, registrationDiscountPercent: 0 });
  });
});

describe('entry report line prices with a price adjustment', () => {
  const lines = [
    { fee: 100, cardRentalFee: 50, allowPromoCode: true },
    { fee: 50, cardRentalFee: null, allowPromoCode: false },
  ];
  it.each([
    [-0.01, [149.99, 50]],
    [-100, [75, 25]],
    [10, [157.5, 52.5]],
  ])('allocates %d so lines sum to the order total', (adjustment, expected) => {
    expect(allocateEntryReportPrices(lines, 0, adjustment)).toEqual(expected);
  });
  it('never prices a line below zero and spreads extras over free lines', () => {
    expect(allocateEntryReportPrices(lines, 0, -500)).toEqual([0, 0]);
    expect(
      allocateEntryReportPrices([{ fee: 0, cardRentalFee: null, allowPromoCode: true }], 0, 5),
    ).toEqual([5]);
  });
});
