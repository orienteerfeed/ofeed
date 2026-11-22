import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrismaClient } from '../../../db/prisma-client.js';
import type { PunchBatch } from '../../punch/punch.schema.js';

const settings = vi.hoisted(() => ({ url: process.env.FAVORITES_TEST_DATABASE_URL }));
if (settings.url) {
  const url = new URL(settings.url);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !/^\/ofeed_payment_test(?:_|$)/.test(url.pathname)
  )
    throw new Error(
      'Favorites integration tests require a disposable local ofeed_payment_test database',
    );
}
vi.mock('../../../utils/context.js', async () => {
  const { createPrismaClient } = await import('../../../db/prisma-client.js');
  return {
    default: createPrismaClient(
      settings.url ?? 'mysql://root@127.0.0.1:13393/ofeed_payment_test_notifications',
    ),
  };
});
vi.mock('../../../utils/subscriptionUtils.js', () => ({
  publishUpdatedCompetitor: vi.fn(),
  publishUpdatedCompetitors: vi.fn(),
}));
import client from '../../../utils/context.js';
import {
  favoriteCompetitorIds,
  selectedEventCompetitors,
  setCompetitorFavorite,
} from '../favorites.service.js';
import {
  listNotifications,
  markNotificationsRead,
} from '../../notifications/notifications.service.js';
import { eventPunchTransaction } from '../../punch/punch-write.js';
import { ingestPunches } from '../../punch/punch.service.js';
import { upsertCompetitor } from '../../upload/upload.competitor.js';
import { upsertSplits } from '../../upload/upload.split.js';
import { processMopDocument } from '../../meos/meos.service.js';
import { listAthleteFollows, mutateAthleteFollow } from '../athlete-follows.service.js';

