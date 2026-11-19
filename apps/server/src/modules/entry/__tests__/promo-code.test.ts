import { createRequire } from 'node:module';
import { schema } from '../../../graphql/schema.js';
import { describe, expect, it, vi } from 'vitest';
import {
  computePromoDiscount,
  createPromoCodeSchema,
  resolveRegistrationDiscount,
} from '@repo/shared';
import {
  createPromoCode,
  listPromoCodes,
  resolvePromoCode,
  revokePromoCode,
} from '../promo-code.service.js';

const require = createRequire(import.meta.url);
const { graphql } = createRequire(require.resolve('@pothos/core'))(
  'graphql',
) as typeof import('graphql');

const auth = { isAuthenticated: true, type: 'jwt', userId: 7 } as const;
function stub() {
  const db = {
    event: { findUnique: vi.fn().mockResolvedValue({ id: 'event', authorId: 7 }) },
    user: { findUnique: vi.fn().mockResolvedValue({ role: 'USER' }) },
    promoCode: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'event' }]),
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation(async (operation) => operation(db));
  return db;
}
describe('promo pricing and validation', () => {
  it('normalizes codes and bounds percentage precision', () => {
    expect(createPromoCodeSchema.parse({ code: ' summer-26 ', discountPercent: 12.25 }).code).toBe(
      'SUMMER-26',
    );
    for (const code of ['ab', 'a b', 'žluť', 'x'.repeat(41)])
      expect(createPromoCodeSchema.safeParse({ code, discountPercent: 10 }).success).toBe(false);
    for (const discountPercent of [0, -1, 100.01, 12.345, NaN])
      expect(createPromoCodeSchema.safeParse({ code: 'ABC', discountPercent }).success).toBe(false);
  });
  it('excludes non-combinable fees and rental and rounds the eligible sum once', () => {
    expect(
      computePromoDiscount(
        [
          { fee: 75, cardRentalFee: 25, allowPromoCode: false },
          { fee: 99.99, cardRentalFee: 20, allowPromoCode: true },
        ],
        12.5,
      ),
    ).toEqual({
      subtotal: 219.99,
      eligibleAmount: 119.99,
      discountAmount: 15,
      totalAmount: 204.99,
      excludedItems: 1,
    });
    expect(computePromoDiscount([{ fee: 10, cardRentalFee: 5 }], 100).totalAmount).toBe(0);
  });
  it('uses the winning registration rule and requires every tied winner to permit combining', () => {
    const rules = [
      { pattern: 'CHC*', discountPercent: 20, allowPromoCode: true },
      { pattern: '*9501', discountPercent: 20 },
    ];
    expect(resolveRegistrationDiscount('CHC9501', rules)).toEqual({
      discountPercent: 20,
      allowPromoCode: false,
    });
    expect(resolveRegistrationDiscount('CHC9502', rules).allowPromoCode).toBe(true);
    expect(resolveRegistrationDiscount(null, rules).allowPromoCode).toBe(true);
  });
});
describe('promo services', () => {
  it('looks up only the normalized code in the requested event', async () => {
    const db = stub();
    db.promoCode.findUnique.mockResolvedValue({ id: 'p', revokedAt: null });
    await resolvePromoCode(db as never, 'event', ' summer ');
    expect(db.promoCode.findUnique).toHaveBeenCalledWith({
      where: { eventId_code: { eventId: 'event', code: 'SUMMER' } },
    });
  });
  it.each([null, { revokedAt: new Date() }])('rejects unavailable codes', async (promo) => {
    const db = stub();
    db.promoCode.findUnique.mockResolvedValue(promo);
    await expect(resolvePromoCode(db as never, 'event', 'SUMMER')).rejects.toThrow('PROMO_INVALID');
  });
  it('creates immutable normalized configuration and translates duplicate conflicts', async () => {
    const db = stub();
    await createPromoCode(db as never, auth as never, 'event', {
      code: ' summer ',
      discountPercent: 20,
    });
    expect(db.promoCode.create).toHaveBeenCalledWith({
      data: { eventId: 'event', code: 'SUMMER', discountPercent: 20, createdById: 7 },
    });
    db.promoCode.create.mockRejectedValue({ code: 'P2002' });
    await expect(
      createPromoCode(db as never, auth as never, 'event', { code: 'SUMMER', discountPercent: 20 }),
    ).rejects.toThrow('PROMO_ALREADY_EXISTS');
  });
  it('revokes under the event lock and never modifies orders', async () => {
    const db = stub();
    await revokePromoCode(db as never, auth as never, 'event', 'promo');
    expect(db.$queryRaw).toHaveBeenCalledOnce();
    expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      db.promoCode.updateMany.mock.invocationCallOrder[0]!,
    );
    expect(db.promoCode.updateMany).toHaveBeenCalledWith({
      where: { id: 'promo', eventId: 'event', revokedAt: null },
      data: { revokedAt: expect.any(Date), revokedById: 7 },
    });
  });
  it('denies management to another organizer', async () => {
    const db = stub();
    db.event.findUnique.mockResolvedValue({ id: 'event', authorId: 8 });
    await expect(listPromoCodes(db as never, auth as never, 'event')).rejects.toThrow();
    await expect(
      createPromoCode(db as never, auth as never, 'event', { code: 'SUMMER', discountPercent: 20 }),
    ).rejects.toThrow();
    await expect(revokePromoCode(db as never, auth as never, 'event', 'promo')).rejects.toThrow();
    expect(db.promoCode.create).not.toHaveBeenCalled();
    expect(db.promoCode.updateMany).not.toHaveBeenCalled();
  });
});

describe('promo GraphQL contract', () => {
  it('returns useful invalid-code errors from the public quote', async () => {
    const db = stub();
    db.promoCode.findUnique.mockResolvedValue(null);
    const result = await graphql({
      schema,
      source: `query { entryPromoQuote(eventId: "event", code: "SUMMER", items: [{ classId: 1, firstname: "Jan", lastname: "Test", birthYear: 1995, card: 123, cardRental: false }]) { totalAmount } }`,
      contextValue: { prisma: db, auth: { isAuthenticated: false } },
    });
    expect(result.errors?.[0]?.message).toBe('PROMO_INVALID');
    expect(result.errors?.[0]?.extensions.code).toBe('BAD_USER_INPUT');
  });
  it('returns code usage count without exposing order contacts', async () => {
    const db = stub();
    db.promoCode.findMany.mockResolvedValue([
      {
        id: 'p',
        code: 'SUMMER',
        discountPercent: { toNumber: () => 20 },
        revokedAt: null,
        _count: { entries: 3 },
      },
    ]);
    const result = await graphql({
      schema,
      source: `query { eventPromoCodes(eventId: "event") { id code discountPercent usageCount revokedAt } }`,
      contextValue: { prisma: db, auth },
    });
    expect(result.errors).toBeUndefined();
    expect(result.data?.eventPromoCodes).toEqual([
      { id: 'p', code: 'SUMMER', discountPercent: 20, usageCount: 3, revokedAt: null },
    ]);
  });
});
