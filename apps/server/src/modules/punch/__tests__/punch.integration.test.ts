import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrismaClient } from '../../../db/prisma-client.js';
import type { PunchBatch } from '../punch.schema.js';

const settings = vi.hoisted(() => ({ url: process.env.PUNCH_TEST_DATABASE_URL }));
// Deliberately opt in, and refuse any database that could be a normal application DB.
if (settings.url) {
  const url = new URL(settings.url);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !/^\/ofeed_punch_test(?:_|$)/.test(url.pathname)
  ) {
    throw new Error('Punch integration tests require a local ofeed_punch_test database');
  }
}
vi.mock('../../../utils/context.js', async () => {
  const { createPrismaClient } = await import('../../../db/prisma-client.js');
  return {
    default: createPrismaClient(settings.url ?? 'mysql://root@127.0.0.1:13379/ofeed_punch_test'),
  };
});
vi.mock('../../../utils/subscriptionUtils.js', () => ({
  publishUpdatedCompetitor: vi.fn().mockResolvedValue(undefined),
  publishUpdatedCompetitors: vi.fn().mockResolvedValue(undefined),
}));

import client from '../../../utils/context.js';
import {
  publishUpdatedCompetitor,
  publishUpdatedCompetitors,
} from '../../../utils/subscriptionUtils.js';
import { deleteEventCompetitorAndProtocols, updateCompetitor } from '../../event/event.service.js';
import { upsertSplits } from '../../upload/upload.split.js';
import { ingestPunches, PunchConflictError, reconcileEventPunches } from '../punch.service.js';
import { eventPunchTransaction, supersedeCompetitorPunches } from '../punch-write.js';

