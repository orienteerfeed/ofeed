import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { schema } from '../../../graphql/schema.js';

const require = createRequire(import.meta.url);
const { graphql } = createRequire(require.resolve('@pothos/core'))(
  'graphql',
) as typeof import('graphql');
const source = `query CardInsight($eventId: String!) {
  eventCardInsight(eventId: $eventId) {
    missingCards { id firstname lastname registration bibNumber classId className organisation card }
    duplicateCards { card competitors { id firstname lastname registration bibNumber classId className organisation card } }
  }
}`;
const prisma = () => ({
  event: { findUnique: vi.fn().mockResolvedValue({ authorId: 7 }) },
  user: { findUnique: vi.fn().mockResolvedValue({ role: 'USER' }) },
  competitor: {
    findMany: vi.fn().mockResolvedValue([
      {
        id: 1,
        firstname: 'Jan',
        lastname: 'Novak',
        registration: 'ABC1234',
        bibNumber: null,
        classId: 2,
        class: { name: 'H21' },
        organisation: { name: 'Club' },
        card: null,
      },
    ]),
  },
});
describe('card insight GraphQL contract', () => {
  it('executes the shared response shape through the real schema', async () => {
    const db = prisma();
    const result = await graphql({
      schema,
      source,
      variableValues: { eventId: 'race' },
      contextValue: {
        prisma: db,
        auth: { isAuthenticated: true, type: 'jwt', userId: 7 },
      },
    });
    expect(result.errors).toBeUndefined();
    expect(JSON.parse(JSON.stringify(result.data))).toEqual({
      eventCardInsight: {
        missingCards: [
          {
            id: 1,
            firstname: 'Jan',
            lastname: 'Novak',
            registration: 'ABC1234',
            bibNumber: null,
            classId: 2,
            className: 'H21',
            organisation: 'Club',
            card: null,
          },
        ],
        duplicateCards: [],
      },
    });
  });
  it('rejects unauthenticated GraphQL reads before selecting any competitor', async () => {
    const db = prisma();
    const result = await graphql({
      schema,
      source,
      variableValues: { eventId: 'race' },
      contextValue: {
        prisma: db,
        auth: { isAuthenticated: false, type: null },
      },
    });
    expect(result.errors?.[0]?.message).toBe('User JWT required');
    expect(db.competitor.findMany).not.toHaveBeenCalled();
  });
});
