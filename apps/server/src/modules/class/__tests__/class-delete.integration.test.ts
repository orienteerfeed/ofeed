import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPrismaClient } from '../../../db/prisma-client.js';
import { deleteClassForGraphQL } from '../class.service.js';
const url = process.env.CLASS_DELETE_TEST_DATABASE_URL;
if (
  url &&
  (!['localhost', '127.0.0.1', '::1'].includes(new URL(url).hostname) ||
    !/^\/ofeed_class_delete_test(?:_|$)/.test(new URL(url).pathname))
) {
  throw new Error(
    'Class deletion integration tests require a local ofeed_class_delete_test database',
  );
}
describe.skipIf(!url)('class deletion on MariaDB', () => {
  it('removes class dependants and preserves financial/shared data atomically', async () => {
    const db = createPrismaClient(url);

    const rollback = new Error('ROLLBACK_SYNTHETIC_FIXTURES');
    let eventId = '';
    try {
      await db
        .$transaction(
          async (tx) => {
            const user = await tx.user.create({
              data: {
                email: randomUUID() + '@class-delete.invalid',
                firstname: 'Fixture',
                lastname: 'Owner',
                password: 'fixture',
              },
            });
            const sport = await tx.sport.create({ data: { name: 'class-delete-' + randomUUID() } });
            const currency = await tx.currency.create({
              data: { name: 'Class deletion fixture', iso4217Alpha3: 'ZZZ' },
            });
            const event = await tx.event.create({
              data: {
                sportId: sport.id,
                currencyId: currency.id,
                authorId: user.id,
                name: 'Synthetic class deletion fixture',
                date: new Date(),
              },
            });
            eventId = event.id;
            const course = await tx.course.create({ data: { eventId, name: 'Shared' } });
            const cls = await tx.class.create({
              data: { eventId, name: 'Delete', courseId: course.id },
            });
            const other = await tx.class.create({
              data: { eventId, name: 'Keep', courseId: course.id },
            });
            const organisation = await tx.organisation.create({
              data: { eventId, name: 'Shared club' },
            });
            const team = await tx.team.create({
              data: {
                classId: cls.id,
                name: 'Delete team',
                bibNumber: 1,
                organisationId: organisation.id,
              },
            });
            const runner = await tx.competitor.create({
              data: {
                classId: cls.id,
                firstname: 'Delete',
                lastname: 'Runner',
                registration: '',
                teamId: team.id,
              },
            });
            const keeper = await tx.competitor.create({
              data: {
                classId: other.id,
                firstname: 'Keep',
                lastname: 'Runner',
                registration: '',
                teamId: team.id,
              },
            });
            const split = await tx.split.create({
              data: { competitorId: runner.id, controlCode: 31, time: 100 },
            });
            const punch = await tx.punch.create({
              data: {
                eventId,
                card: 123,
                controlCode: 31,
                punchTime: new Date(),
                competitorId: runner.id,
                splitId: split.id,
                receipts: {
                  create: {
                    eventId,
                    deviceId: 'fixture',
                    clientPunchId: randomUUID(),
                    source: 'READOUT',
                    receivedAt: new Date(),
                    authorId: user.id,
                  },
                },
              },
            });
            const unassigned = await tx.punch.create({
              data: { eventId, card: 456, controlCode: 31, punchTime: new Date() },
            });
            await tx.protocol.create({
              data: {
                eventId,
                competitorId: runner.id,
                authorId: user.id,
                origin: 'OFFICE',
                type: 'competitor_create',
                newValue: 'fixture',
              },
            });
            await tx.startSlotVacancy.create({ data: { classId: cls.id, startTime: new Date() } });
            const entry = await tx.entry.create({
              data: {
                eventId,
                paymentReference: '1',
                contactEmail: 'fixture@class-delete.invalid',
                contactFirstname: 'Test',
                contactLastname: 'Fixture',
                totalAmount: 250,
                currency: 'CZK',
                items: {
                  create: [
                    {
                      classId: cls.id,
                      firstname: 'Delete',
                      lastname: 'Runner',
                      competitorId: runner.id,
                      fee: 100,
                    },
                    { classId: other.id, firstname: 'Keep', lastname: 'Runner', fee: 150 },
                  ],
                },
              },
            });
            await tx.entryPayment.create({
              data: {
                eventId,
                entryId: entry.id,
                clientPaymentId: randomUUID(),
                method: 'CASH',
                amount: 250,
                currency: 'CZK',
                paidAt: new Date(),
                deviceId: 'fixture',
                operatorId: user.id,
              },
            });
            const proxy = new Proxy(tx, {
              get(target, key) {
                if (key === '$transaction')
                  return async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx);
                return Reflect.get(target, key);
              },
            });
            await deleteClassForGraphQL(
              proxy as never,
              { isAuthenticated: true, type: 'jwt', userId: user.id },
              eventId,
              cls.id,
            );
            assert.equal(await tx.class.count({ where: { id: cls.id } }), 0);
            assert.equal(await tx.team.count({ where: { id: team.id } }), 0);
            assert.equal(await tx.competitor.count({ where: { id: runner.id } }), 0);
            assert.equal(await tx.protocol.count({ where: { eventId } }), 0);
            assert.equal(await tx.split.count({ where: { id: split.id } }), 0);
            assert.equal(await tx.punch.count({ where: { id: punch.id } }), 0);
            assert.equal(await tx.punchReceipt.count({ where: { eventId } }), 0);
            assert.equal(await tx.startSlotVacancy.count({ where: { classId: cls.id } }), 0);
            assert.equal(await tx.entryItem.count({ where: { entryId: entry.id } }), 1);
            assert.equal(
              (
                await tx.entry.findUniqueOrThrow({ where: { id: entry.id } })
              ).totalAmount.toNumber(),
              250,
            );
            assert.equal(await tx.entryPayment.count({ where: { eventId } }), 1);
            assert.equal(await tx.class.count({ where: { id: other.id } }), 1);
            assert.equal(
              (await tx.competitor.findUniqueOrThrow({ where: { id: keeper.id } })).teamId,
              null,
            );
            assert.equal(await tx.course.count({ where: { id: course.id } }), 1);
            assert.equal(await tx.organisation.count({ where: { id: organisation.id } }), 1);
            assert.equal(await tx.punch.count({ where: { id: unassigned.id } }), 1);
            throw rollback;
          },
          { timeout: 30000 },
        )
        .catch((error) => {
          if (error !== rollback) throw error;
        });
      assert.equal(await db.event.count({ where: { id: eventId } }), 0);
    } finally {
      await db.$disconnect();
    }
  }, 30000);
});