describe.skipIf(!settings.url)('punch ingestion on disposable MariaDB', () => {
  const second = createPrismaClient(
    settings.url ?? 'mysql://root@127.0.0.1:13379/ofeed_punch_test',
  );
  const at = (seconds: number) => new Date(Date.parse('2026-05-17T09:00:00Z') + seconds * 1000);
  let eventId: string;
  let competitorId: number;
  let classId: number;
  let userId: number;
  let sportId: number;
  let currencyId: number;
  let auth: { isAuthenticated: boolean; type: 'jwt'; userId: number };
  function batch(code = 31, seconds = 60, source: 'SRR' | 'READOUT' = 'SRR'): PunchBatch {
    return {
      source,
      deviceId: 'reader-a',
      punches: [
        {
          clientPunchId: randomUUID(),
          card: 8123456,
          controlCode: code,
          punchTime: at(seconds).toISOString(),
          receivedAt: at(seconds + 1).toISOString(),
        },
      ],
    };
  }
  const competitor = () =>
    client.competitor.findUniqueOrThrow({ where: { id: competitorId }, include: { splits: true } });

  beforeEach(async () => {
    vi.clearAllMocks();
    const user = await client.user.create({
      data: {
        email: `${randomUUID()}@punch.invalid`,
        firstname: 'Test',
        lastname: 'Timer',
        password: 'not-a-real-credential',
      },
    });
    userId = user.id;
    auth = { isAuthenticated: true, type: 'jwt', userId };
    const sport = await client.sport.create({ data: { name: `punch-${randomUUID()}` } });
    sportId = sport.id;
    const currency = await client.currency.upsert({
      where: { iso4217Alpha3: 'ZZZ' },
      create: { name: 'Punch test currency', iso4217Alpha3: 'ZZZ' },
      update: {},
    });
    currencyId = currency.id;
    const event = await client.event.create({
      data: {
        name: 'Punch test',
        date: at(0),
        authorId: userId,
        sportId,
        currencyId,
        defaultStartMode: 'FreeStart',
      },
    });
    eventId = event.id;
    const cls = await client.class.create({ data: { eventId, name: 'Test', externalId: '1' } });
    classId = cls.id;
    const cmp = await client.competitor.create({
      data: {
        classId,
        firstname: 'Test',
        lastname: 'Runner',
        registration: 'TST0001',
        externalId: '1',
        card: 8123456,
        startTime: at(0),
        status: 'Active',
      },
    });
    competitorId = cmp.id;
  });
  afterEach(async () => {
    await client.protocol.deleteMany({ where: { eventId } });
    await client.split.deleteMany({ where: { competitor: { class: { eventId } } } });
    await client.competitor.deleteMany({ where: { class: { eventId } } });
    await client.class.deleteMany({ where: { eventId } });
    await client.event.delete({ where: { id: eventId } });
    expect(await client.punch.count({ where: { eventId } })).toBe(0);
    expect(await client.punchReceipt.count({ where: { eventId } })).toBe(0);
    await client.user.delete({ where: { id: userId } });
    await client.sport.delete({ where: { id: sportId } });
    vi.mocked(publishUpdatedCompetitor).mockReset().mockResolvedValue(undefined);
  });
  afterAll(async () => {
    await Promise.all([client.$disconnect(), second.$disconnect()]);
  });

  it('serializes identical retries across separate clients and publishes after commit once', async () => {
    vi.mocked(publishUpdatedCompetitor).mockImplementation(async () => {
      expect(await second.punchReceipt.count({ where: { eventId } })).toBe(1);
    });
    const input = batch();
    const results = await Promise.all([
      ingestPunches(client, auth, eventId, input),
      ingestPunches(second, auth, eventId, input),
    ]);
    expect(
      results
        .flat()
        .map((item) => item.status)
        .sort(),
    ).toEqual(['DUPLICATE', 'STORED']);
    expect((await competitor()).splits).toMatchObject([{ controlCode: 31, time: 60 }]);
    expect(await client.protocol.count({ where: { eventId, type: 'punch_store' } })).toBe(1);
    expect(publishUpdatedCompetitor).toHaveBeenCalledTimes(1);
    expect(publishUpdatedCompetitors).toHaveBeenCalledTimes(1);
  });
  it('keeps independent dongle controls and repeat visits without losing splits', async () => {
    const a = batch(31, 60),
      b = batch(32, 90),
      c = batch(31, 120);
    b.deviceId = 'reader-b';
    await Promise.all([
      ingestPunches(client, auth, eventId, a),
      ingestPunches(second, auth, eventId, b),
    ]);
    await ingestPunches(client, auth, eventId, c);
    expect(
      (await competitor()).splits.map(({ controlCode, time }) => [controlCode, time]).sort(),
    ).toEqual([
      [31, 120],
      [31, 60],
      [32, 90],
    ]);
  });
  it('deduplicates cross-source observations and promotes a finish over adjudication', async () => {
    await client.competitor.update({
      where: { id: competitorId },
      data: { status: 'Disqualified' },
    });
    const radio = batch(-1, 120);
    await ingestPunches(client, auth, eventId, radio);
    expect(await competitor()).toMatchObject({
      status: 'Disqualified',
      time: 120,
      finishTime: at(120),
    });
    const readout = batch(-1, 120, 'READOUT');
    readout.deviceId = 'readout';
    expect(await ingestPunches(second, auth, eventId, readout)).toMatchObject([
      { status: 'DUPLICATE', competitorId },
    ]);
    expect(await competitor()).toMatchObject({ status: 'OK' });
    expect(await client.punch.count({ where: { eventId } })).toBe(1);
    expect(await client.punchReceipt.count({ where: { eventId } })).toBe(2);
    expect(await client.protocol.count({ where: { eventId, type: 'punch_store' } })).toBe(1);
    await ingestPunches(client, auth, eventId, batch(-1, 130));
    expect(await competitor()).toMatchObject({ status: 'OK', finishTime: at(120) });
  });
  it('sets provisional SRR status, prefers readout times and recalculates late starts', async () => {
    await client.competitor.update({ where: { id: competitorId }, data: { startTime: null } });
    await ingestPunches(client, auth, eventId, batch(31, 60));
    await ingestPunches(client, auth, eventId, batch(-1, 120));
    expect(await competitor()).toMatchObject({
      status: 'Finished',
      time: null,
      splits: [{ time: null }],
    });
    await ingestPunches(client, auth, eventId, batch(0, 10));
    expect(await competitor()).toMatchObject({ time: 110, splits: [{ time: 50 }] });
    await ingestPunches(client, auth, eventId, batch(0, 20, 'READOUT'));
    await ingestPunches(client, auth, eventId, batch(-1, 125, 'READOUT'));
    expect(await competitor()).toMatchObject({
      status: 'OK',
      startTime: at(20),
      finishTime: at(125),
      time: 105,
      splits: [{ time: 40 }],
    });
    await ingestPunches(client, auth, eventId, batch(0, 5));
    expect((await competitor()).startTime).toEqual(at(20));
  });
  it('rolls back a whole batch when a later retry identity conflicts', async () => {
    const existing = batch();
    await ingestPunches(client, auth, eventId, existing);
    const input = batch(32, 90);
    input.punches.push({ ...existing.punches[0], controlCode: 99 });
    await expect(ingestPunches(client, auth, eventId, input)).rejects.toBeInstanceOf(
      PunchConflictError,
    );
    expect(await client.punchReceipt.count({ where: { eventId } })).toBe(1);
    expect(await client.punch.count({ where: { eventId } })).toBe(1);
    expect((await competitor()).splits).toHaveLength(1);
  });
  it('retains unknown cards and matches them on a real competitor card update', async () => {
    await client.competitor.update({ where: { id: competitorId }, data: { card: null } });
    const input = batch();
    expect(await ingestPunches(client, auth, eventId, input)).toMatchObject([
      { status: 'UNKNOWN_CARD' },
    ]);
    expect(await client.protocol.count({ where: { eventId } })).toBe(0);
    await updateCompetitor(eventId, competitorId, 'OFFICE', { card: 8123456 }, userId);
    expect((await competitor()).splits).toMatchObject([{ time: 60 }]);
    expect(await ingestPunches(client, auth, eventId, input)).toMatchObject([
      { status: 'DUPLICATE', competitorId },
    ]);
  });
  it('resolves shared cards through bounded windows and keeps unmatched observations pending', async () => {
    await client.competitor.update({ where: { id: competitorId }, data: { finishTime: at(100) } });
    const later = await client.competitor.create({
      data: {
        classId,
        firstname: 'Later',
        lastname: 'Runner',
        registration: 'TST0002',
        card: 8123456,
        startTime: at(200),
        finishTime: at(300),
      },
    });
    const input = batch(31, 50);
    input.punches.push(batch(32, 250).punches[0], batch(33, 150).punches[0]);
    expect(await ingestPunches(client, auth, eventId, input)).toMatchObject([
      { status: 'STORED', competitorId },
      { status: 'STORED', competitorId: later.id },
      { status: 'UNKNOWN_CARD' },
    ]);
    await updateCompetitor(eventId, competitorId, 'OFFICE', { card: 9000000 }, userId);
    expect(await client.punch.count({ where: { eventId, competitorId: later.id } })).toBe(2);
    expect(await client.punch.count({ where: { eventId, competitorId } })).toBe(1);
  });
  it('does not resurrect split projections after REST or IOF snapshots, including source promotion', async () => {
    const input = batch();
    await ingestPunches(client, auth, eventId, input);
    await updateCompetitor(
      eventId,
      competitorId,
      'OFFICE',
      { splits: [{ controlCode: 32, time: 90 }] },
      userId,
    );
    await ingestPunches(client, auth, eventId, input);
    await ingestPunches(client, auth, eventId, batch(31, 60, 'READOUT'));
    expect((await competitor()).splits).toMatchObject([{ controlCode: 32, time: 90 }]);
    await ingestPunches(client, auth, eventId, batch(33, 100));
    await upsertSplits(competitorId, {
      SplitTime: [{ ControlCode: ['34'], Time: ['110'] }],
    } as never);
    await ingestPunches(client, auth, eventId, batch(33, 100, 'READOUT'));
    expect((await competitor()).splits).toMatchObject([{ controlCode: 34, time: 110 }]);
  });
  it('serializes snapshot and ingestion transactions without losing retained metadata', async () => {
    const input = batch();
    await Promise.all([
      ingestPunches(second, auth, eventId, input),
      eventPunchTransaction(client, eventId, async (tx) => {
        await supersedeCompetitorPunches(tx, [competitorId]);
        await tx.split.deleteMany({ where: { competitorId } });
        await tx.split.create({ data: { competitorId, controlCode: 99, time: 50 } });
      }),
    ]);
    const canonical = await client.punch.findFirstOrThrow({ where: { eventId } });
    expect(await client.punchReceipt.count({ where: { eventId } })).toBe(1);
    expect((await competitor()).splits.length).toBe(canonical.superseded ? 1 : 2);
    await eventPunchTransaction(client, eventId, (tx) => reconcileEventPunches(tx, eventId));
    expect((await competitor()).splits.length).toBe(canonical.superseded ? 1 : 2);
  });
  it('retains applied observations without replaying them after competitor deletion', async () => {
    await ingestPunches(client, auth, eventId, batch());
    await deleteEventCompetitorAndProtocols(eventId, competitorId);
    expect(await client.punch.findFirstOrThrow({ where: { eventId } })).toMatchObject({
      competitorId: null,
      splitId: null,
      superseded: true,
    });
    const replacement = await client.competitor.create({
      data: {
        classId,
        firstname: 'Replacement',
        lastname: 'Runner',
        registration: 'TST0003',
        card: 8123456,
      },
    });
    await eventPunchTransaction(client, eventId, (tx) => reconcileEventPunches(tx, eventId));
    expect(await client.split.count({ where: { competitorId: replacement.id } })).toBe(0);
  });
  it('enforces ownership and event boundaries before writing', async () => {
    await expect(ingestPunches(client, undefined, eventId, batch())).rejects.toMatchObject({
      statusCode: 401,
    });
    await expect(
      ingestPunches(client, { ...auth, userId: userId + 100000 }, eventId, batch()),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(ingestPunches(client, auth, 'missing-event', batch())).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(await client.punchReceipt.count({ where: { eventId } })).toBe(0);
  });

  it('enforces both database identities and normalizes equivalent timezone offsets', async () => {
    const first = batch();
    await ingestPunches(client, auth, eventId, first);
    const equivalent = batch();
    equivalent.deviceId = 'reader-b';
    equivalent.punches[0].punchTime = '2026-05-17T11:01:00.000+02:00';
    expect(await ingestPunches(second, auth, eventId, equivalent)).toMatchObject([
      { status: 'DUPLICATE' },
    ]);
    const stored = await client.punch.findFirstOrThrow({ where: { eventId } });
    await expect(
      client.punch.create({
        data: {
          eventId,
          card: stored.card,
          controlCode: stored.controlCode,
          punchTime: stored.punchTime,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    const receipt = await client.punchReceipt.findFirstOrThrow({ where: { eventId } });
    await expect(
      client.punchReceipt.create({
        data: {
          eventId,
          deviceId: receipt.deviceId,
          clientPunchId: receipt.clientPunchId,
          source: receipt.source,
          punchId: stored.id,
          receivedAt: receipt.receivedAt,
          authorId: userId,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('reuses equivalent legacy splits while retaining distinct visits', async () => {
    await client.split.create({ data: { competitorId, controlCode: 31, time: 60 } });
    await ingestPunches(client, auth, eventId, batch());
    expect((await competitor()).splits).toHaveLength(1);
    await ingestPunches(client, auth, eventId, batch(31, 60.5));
    expect((await competitor()).splits).toHaveLength(2);
    expect(await client.punch.count({ where: { eventId, splitId: { not: null } } })).toBe(2);
  });

  it('keeps check punches out of splits and retains metadata without inventing result times', async () => {
    const input = batch(-2);
    input.punches[0].stationSerial = 123456;
    await ingestPunches(client, auth, eventId, input);
    expect(await competitor()).toMatchObject({
      status: 'Active',
      finishTime: null,
      time: null,
      splits: [],
    });
    expect(await client.punchReceipt.findFirstOrThrow({ where: { eventId } })).toMatchObject({
      stationSerial: 123456,
      authorId: userId,
      receivedAt: at(61),
    });
  });

  it('retains committed punches when a subscription publisher fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(publishUpdatedCompetitor).mockRejectedValueOnce(new Error('subscriber unavailable'));
    try {
      expect(await ingestPunches(client, auth, eventId, batch())).toMatchObject([
        { status: 'STORED' },
      ]);
      expect((await competitor()).splits).toHaveLength(1);
      expect(log).toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it('treats device IDs as case-sensitive while deduplicating the physical punch', async () => {
    const input = batch();
    input.deviceId = 'READER';
    await ingestPunches(client, auth, eventId, input);
    input.deviceId = 'reader';
    expect(await ingestPunches(second, auth, eventId, input)).toMatchObject([
      { status: 'DUPLICATE' },
    ]);
    expect(await client.punchReceipt.count({ where: { eventId } })).toBe(2);
  });

  it('accepts a maximum-size batch and preserves an unrelated legacy split', async () => {
    await client.split.create({ data: { competitorId, controlCode: 99, time: 30 } });
    const input = batch();
    input.punches = Array.from({ length: 200 }, (_, index) => batch(31, 60 + index).punches[0]);
    const results = await ingestPunches(client, auth, eventId, input);
    expect(results).toHaveLength(200);
    expect(results.map((item) => item.clientPunchId)).toEqual(
      input.punches.map((item) => item.clientPunchId),
    );
    expect(results.every((item) => item.status === 'STORED')).toBe(true);
    expect((await competitor()).splits).toHaveLength(201);
  });

  it('serializes card changes with ingestion and matches pending punches when the card returns', async () => {
    const input = batch();
    const [results] = await Promise.all([
      ingestPunches(second, auth, eventId, input),
      updateCompetitor(eventId, competitorId, 'OFFICE', { card: 9000000 }, userId),
    ]);
    const stored = await client.punch.findFirstOrThrow({ where: { eventId } });
    expect(stored.competitorId).toBe(results[0].status === 'STORED' ? competitorId : null);
    await updateCompetitor(eventId, competitorId, 'OFFICE', { card: 8123456 }, userId);
    expect((await competitor()).splits).toHaveLength(1);
    expect(await client.punchReceipt.count({ where: { eventId } })).toBe(1);
    expect(await client.protocol.count({ where: { eventId, type: 'punch_store' } })).toBe(1);
  });
});
