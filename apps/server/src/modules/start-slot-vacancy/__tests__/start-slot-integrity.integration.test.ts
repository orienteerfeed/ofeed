import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrismaClient } from '../../../db/prisma-client.js';

const settings = vi.hoisted(() => ({ url: process.env.SLOT_TEST_DATABASE_URL }));
if (settings.url) {
  const url = new URL(settings.url);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !/^\/ofeed_slot_test(?:_|$)/.test(url.pathname)
  ) {
    throw new Error('Slot tests require a disposable local ofeed_slot_test database');
  }
}
vi.mock('../../../utils/context.js', async () => {
  const { createPrismaClient } = await import('../../../db/prisma-client.js');
  return {
    default: createPrismaClient(settings.url ?? 'mysql://root@127.0.0.1:13383/ofeed_slot_test'),
  };
});
vi.mock('../../../utils/subscriptionUtils.js', () => ({
  publishUpdatedCompetitor: vi.fn().mockResolvedValue(undefined),
  publishUpdatedCompetitors: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../entry/entry.email.js', () => ({
  notifyEntryOrderReceived: vi.fn(),
  notifyEntryOrderProcessed: vi.fn(),
}));

import client from '../../../utils/context.js';
import { storeCompetitor, updateCompetitor } from '../../event/event.service.js';
import {
  createEntryOrder,
  processEntryOrder,
  updateEntryOrderStatus,
  updateEntryOrderForGraphQL,
} from '../../entry/entry.service.js';
import {
  listEventEntryAvailability,
  updateStartSlotVacancyForGraphQL,
  deleteStartSlotVacancyForGraphQL,
} from '../start-slot-vacancy.service.js';

