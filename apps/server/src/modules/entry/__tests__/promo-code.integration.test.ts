import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrismaClient } from '../../../db/prisma-client.js';

const settings = vi.hoisted(() => ({ url: process.env.PROMO_TEST_DATABASE_URL }));
if (settings.url) {
  const url = new URL(settings.url);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !/^\/ofeed_promo_test(?:_|$)/.test(url.pathname)
  )
    throw new Error('Promo tests require a disposable local ofeed_promo_test database');
}
vi.mock('../entry.email.js', () => ({
  notifyEntryOrderReceived: vi.fn(),
  notifyEntryOrderProcessed: vi.fn(),
}));
import { createEntryOrder, updateEntryOrderForGraphQL } from '../entry.service.js';
import { createPromoCode, revokePromoCode } from '../promo-code.service.js';

describe.skipIf(!settings.url)('promo codes on disposable MariaDB', () => {
  const client = createPrismaClient(
    settings.url ?? 'mysql://root@127.0.0.1:13383/ofeed_promo_test',
  );
  const second = createPrismaClient(
    settings.url ?? 'mysql://root@127.0.0.1:13383/ofeed_promo_test',
  );
  let eventId: string;
  let classId: number;
  let userId: number;
  let sportId: number;
  let currencyId: number;
  const auth = () => ({ isAuthenticated: true as const, type: 'jwt' as const, userId });
  const input = () => ({
    contactEmail: 'promo@test.invalid',
    contactFirstname: 'Promo',
    contactLastname: 'Test',
    paymentMethod: 'CASH' as const,
    promoCode: 'SUMMER',
    items: [
      {
        classId,
        firstname: 'Jan',
        lastname: 'Test',
        birthYear: 1995,
        card: 123,
        cardRental: false,
      },
    ],
  });
  beforeEach(async () => {
    userId = (
      await client.user.create({
        data: {
          email: `${randomUUID()}@promo.invalid`,
          firstname: 'Promo',
          lastname: 'Test',
          password: 'fixture-only',
        },
      })
    ).id;
    sportId = (await client.sport.create({ data: { name: `promo-${randomUUID()}` } })).id;
    currencyId = (
      await client.currency.create({
        data: { name: `Promo ${randomUUID()}`, iso4217Alpha3: 'ZZP' },
      })
    ).id;
    eventId = (
      await client.event.create({
        data: {
          name: 'Promo fixture',
          date: new Date('2027-01-01'),
          sportId,
          currencyId,
          authorId: userId,
          entriesOpenAt: new Date('2020-01-01'),
          defaultStartMode: 'FreeStart',
        },
      })
    ).id;
    classId = (
      await client.class.create({
        data: { eventId, name: 'H21', fee: 100, maxNumberOfCompetitors: 50 },
      })
    ).id;
    await client.eventPaymentMethod.create({
      data: { eventId, type: 'CASH', enabled: true, position: 0 },
    });
    await createPromoCode(client, auth(), eventId, { code: 'SUMMER', discountPercent: 20 });
  });
  afterEach(async () => {
    if (eventId) {
      await client.entry.deleteMany({ where: { eventId } });
      await client.event.delete({ where: { id: eventId } });
    }
    await client.user.delete({ where: { id: userId } });
    await client.sport.delete({ where: { id: sportId } });
    await client.currency.delete({ where: { id: currencyId } });
  });
  afterAll(async () => {
    await client.$disconnect();
    await second.$disconnect();
  });
  it('serializes concurrent create/revoke and permanently rejects new uses afterward', async () => {
    const promo = await client.promoCode.findUniqueOrThrow({
      where: { eventId_code: { eventId, code: 'SUMMER' } },
    });
    const initial = await createEntryOrder(client, { eventId, userId: null }, input());
    expect(initial.totalAmount).toBe(80);
    await Promise.allSettled([
      createEntryOrder(client, { eventId, userId: null }, input()),
      revokePromoCode(second, auth(), eventId, promo.id),
    ]);
    expect(
      (await client.promoCode.findUniqueOrThrow({ where: { id: promo.id } })).revokedAt,
    ).not.toBeNull();
    await expect(createEntryOrder(second, { eventId, userId: null }, input())).rejects.toThrow(
      'PROMO_INVALID',
    );
    const saved = await client.entry.findUniqueOrThrow({ where: { id: initial.id } });
    expect(saved.totalAmount.toNumber()).toBe(80);
    expect(saved.promoCode).toBe('SUMMER');
    // Editing uses the immutable percentage, without consulting the revoked code.
    await updateEntryOrderForGraphQL(client, auth(), {
      ...input(),
      entryId: initial.id,
      items: [{ ...input().items[0]!, entryItemId: initial.items[0]!.id }],
    });
    expect(
      (await client.entry.findUniqueOrThrow({ where: { id: initial.id } })).totalAmount.toNumber(),
    ).toBe(80);
  });
});
