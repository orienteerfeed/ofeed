import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPrismaClient } from '../../../db/prisma-client.js';

const settings = vi.hoisted(() => ({ url: process.env.PAYMENT_TEST_DATABASE_URL }));
if (settings.url) {
  const url = new URL(settings.url);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !/^\/ofeed_payment_test(?:_|$)/.test(url.pathname)
  ) {
    throw new Error('Payment integration tests require a local ofeed_payment_test database');
  }
}
import { reportBankTransactions } from '../bank-connection.service.js';

// Synthetic fixtures only, in an explicitly opted-in local DB (see entry-payment.integration.test.ts).
describe.skipIf(!settings.url)('bank import on disposable MariaDB', () => {
  const fallback = 'mysql://root@127.0.0.1:13381/ofeed_payment_test';
  const client = createPrismaClient(settings.url ?? fallback);
  const second = createPrismaClient(settings.url ?? fallback);
  const device = randomUUID();
  let userId: number;
  let sportId: number;
  let eventId: string;
  let entryId: string;
  let connectionId: string;
  const item = (providerTransactionId: string, amount: string) => ({
    providerTransactionId,
    amount,
    currency: 'ZZZ',
    variableSymbol: '8200000001',
    bookingDate: '2026-10-25',
    source: 'BANK_API',
  });

  beforeEach(async () => {
    const user = await client.user.create({
      data: {
        email: `${randomUUID()}@bank.invalid`,
        firstname: 'Test',
        lastname: 'Organizer',
        password: 'not-a-real-credential',
      },
    });
    userId = user.id;
    sportId = (await client.sport.create({ data: { name: `bank-${randomUUID()}` } })).id;
    const currency = await client.currency.upsert({
      where: { iso4217Alpha3: 'ZZZ' },
      create: { name: 'Payment test currency', iso4217Alpha3: 'ZZZ' },
      update: {},
    });
    eventId = (
      await client.event.create({
        data: {
          name: 'Bank import fixture',
          date: new Date('2026-10-25T09:00:00Z'),
          authorId: userId,
          sportId,
          currencyId: currency.id,
          defaultStartMode: 'FreeStart',
        },
      })
    ).id;
    entryId = (
      await client.entry.create({
        data: {
          eventId,
          paymentReference: '8200000001',
          contactEmail: 'payer@bank.invalid',
          contactFirstname: 'Test',
          contactLastname: 'Payer',
          totalAmount: 250,
          currency: 'ZZZ',
          paymentMethod: 'QR_PAYMENT',
        },
      })
    ).id;
    connectionId = (
      await client.bankConnection.create({
        data: {
          ownerId: userId,
          provider: 'FIO',
          mode: 'LIVE',
          name: 'Fixture',
          accountIdentifier: `CZ${randomUUID().replaceAll('-', '').slice(0, 20)}`,
          variableSymbolPrefix: '82',
          prefixEffectiveFrom: new Date('2026-10-01T00:00:00Z'),
        },
      })
    ).id;
  });
  afterEach(async () => {
    await client.entryPayment.deleteMany({ where: { eventId } });
    await client.bankConnection.deleteMany({ where: { ownerId: userId } });
    await client.entry.deleteMany({ where: { eventId } });
    await client.event.delete({ where: { id: eventId } });
    await client.user.delete({ where: { id: userId } });
    await client.sport.delete({ where: { id: sportId } });
  });
  afterAll(async () => {
    await client.$disconnect();
    await second.$disconnect();
  });

  it('stores one transaction and one receipt for concurrent identical reports', async () => {
    const results = await Promise.all(
      [client, second].map((db) =>
        reportBankTransactions(db, userId, connectionId, device, [item('9001', '250.00')]),
      ),
    );
    expect(results.map(([result]) => result!.status).sort()).toEqual(['DUPLICATE', 'MATCHED']);
    expect(await client.bankTransaction.count({ where: { connectionId } })).toBe(1);
    expect(await client.entryPayment.count({ where: { entryId, source: 'BANK_IMPORT' } })).toBe(1);
    expect((await client.entry.findUniqueOrThrow({ where: { id: entryId } })).paid).toBe(true);
    // One push for the transaction, never a second one for the retry.
    expect(
      await client.bankPaymentNotification.findMany({
        where: { userId },
        select: { matchingStatus: true },
      }),
    ).toEqual([{ matchingStatus: 'MATCHED' }]);
  });

  it('completes a partial payment with a second transfer', async () => {
    const [first] = await reportBankTransactions(client, userId, connectionId, device, [
      item('9002', '100.00'),
    ]);
    expect(first!.status).toBe('PARTIALLY_PAID');
    expect((await client.entry.findUniqueOrThrow({ where: { id: entryId } })).paid).toBe(false);
    const [rest] = await reportBankTransactions(client, userId, connectionId, device, [
      item('9003', '150.00'),
    ]);
    expect(rest!.status).toBe('MATCHED');
    expect((await client.entry.findUniqueOrThrow({ where: { id: entryId } })).paid).toBe(true);
  });
});