// Separate clients use separate database connections; no in-memory serialization.
describe.skipIf(!settings.url)('G19 slot integrity on disposable MariaDB', () => {
  const second = createPrismaClient(settings.url ?? 'mysql://root@127.0.0.1:13383/ofeed_slot_test');
  const A = new Date('2026-10-26T09:00:00Z');
  const B = new Date('2026-10-26T09:02:00Z');
  let eventId: string;
  let classId: number;
  let userId: number;
  let sportId: number;
  let currencyId: number;

  beforeEach(async () => {
    userId = (
      await client.user.create({
        data: {
          email: `${randomUUID()}@slot.invalid`,
          firstname: 'Slot',
          lastname: 'Test',
          password: 'fixture-only',
        },
      })
    ).id;
    sportId = (await client.sport.create({ data: { name: `slots-${randomUUID()}` } })).id;
    currencyId = (
      await client.currency.create({
        data: {
          name: `Slot fixture ${randomUUID()}`,
          iso4217Alpha3: 'ZZS',
        },
      })
    ).id;
    eventId = (
      await client.event.create({
        data: {
          name: 'Slot fixture',
          date: A,
          sportId,
          authorId: userId,
          currencyId,
          entriesOpenAt: new Date('2026-01-01'),
          defaultStartMode: 'StartList',
        },
      })
    ).id;
    classId = (
      await client.class.create({
        data: {
          eventId,
          name: 'H21',
          maxNumberOfCompetitors: 20,
        },
      })
    ).id;
    await client.startSlotVacancy.createMany({
      data: [A, B].map((startTime) => ({ classId, startTime })),
    });
  });
  afterEach(async () => {
    if (!eventId) return;
    await client.entry.deleteMany({ where: { eventId } });
    await client.protocol.deleteMany({ where: { eventId } });
    await client.competitor.deleteMany({ where: { class: { eventId } } });
    await client.startSlotVacancy.deleteMany({ where: { class: { eventId } } });
    await client.class.deleteMany({ where: { eventId } });
    await client.event.delete({ where: { id: eventId } });
    await client.user.delete({ where: { id: userId } });
    await client.sport.delete({ where: { id: sportId } });
    await client.currency.delete({ where: { id: currencyId } });
  });
  afterAll(async () => {
    await Promise.all([client.$disconnect(), second.$disconnect()]);
  });

  const input = (startTime = A) => ({
    contactEmail: 'slot@example.invalid',
    contactFirstname: 'Slot',
    contactLastname: 'Test',
    paymentMethod: 'CASH' as const,
    items: [
      {
        classId,
        firstname: 'Test',
        lastname: 'Runner',
        registration: 'TST9501',
        card: 123456,
        cardRental: false,
        startTime: startTime.toISOString(),
      },
    ],
  });
  const order = (db = client, time = A) =>
    createEntryOrder(db, { eventId, userId: null }, input(time));
  const runner = (time = A) =>
    storeCompetitor(
      eventId,
      {
        classId,
        firstname: 'Direct',
        lastname: 'Runner',
        startTime: time,
      },
      userId,
      'OFFICE',
    );
  const slots = async () =>
    (await listEventEntryAvailability(second, eventId))!.classes
      .find((cls) => cls.id === classId)!
      .slots.map((slot) => slot.startTime);
  const assertOneWinner = (results: PromiseSettledResult<unknown>[]) => {
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(
      (result) => result.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ statusCode: 409, errorCode: 'SLOT_TAKEN' });
  };

  it('reserves on submission and frees on cancellation', async () => {
    const entry = await order();
    expect(await slots()).toEqual([B]);
    await expect(order(second)).rejects.toMatchObject({ statusCode: 409, errorCode: 'SLOT_TAKEN' });
    await expect(runner()).rejects.toMatchObject({ statusCode: 409, errorCode: 'SLOT_TAKEN' });
    await updateEntryOrderStatus(client, { eventId, entryId: entry.id, status: 'CANCELLED' });
    expect(await slots()).toEqual([A, B]);
    await order(second);
  });

  it('prevents moving or deleting a vacancy held by an order', async () => {
    await order();
    const vacancy = await client.startSlotVacancy.findUniqueOrThrow({
      where: {
        classId_startTime: { classId, startTime: A },
      },
    });
    const auth = { isAuthenticated: true as const, type: 'jwt' as const, userId };
    await expect(
      updateStartSlotVacancyForGraphQL(second, auth, {
        id: vacancy.id,
        startTime: new Date('2026-10-26T10:00:00Z'),
      }),
    ).rejects.toMatchObject({ statusCode: 409, errorCode: 'SLOT_TAKEN' });
    await expect(deleteStartSlotVacancyForGraphQL(second, auth, vacancy.id)).rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'SLOT_TAKEN',
    });
    expect(await slots()).toEqual([B]);
  });

  it('allows only one of two simultaneous orders without idempotency keys', async () => {
    assertOneWinner(await Promise.allSettled([order(client), order(second)]));
    expect(await client.entryItem.count({ where: { classId, startTime: A } })).toBe(1);
  });

  it('serializes an order against direct competitor creation', async () => {
    assertOneWinner(await Promise.allSettled([order(second), runner()]));
    const held =
      (await client.entryItem.count({ where: { classId, startTime: A } })) +
      (await client.competitor.count({ where: { classId, startTime: A } }));
    expect(held).toBe(1);
  });

  it('serializes an order against a PUT time change', async () => {
    const created = await runner(B);
    assertOneWinner(
      await Promise.allSettled([
        order(second),
        updateCompetitor(eventId, created.competitor.id, 'OFFICE', { startTime: A }, userId),
      ]),
    );
    const held =
      (await client.entryItem.count({ where: { classId, startTime: A } })) +
      (await client.competitor.count({ where: { classId, startTime: A } }));
    expect(held).toBe(1);
  });

  it('exchanges vacancies atomically and preserves PUT omission/own time', async () => {
    const created = await runner();
    const id = created.competitor.id;
    await updateCompetitor(eventId, id, 'OFFICE', { note: 'changed' }, userId);
    await updateCompetitor(eventId, id, 'OFFICE', { startTime: A }, userId);
    expect(await slots()).toEqual([B]);
    await updateCompetitor(eventId, id, 'OFFICE', { startTime: B }, userId);
    expect(await slots()).toEqual([A]);
    expect(await client.startSlotVacancy.count({ where: { classId, startTime: A } })).toBe(1);
    await expect(
      updateCompetitor(
        eventId,
        id,
        'OFFICE',
        {
          startTime: new Date('2026-10-26T12:00:00Z'),
        },
        userId,
      ),
    ).rejects.toMatchObject({ statusCode: 409, errorCode: 'SLOT_TAKEN' });
    expect((await client.competitor.findUniqueOrThrow({ where: { id } })).startTime).toEqual(B);
    expect(await slots()).toEqual([A]);
  });

  it('rolls back vacancy consumption when the competitor write fails', async () => {
    const created = await runner();
    await expect(
      updateCompetitor(
        eventId,
        created.competitor.id,
        'OFFICE',
        {
          startTime: B,
          teamId: 4294967294,
        },
        userId,
      ),
    ).rejects.toThrow();
    expect(await slots()).toEqual([B]);
    expect(
      (await client.competitor.findUniqueOrThrow({ where: { id: created.competitor.id } }))
        .startTime,
    ).toEqual(A);
  });

  it('preserves the old time on a class-only PUT and releases the old slot', async () => {
    const created = await runner();
    const target = await client.class.create({
      data: { eventId, name: 'D21', maxNumberOfCompetitors: 20 },
    });
    await client.startSlotVacancy.create({ data: { classId: target.id, startTime: B } });
    await expect(
      updateCompetitor(
        eventId,
        created.competitor.id,
        'OFFICE',
        {
          classId: target.id,
        },
        userId,
      ),
    ).rejects.toMatchObject({ statusCode: 409, errorCode: 'SLOT_TAKEN' });
    await client.startSlotVacancy.create({ data: { classId: target.id, startTime: A } });
    await updateCompetitor(
      eventId,
      created.competitor.id,
      'OFFICE',
      { classId: target.id },
      userId,
    );
    expect(await slots()).toEqual([A, B]);
    expect(
      (await client.competitor.findUniqueOrThrow({ where: { id: created.competitor.id } }))
        .startTime,
    ).toEqual(A);
    expect(
      await client.startSlotVacancy.count({ where: { classId: target.id, startTime: A } }),
    ).toBe(0);
  });

  it('transfers the reservation once when processing concurrently', async () => {
    const entry = await order();
    await updateEntryOrderStatus(client, { eventId, entryId: entry.id, status: 'APPROVED' });
    const process = (db = client) => processEntryOrder(db, { eventId, entryId: entry.id, userId });
    const results = await Promise.allSettled([process(client), process(second)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await client.competitor.count({ where: { classId, startTime: A } })).toBe(1);
    const item = await client.entryItem.findFirstOrThrow({ where: { entryId: entry.id } });
    expect(item.competitorId).not.toBeNull();
    expect(await slots()).toEqual([B]);
  });

  it('serializes an order edit against a new order claiming the target time', async () => {
    const entry = await order(client, B);
    const auth = { isAuthenticated: true as const, type: 'jwt' as const, userId };
    assertOneWinner(
      await Promise.allSettled([
        updateEntryOrderForGraphQL(client, auth, { entryId: entry.id, ...input(A) }),
        order(second),
      ]),
    );
    expect(await client.entryItem.count({ where: { classId, startTime: A } })).toBe(1);
  });

  it.each(['MassStart', 'WaveStart', 'PursuitStart', 'FreeStart'] as const)(
    'allows shared times while preserving configured vacancies for %s',
    async (startMode) => {
      await client.class.update({ where: { id: classId }, data: { startMode } });
      await Promise.all([order(client), order(second)]);
      const [first] = await Promise.all([runner(), runner()]);
      await updateCompetitor(
        eventId,
        first.competitor.id,
        'OFFICE',
        { startTime: B },
        userId,
      );
      expect(await client.competitor.count({ where: { classId } })).toBe(2);
      expect(await client.competitor.count({ where: { classId, startTime: B } })).toBe(1);
      expect(await client.startSlotVacancy.count({ where: { classId } })).toBe(2);
    },
  );
});