describe.skipIf(!settings.url)('competitor favorites on disposable MariaDB', () => {
  const second = createPrismaClient(
    settings.url ?? 'mysql://root@127.0.0.1:13393/ofeed_payment_test_notifications',
  );
  const at = (seconds: number) => new Date(Date.parse('2026-11-13T09:00:00Z') + seconds * 1000);
  let eventId: string,
    classId: number,
    competitorId: number,
    ownerId: number,
    userId: number,
    sportId: number;
  let additionalEvents: string[];
  const matchingCompetitor = async (source: 'ORIS' | 'EVENTOR' | null = null) => {
    const initial = await client.event.findUniqueOrThrow({
      where: { id: eventId },
      select: { currencyId: true },
    });
    const event = await client.event.create({
      data: {
        name: 'Other followed race',
        date: at(0),
        sportId,
        currencyId: initial.currencyId,
        authorId: ownerId,
        published: true,
        externalSource: source,
        defaultStartMode: 'FreeStart',
      },
    });
    additionalEvents.push(event.id);
    const cls = await client.class.create({ data: { eventId: event.id, name: 'Other class' } });
    const runner = await client.competitor.create({
      data: {
        classId: cls.id,
        registration: 'TST9001',
        firstname: 'Test',
        lastname: 'Runner',
        status: 'Inactive',
      },
    });
    return { eventId: event.id, competitorId: runner.id };
  };
  const auth = () => ({ isAuthenticated: true, type: 'jwt', userId } as const);
  const ownerAuth = () => ({ ...auth(), userId: ownerId });
  const follow = (favorite = true, db = client) =>
    setCompetitorFavorite(db, auth(), { eventId, competitorId, favorite });
  const messages = () =>
    client.userNotification.findMany({
      where: { userId, eventId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  const punch = (code: number, seconds: number, source: 'SRR' | 'READOUT' = 'SRR'): PunchBatch => ({
    source,
    deviceId: 'favorite-reader',
    punches: [
      {
        clientPunchId: randomUUID(),
        card: 8123456,
        controlCode: code,
        punchTime: at(seconds).toISOString(),
        receivedAt: at(seconds + 1).toISOString(),
      },
    ],
  });
  beforeEach(async () => {
    additionalEvents = [];
    const user = async () =>
      client.user.create({
        data: {
          email: `${randomUUID()}@favorites.invalid`,
          firstname: 'Test',
          lastname: 'User',
          password: 'not-a-real-credential',
        },
      });
    ownerId = (await user()).id;
    userId = (await user()).id;
    sportId = (await client.sport.create({ data: { name: `favorites-${randomUUID()}` } })).id;
    const currency = await client.currency.upsert({
      where: { iso4217Alpha3: 'ZZZ' },
      create: { name: 'Test currency', iso4217Alpha3: 'ZZZ' },
      update: {},
    });
    eventId = (
      await client.event.create({
        data: {
          name: 'Favorite race',
          date: at(0),
          timezone: 'UTC',
          published: true,
          authorId: ownerId,
          sportId,
          currencyId: currency.id,
          defaultStartMode: 'FreeStart',
        },
      })
    ).id;
    const course = await client.course.create({ data: { eventId, name: 'Favorite course' } });
    const radio = await client.control.create({ data: { eventId, code: '31', radio: true } });
    await client.courseControl.create({
      data: { courseId: course.id, controlId: radio.id, controlCode: '31', sequence: 1 },
    });
    classId = (
      await client.class.create({
        data: { eventId, name: 'H21', externalId: '1', courseId: course.id },
      })
    ).id;
    competitorId = (
      await client.competitor.create({
        data: {
          classId,
          firstname: 'Test',
          lastname: 'Runner',
          registration: 'TST9001',
          externalId: '1',
          card: 8123456,
          startTime: at(0),
          status: 'Inactive',
        },
      })
    ).id;
  });
  afterEach(async () => {
    for (const current of [...additionalEvents, eventId]) {
      await client.protocol.deleteMany({ where: { eventId: current } });
      await client.split.deleteMany({ where: { competitor: { class: { eventId: current } } } });
      await client.competitor.deleteMany({ where: { class: { eventId: current } } });
      await client.class.deleteMany({ where: { eventId: current } });
      await client.event.deleteMany({ where: { id: current } });
    }
    await client.user.deleteMany({ where: { id: { in: [ownerId, userId] } } });
    await client.sport.delete({ where: { id: sportId } });
  });
  afterAll(async () => {
    await Promise.all([client.$disconnect(), second.$disconnect()]);
  });

  it('follows the registration across events without materializing event selections', async () => {
    await follow();
    const other = await matchingCompetitor();
    expect(await favoriteCompetitorIds(client, auth(), { eventId: other.eventId })).toEqual([
      other.competitorId,
    ]);
    expect(
      await client.competitorFavorite.count({ where: { competitorId: other.competitorId } }),
    ).toBe(0);
    expect(await listAthleteFollows(client, auth())).toMatchObject([
      { registration: 'TST9001', source: 'LOCAL', pausedAt: null },
    ]);
    await eventPunchTransaction(client, other.eventId, (tx) =>
      tx.competitor.update({ where: { id: other.competitorId }, data: { status: 'Active' } }),
    );
    expect((await listNotifications(client, auth(), {})).notifications).toMatchObject([
      { eventId: other.eventId, kind: 'COMPETITOR_STARTED' },
    ]);
  });
  it('pauses across events, preserves history, resumes without replay and delivers future changes', async () => {
    await follow();
    const other = await matchingCompetitor();
    const update = (time: number) =>
      eventPunchTransaction(client, other.eventId, (tx) =>
        tx.competitor.update({
          where: { id: other.competitorId },
          data: { status: 'Active', time },
        }),
      );
    await update(10);
    const [selection] = await listAthleteFollows(client, auth());
    await mutateAthleteFollow(client, auth(), { id: selection.id, paused: true });
    await update(20);
    expect(await favoriteCompetitorIds(client, auth(), { eventId: other.eventId })).toEqual([
      other.competitorId,
    ]);
    expect((await listNotifications(client, auth(), {})).notifications).toHaveLength(1);
    await mutateAthleteFollow(client, auth(), { id: selection.id, paused: false });
    expect((await listNotifications(client, auth(), {})).notifications).toHaveLength(1);
    await update(21);
    expect((await listNotifications(client, auth(), {})).notifications).toHaveLength(2);
  });
  it('honors a pause completed during a source transaction', async () => {
    await follow();
    const [selection] = await listAthleteFollows(client, auth());
    await eventPunchTransaction(client, eventId, async (tx) => {
      await tx.competitor.update({ where: { id: competitorId }, data: { status: 'Active' } });
      await mutateAthleteFollow(second, auth(), { id: selection.id, paused: true });
    });
    expect(await messages()).toHaveLength(0);
  });
  it('cancels normalized registration selections across every matching event', async () => {
    await client.competitor.update({
      where: { id: competitorId },
      data: { registration: ' tst9001 ' },
    });
    await follow();
    const other = await matchingCompetitor();
    await setCompetitorFavorite(client, auth(), { ...other, favorite: true });
    const [selection] = await listAthleteFollows(client, auth());
    await mutateAthleteFollow(client, auth(), { id: selection.id }, true);
    expect(await listAthleteFollows(client, auth())).toEqual([]);
    expect(await client.competitorFavorite.count({ where: { userId } })).toBe(0);
    expect(await favoriteCompetitorIds(client, auth(), { eventId: other.eventId })).toEqual([]);
    await eventPunchTransaction(client, other.eventId, (tx) =>
      tx.competitor.update({ where: { id: other.competitorId }, data: { status: 'Active' } }),
    );
    expect((await listNotifications(client, auth(), {})).notifications).toEqual([]);
  });
  it('separates registration issuers and isolates account preference mutations', async () => {
    await follow();
    const other = await matchingCompetitor('ORIS');
    expect(await favoriteCompetitorIds(client, auth(), { eventId: other.eventId })).toEqual([]);
    await setCompetitorFavorite(client, auth(), { ...other, favorite: true });
    const selections = await listAthleteFollows(client, auth());
    expect(selections.map((row) => row.source).sort()).toEqual(['LOCAL', 'ORIS']);
    expect(await listAthleteFollows(client, ownerAuth())).toEqual([]);
    await expect(
      mutateAthleteFollow(client, ownerAuth(), { id: selections[0].id, paused: true }),
    ).rejects.toThrow('unavailable');
    await mutateAthleteFollow(client, ownerAuth(), { id: selections[0].id }, true);
    expect(await listAthleteFollows(client, auth())).toHaveLength(2);
  });
  it('keeps a registration follow after the original competitor and event are deleted', async () => {
    await follow();
    const other = await matchingCompetitor();
    await client.competitor.delete({ where: { id: competitorId } });
    await client.class.delete({ where: { id: classId } });
    await client.event.delete({ where: { id: eventId } });
    expect(await listAthleteFollows(client, auth())).toHaveLength(1);
    expect(await favoriteCompetitorIds(client, auth(), { eventId: other.eventId })).toEqual([
      other.competitorId,
    ]);
  });
  it('does not silently follow another registration when the original event row changes identity', async () => {
    await follow();
    await eventPunchTransaction(client, eventId, (tx) =>
      tx.competitor.update({ where: { id: competitorId }, data: { registration: 'NEW9001' } }),
    );
    expect(await favoriteCompetitorIds(client, auth(), { eventId })).toEqual([]);
    expect(await listAthleteFollows(client, auth())).toMatchObject([{ registration: 'TST9001' }]);
    await eventPunchTransaction(client, eventId, (tx) =>
      tx.competitor.update({ where: { id: competitorId }, data: { status: 'Active' } }),
    );
    expect(await messages()).toHaveLength(0);
  });

  it('persists one favorite under concurrent retries without replaying existing results', async () => {
    await client.competitor.update({
      where: { id: competitorId },
      data: { status: 'OK', time: 600 },
    });
    await Promise.all([follow(true), follow(true, second)]);
    expect(await client.competitorFavorite.count({ where: { userId, competitorId } })).toBe(0);
    expect(await favoriteCompetitorIds(client, auth(), { eventId })).toEqual([competitorId]);
    expect(await messages()).toHaveLength(0);
    expect(await favoriteCompetitorIds(client, ownerAuth(), { eventId })).toEqual([]);
    await Promise.all([follow(false), follow(false, second)]);
    expect(await favoriteCompetitorIds(client, auth(), { eventId })).toEqual([]);
  });
  it('rejects guests/event passwords, event mismatches and private event selection', async () => {
    await expect(
      setCompetitorFavorite(
        client,
        { isAuthenticated: true, type: 'eventBasic', eventId },
        { eventId, competitorId, favorite: true },
      ),
    ).rejects.toThrow('JWT');
    await expect(
      setCompetitorFavorite(client, auth(), { eventId, competitorId: 2147483647, favorite: true }),
    ).rejects.toThrow('unavailable');
    const publicRows = await selectedEventCompetitors(
      client,
      { isAuthenticated: false, type: null },
      { eventId, competitorIds: [competitorId, 2147483647] },
    );
    expect(publicRows.map((row) => row.id)).toEqual([competitorId]);
    await client.event.update({ where: { id: eventId }, data: { published: false } });
    await expect(follow()).rejects.toThrow('unavailable');
    await expect(
      selectedEventCompetitors(client, auth(), { eventId, competitorIds: [competitorId] }),
    ).rejects.toThrow('unavailable');
  });
  it('captures observed start, public radio, finish and actual chip readout exactly once', async () => {
    await follow();
    await ingestPunches(client, ownerAuth(), eventId, punch(0, 0));
    await ingestPunches(client, ownerAuth(), eventId, punch(31, 60));
    await ingestPunches(client, ownerAuth(), eventId, punch(32, 90));
    await ingestPunches(client, ownerAuth(), eventId, punch(-1, 120));
    const readout = punch(-1, 120, 'READOUT');
    await ingestPunches(client, ownerAuth(), eventId, readout);
    const beforeRetry = await messages();
    await ingestPunches(second, ownerAuth(), eventId, readout);
    expect(await messages()).toHaveLength(beforeRetry.length);
    const kinds = beforeRetry.map((row) => row.kind);
    expect(kinds.filter((kind) => kind === 'COMPETITOR_STARTED')).toHaveLength(1);
    expect(kinds.filter((kind) => kind === 'COMPETITOR_RADIO')).toHaveLength(1);
    expect(kinds).toContain('COMPETITOR_FINISHED');
    expect(kinds).toContain('COMPETITOR_READOUT');
    expect(beforeRetry.find((row) => row.kind === 'COMPETITOR_RADIO')).toMatchObject({
      controlCode: 31,
      splitTime: 60,
      entryId: null,
    });
    expect((await listNotifications(client, auth(), {})).notifications).toHaveLength(
      beforeRetry.length,
    );
    await markNotificationsRead(client, auth());
    expect((await listNotifications(client, auth(), {})).unreadCount).toBe(0);
  });
  it('rolls notification and result changes back together and handles recurring corrections', async () => {
    await follow();
    await expect(
      eventPunchTransaction(client, eventId, async (tx) => {
        await tx.competitor.update({ where: { id: competitorId }, data: { status: 'Active' } });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await messages()).toHaveLength(0);
    for (const status of ['Active', 'Inactive', 'Active'] as const)
      await eventPunchTransaction(client, eventId, (tx) =>
        tx.competitor.update({ where: { id: competitorId }, data: { status } }),
      );
    expect(await messages()).toHaveLength(3);
    expect(new Set((await messages()).map((row) => row.sourceKey)).size).toBe(3);
  });
  it('suppresses radio messages and timing payloads for classes without result times', async () => {
    await follow();
    await client.class.update({
      where: { id: classId },
      data: { resultListMode: 'UnorderedNoTimes' },
    });
    await ingestPunches(client, ownerAuth(), eventId, punch(0, 0));
    await ingestPunches(client, ownerAuth(), eventId, punch(31, 60));
    await ingestPunches(client, ownerAuth(), eventId, punch(-1, 120));
    const rows = await messages();
    expect(rows.map((row) => row.kind)).toContain('COMPETITOR_FINISHED');
    expect(rows.map((row) => row.kind)).not.toContain('COMPETITOR_RADIO');
    expect(rows.every((row) => row.raceTime === null && row.splitTime === null)).toBe(true);
  });
  it('covers IOF result/split writes, avoids unchanged import messages and never infers readout', async () => {
    await follow();
    const result = {
      ControlCard: ['8123456'],
      StartTime: [at(0).toISOString()],
      FinishTime: [at(150).toISOString()],
      Time: ['150'],
      Status: ['OK'],
      SplitTime: [
        { ControlCode: ['31'], Time: ['60'] },
        { ControlCode: ['32'], Time: ['90'] },
      ],
    };
    const write = async () => {
      await upsertCompetitor(
        eventId,
        classId,
        {
          Id: [
            { _: '1', ATTR: { type: 'QuickEvent' } },
            { _: 'TST9001', ATTR: { type: 'CZE' } },
          ],
          Name: [{ Given: ['Test'], Family: ['Runner'] }],
        },
        null,
        null,
        result,
        'UTC',
        null,
        null,
        ownerId,
      );
      await upsertSplits(competitorId, result);
    };
    await write();
    const first = await messages();
    expect(first.map((row) => row.kind)).toContain('COMPETITOR_FINISHED');
    expect(first.map((row) => row.kind)).not.toContain('COMPETITOR_READOUT');
    expect(first.filter((row) => row.kind === 'COMPETITOR_RADIO')).toMatchObject([
      { controlCode: 31, splitTime: 60 },
    ]);
    await write();
    expect(await messages()).toHaveLength(first.length);
  });
  it('covers atomic MeOS snapshots and hides messages after unfollow/unpublication', async () => {
    await follow();
    const doc = {
      rootType: 'MOPDiff' as const,
      orgs: [],
      classes: [],
      teams: [],
      competitors: [
        {
          id: 1,
          classId: 1,
          card: 8123456,
          firstname: 'Test',
          lastname: 'Runner',
          competing: true,
          stat: 1,
          startTenths: 324000,
          runTimeTenths: 1500,
          splits: [{ code: 31, tenths: 600 }],
          delete: false,
        },
      ],
    };
    const write = () =>
      processMopDocument(eventId, doc, {
        id: eventId,
        date: at(0),
        timezone: 'UTC',
        authorId: ownerId,
      });
    await write();
    const first = await messages();
    expect(first.map((row) => row.kind)).toContain('COMPETITOR_FINISHED');
    expect(first.map((row) => row.kind)).toContain('COMPETITOR_RADIO');
    await write();
    expect(await messages()).toHaveLength(first.length);
    await client.event.update({ where: { id: eventId }, data: { published: false } });
    expect((await listNotifications(client, auth(), {})).notifications).toEqual([]);
    await client.event.update({ where: { id: eventId }, data: { published: true } });
    await follow(false);
    expect((await listNotifications(client, auth(), {})).notifications).toEqual([]);
  });
});
