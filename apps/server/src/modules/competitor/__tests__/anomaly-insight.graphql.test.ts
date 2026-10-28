import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { eventAnomalyInsightSchema } from '@repo/shared';
import { schema } from '../../../graphql/schema.js';
import { category, competitor, event } from './anomaly-fixtures.js';

const require = createRequire(import.meta.url);
const { graphql } = createRequire(require.resolve('@pothos/core'))(
  'graphql',
) as typeof import('graphql');
const source = `query AnomalyInsight($eventId: String!) {
  eventAnomalyInsight(eventId: $eventId) {
    competitors {
      id firstname lastname registration bibNumber classId className organisation card startMode startTime
      findings { type controlCode splitSeconds medianSeconds differenceSeconds referenceCount intervalSeconds phaseSeconds nearestStartTime punchTimes }
    }
    coverage { classId className type status evaluated total }
  }
}`;
const db = () => ({
  event: {
    findUnique: vi.fn().mockResolvedValue({ authorId: 7 }),
    findUniqueOrThrow: vi.fn().mockResolvedValue(event),
  },
  user: { findUnique: vi.fn().mockResolvedValue({ role: 'USER' }) },
  class: {
    findMany: vi.fn().mockResolvedValue([
      category({
        competitors: [
          competitor(1, { punches: [{ punchTime: new Date('2026-10-28T10:00:01Z') }] }),
        ],
      }),
    ]),
  },
});
describe('anomaly GraphQL contract', () => {
  it('executes the real schema with evidence, enums, dates and coverage matching the shared contract', async () => {
    const prisma = db();
    const result = await graphql({
      schema,
      source,
      variableValues: { eventId: 'race' },
      contextValue: { prisma, auth: { isAuthenticated: true, type: 'jwt', userId: 7 } },
    });
    expect(result.errors).toBeUndefined();
    const report = eventAnomalyInsightSchema.parse(result.data?.eventAnomalyInsight);
    expect(report.competitors[0]?.findings[0]).toMatchObject({
      type: 'START_PUNCH',
      punchTimes: ['2026-10-28T10:00:01.000Z'],
      medianSeconds: null,
    });
    expect(report.coverage.find((row) => row.type === 'START_PUNCH')).toMatchObject({
      status: 'EVALUATED',
      evaluated: 1,
      total: 1,
    });
  });
  it('rejects unauthenticated execution without reading timing data', async () => {
    const prisma = db();
    const result = await graphql({
      schema,
      source,
      variableValues: { eventId: 'race' },
      contextValue: { prisma, auth: { isAuthenticated: false } },
    });
    expect(result.errors?.[0]?.message).toBe('User JWT required');
    expect(prisma.class.findMany).not.toHaveBeenCalled();
  });
});
