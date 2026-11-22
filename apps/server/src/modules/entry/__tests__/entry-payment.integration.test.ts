import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrismaClient } from '../../../db/prisma-client.js';
import { Prisma } from '../../../generated/prisma/client.js';

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
vi.mock('../../../utils/context.js', async () => {
  const { createPrismaClient } = await import('../../../db/prisma-client.js');
  return {
    default: createPrismaClient(settings.url ?? 'mysql://root@127.0.0.1:13381/ofeed_payment_test'),
  };
});
import client from '../../../utils/context.js';
import { listEntryPayments, recordEntryPayment } from '../entry-payment.service.js';
import {
  createEntryOrder,
  updateEntryOrderForGraphQL,
  updateEntryOrderPaid,
} from '../entry.service.js';
import {
  listNotifications,
  markNotificationsRead,
} from '../../notifications/notifications.service.js';
import { enqueueUserNotification } from '../../notifications/notifications.write.js';
import { anonymizeCurrentUserAccount } from '../../user/user.service.js';
vi.mock('../entry.email.js', () => ({
  notifyEntryOrderReceived: vi.fn(),
  notifyEntryOrderProcessed: vi.fn(),
}));
import { deleteAllEventData } from '../../event/event.service.js';

// This suite only creates/removes synthetic fixtures in an explicitly opted-in local DB.
describe.skipIf(!settings.url)('entry payments on disposable MariaDB', () => {
  const second = createPrismaClient(
    settings.url ?? 'mysql://root@127.0.0.1:13381/ofeed_payment_test',
  );
  let eventId: string;
  let entryId: string;
  let userId: number;
  let sportId: number;
  let currencyId: number;
  let classId: number;
  let auth: { isAuthenticated: true; type: 'jwt'; userId: number };
  const input = (amount = 100, deviceId = 'desk-1') => ({
    clientPaymentId: randomUUID(),
    method: 'CASH' as const,
    amount,
    currency: 'ZZZ',
    paidAt: '2026-10-25T09:00:00Z',
    deviceId,
  });
  const entry = () => client.entry.findUniqueOrThrow({ where: { id: entryId } });
  const pay = (amount = 100, db = client) =>
    recordEntryPayment(db, auth, eventId, entryId, input(amount));
  const edit = (db = client) =>
    updateEntryOrderForGraphQL(db, auth, {
      entryId,
      contactEmail: 'cashier@payment.invalid',
      contactFirstname: 'Test',
      contactLastname: 'Operator',
      paymentMethod: 'CASH',
      items: [
        {
          classId,
          firstname: 'Test',
          lastname: 'Runner',
          birthYear: 1990,
          card: 12345,
          cardRental: false,
        },
      ],
    });
  beforeEach(async () => {
    const user = await client.user.create({
      data: {
        email: `${randomUUID()}@payment.invalid`,
        firstname: 'Test',
        lastname: 'Operator',
        password: 'not-a-real-credential',
      },
    });
    userId = user.id;
    auth = { isAuthenticated: true, type: 'jwt', userId };
    const sport = await client.sport.create({ data: { name: `payment-${randomUUID()}` } });
    sportId = sport.id;
    const currency = await client.currency.upsert({
      where: { iso4217Alpha3: 'ZZZ' },
      create: { name: 'Payment test currency', iso4217Alpha3: 'ZZZ' },
      update: {},
    });
    currencyId = currency.id;
    const event = await client.event.create({
      data: {
        name: 'Payment integration fixture',
        date: new Date('2026-10-25T09:00:00Z'),
        authorId: userId,
        sportId,
        currencyId,
        defaultStartMode: 'FreeStart',
        paymentMethods: { create: { type: 'CASH', enabled: true, position: 0 } },
      },
    });
    eventId = event.id;
    const cls = await client.class.create({
      data: { eventId, name: 'Test', fee: 300, externalId: '1', maxNumberOfCompetitors: 50 },
    });
    classId = cls.id;
    const order = await client.entry.create({
      data: {
        eventId,
        paymentReference: '1',
        contactEmail: 'cashier@payment.invalid',
        contactFirstname: 'Test',
        contactLastname: 'Operator',
        totalAmount: 250,
        currency: 'ZZZ',
        paymentMethod: 'CASH',
      },
    });
    entryId = order.id;
  });
  afterEach(async () => {
    await client.entryPayment.deleteMany({ where: { eventId } });
    await client.entry.deleteMany({ where: { eventId } });
    await client.class.deleteMany({ where: { eventId } });
    await client.event.delete({ where: { id: eventId } });
    await client.user.delete({ where: { id: userId } });
    await client.sport.delete({ where: { id: sportId } });
  });
  afterAll(async () => {
    await client.$disconnect();
    await second.$disconnect();
  });

  it('preserves concurrent receipts and derives paid without lost updates', async () => {
    await Promise.all([pay(100), pay(150, second)]);
    expect((await entry()).paid).toBe(true);
    expect(await client.entryPayment.count({ where: { entryId } })).toBe(2);
    expect(
      await client.userNotification.count({ where: { entryId, kind: 'ENTRY_PAYMENT_RECEIVED' } }),
    ).toBe(2);
    expect(await client.entryStatusHistory.count({ where: { entryId, paymentState: true } })).toBe(
      1,
    );
  });
  it('deduplicates simultaneous retries and rejects cross-entry identity reuse', async () => {
    const data = input(250);
    const results = await Promise.all(
      [client, second].map((db) => recordEntryPayment(db, auth, eventId, entryId, data)),
    );
    expect(results.map((r) => r.created).sort()).toEqual([false, true]);
    expect(results[0].payment.id).toBe(results[1].payment.id);
    expect(
      await client.userNotification.count({ where: { entryId, kind: 'ENTRY_PAYMENT_RECEIVED' } }),
    ).toBe(1);
    const other = await client.entry.create({
      data: {
        eventId,
        paymentReference: '2',
        contactEmail: 'other@payment.invalid',
        contactFirstname: 'Other',
        contactLastname: 'Test',
        totalAmount: 250,
        currency: 'ZZZ',
      },
    });
    await expect(recordEntryPayment(second, auth, eventId, other.id, data)).rejects.toThrow(
      'different payment payload',
    );
    expect(await client.entryPayment.count({ where: { eventId } })).toBe(1);
  });
  it('arbitrates simultaneous identity reuse across two different entries', async () => {
    const other = await client.entry.create({
      data: {
        eventId,
        paymentReference: '2',
        contactEmail: 'other@payment.invalid',
        contactFirstname: 'Other',
        contactLastname: 'Test',
        totalAmount: 250,
        currency: 'ZZZ',
      },
    });
    const data = input(250);
    const results = await Promise.allSettled([
      recordEntryPayment(client, auth, eventId, entryId, data),
      recordEntryPayment(second, auth, eventId, other.id, data),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(await client.entryPayment.count({ where: { eventId } })).toBe(1);
    const rows = await client.entry.findMany({ where: { eventId } });
    expect(rows.filter((r) => r.paid)).toHaveLength(1);
  });
  it('serializes repeated cash settlement and collects a partial balance once', async () => {
    await pay(100);
    await Promise.all([
      updateEntryOrderPaid(client, { eventId, entryId, paid: true, changedById: userId }),
      updateEntryOrderPaid(second, { eventId, entryId, paid: true, changedById: userId }),
    ]);
    expect((await entry()).paid).toBe(true);
    const receipts = await client.entryPayment.findMany({ where: { eventId, entryId } });
    expect(receipts).toHaveLength(2);
    expect(receipts.reduce((sum, receipt) => sum + receipt.amount.toNumber(), 0)).toBe(250);
    await updateEntryOrderPaid(client, { eventId, entryId, paid: true, changedById: userId });
    expect(await client.entryPayment.count({ where: { eventId, entryId } })).toBe(2);
    expect(
      await client.userNotification.count({ where: { entryId, kind: 'ENTRY_PAYMENT_RECEIVED' } }),
    ).toBe(2);
    await expect(
      updateEntryOrderPaid(client, { eventId, entryId, paid: false, changedById: userId }),
    ).rejects.toThrow('managed by payment receipts');
  });
  it('recalculates after repricing and serializes concurrent receipt/order edits', async () => {
    await pay(250);
    expect((await entry()).paid).toBe(true);
    await edit();
    expect((await entry()).paid).toBe(false);
    await Promise.all([pay(50, second), edit()]);
    expect((await entry()).totalAmount.toNumber()).toBe(300);
    expect((await entry()).paid).toBe(true);
    await client.class.update({ where: { id: classId }, data: { fee: 200 } });
    await edit();
    expect((await entry()).paid).toBe(true);
  });
  it('rejects a currency-changing edit without changing the order', async () => {
    await pay();
    await client.entry.update({ where: { id: entryId }, data: { currency: 'EUR' } });
    await expect(edit()).rejects.toThrow('Cannot change the currency');
    expect((await entry()).totalAmount.toNumber()).toBe(250);
  });
  it('rolls back the receipt if the paid-state write fails', async () => {
    const transaction = client.$transaction.bind(client);
    const proxy = new Proxy(client, {
      get(target, key) {
        if (key === '$transaction')
          return (operation: (tx: Prisma.TransactionClient) => Promise<unknown>, options: object) =>
            transaction(async (tx) => {
              const fail = new Proxy(tx, {
                get(inner, field) {
                  if (field === 'entry')
                    return {
                      ...inner.entry,
                      update: async () => {
                        throw new Error('synthetic audit failure');
                      },
                    };
                  return Reflect.get(inner, field);
                },
              });
              return operation(fail);
            }, options);
        return Reflect.get(target, key);
      },
    });
    await expect(pay(250, proxy)).rejects.toThrow('synthetic audit failure');
    expect(await client.entryPayment.count({ where: { entryId } })).toBe(0);
    expect(await client.userNotification.count({ where: { entryId } })).toBe(0);
    expect((await entry()).paid).toBe(false);
  });
  it('creates one owner inbox message for a guest order and rolls it back with the source', async () => {
    await client.event.update({
      where: { id: eventId },
      data: { entriesOpenAt: new Date('2020-01-01T00:00:00Z') },
    });
    const input = {
      contactEmail: 'guest@payment.invalid',
      contactFirstname: 'Test',
      contactLastname: 'Guest',
      paymentMethod: 'CASH' as const,
      items: [
        {
          classId,
          firstname: 'Test',
          lastname: 'Runner',
          birthYear: 1990,
          card: 55555,
          cardRental: false,
        },
      ],
    };
    const order = await createEntryOrder(client, { eventId, userId: null }, input);
    const page = await listNotifications(client, auth, { first: 20 });
    expect(page.notifications).toMatchObject([
      { kind: 'ENTRY_ORDER_RECEIVED', entryId: order.id, itemCount: 1 },
    ]);
    expect(page.unreadCount).toBe(1);
    await expect(
      client.$transaction(async (tx) => {
        const pending = await createEntryOrder(
          tx,
          { eventId, userId: null },
          {
            ...input,
            items: [{ ...input.items[0], card: 55556 }],
          },
          { tx, afterCommit: [] },
        );
        expect(await tx.userNotification.count({ where: { entryId: pending.id } })).toBe(1);
        throw new Error('rollback order');
      }),
    ).rejects.toThrow('rollback order');
    expect(await client.userNotification.count({ where: { eventId } })).toBe(1);
  });
  it('enforces physical deduplication, ownership, read state and retention', async () => {
    const source = { kind: 'ENTRY_ORDER_RECEIVED' as const, entryId, itemCount: 1 };
    await Promise.all(
      [client, second].map((db) =>
        db.$transaction((tx) => enqueueUserNotification(tx, eventId, source)),
      ),
    );
    expect(await client.userNotification.count({ where: { eventId } })).toBe(1);
    const firstPage = await listNotifications(client, auth, {});
    await markNotificationsRead(client, auth, firstPage.notifications[0].id);
    await markNotificationsRead(client, auth, firstPage.notifications[0].id);
    expect((await listNotifications(client, auth, {})).unreadCount).toBe(0);
    await client.event.update({ where: { id: eventId }, data: { authorId: null } });
    expect((await listNotifications(client, auth, {})).notifications).toEqual([]);
    await client.event.update({ where: { id: eventId }, data: { authorId: userId } });
    await client.userNotification.updateMany({
      where: { eventId },
      data: { createdAt: new Date(Date.now() - 91 * 86_400_000) },
    });
    expect((await listNotifications(client, auth, {})).notifications).toEqual([]);
  });
  it('isolates other users and erases the inbox when its owner anonymizes the account', async () => {
    await pay();
    const outsider = await client.user.create({
      data: {
        email: `${randomUUID()}@notification.invalid`,
        firstname: 'Other',
        lastname: 'User',
        password: 'not-a-real-credential',
      },
    });
    try {
      const otherAuth = { ...auth, userId: outsider.id };
      expect((await listNotifications(client, otherAuth, {})).notifications).toEqual([]);
      const own = await listNotifications(client, auth, {});
      await markNotificationsRead(client, otherAuth, own.notifications[0].id);
      expect((await listNotifications(client, auth, {})).unreadCount).toBe(1);
      await client.user.update({
        where: { id: userId },
        data: { password: await argon2.hash('fixture-password') },
      });
      await anonymizeCurrentUserAccount(auth, {
        currentPassword: 'fixture-password',
        deleteEvents: false,
      });
      expect(await client.userNotification.count({ where: { userId } })).toBe(0);
      await client.$transaction((tx) =>
        enqueueUserNotification(tx, eventId, {
          kind: 'ENTRY_ORDER_RECEIVED',
          entryId,
          itemCount: 1,
        }),
      );
      expect(await client.userNotification.count({ where: { userId } })).toBe(0);
    } finally {
      await client.user.delete({ where: { id: outsider.id } });
    }
  });
  it('filters late uploads by server recording time and distinguishes desks', async () => {
    const first = await recordEntryPayment(client, auth, eventId, entryId, input(100, 'desk-1'));
    await recordEntryPayment(second, auth, eventId, entryId, input(150, 'desk-2'));
    const all = await listEntryPayments(client, auth, eventId, { since: first.payment.recordedAt });
    expect(all).toHaveLength(2);
    expect(all[0].paidAt < first.payment.recordedAt).toBe(true);
    expect(await listEntryPayments(client, auth, eventId, { deviceId: 'desk-2' })).toHaveLength(1);
    expect(await listEntryPayments(client, auth, eventId, { deviceId: 'missing' })).toEqual([]);
  });
  it('blocks single entry deletion and raw event cascade while receipts exist', async () => {
    await pay();
    await expect(client.entry.delete({ where: { id: entryId } })).rejects.toThrow();
    // Remove unrelated restrictive class FKs inside the same transaction, so
    // this assertion specifically proves that a raw event cascade preserves receipts.
    await expect(
      client.$transaction(async (tx) => {
        await tx.class.deleteMany({ where: { eventId } });
        await tx.event.delete({ where: { id: eventId } });
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    expect(await client.class.count({ where: { eventId } })).toBe(1);
    expect(await client.entryPayment.count({ where: { eventId } })).toBe(1);
  });
  it('deletes receipts, entries and classes on event data reset', async () => {
    await pay();
    await deleteAllEventData(eventId, client);
    expect(await client.entryPayment.count({ where: { eventId } })).toBe(0);
    expect(await client.entry.count({ where: { eventId } })).toBe(0);
    expect(await client.class.count({ where: { eventId } })).toBe(0);
    // afterEach deletes the event row, proving nothing restrictive is left behind.
  });
  it('enforces entry/event consistency at the database boundary', async () => {
    await expect(
      client.entryPayment.create({
        data: {
          ...input(),
          paidAt: new Date(),
          eventId: 'wrong-event',
          entryId,
          operatorId: userId,
        },
      }),
    ).rejects.toThrow();
  });
});
