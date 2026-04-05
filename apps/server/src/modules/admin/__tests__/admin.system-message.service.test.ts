import { describe, expect, it } from 'vitest';

import {
  createAdminSystemMessage,
  deleteAdminSystemMessage,
  getAdminSystemMessages,
  isAdminSystemMessageActionError,
  updateAdminSystemMessage,
} from '../admin.system-message.service.js';

type SystemMessageRecord = {
  id: number;
  title: string | null;
  message: string;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS';
  publishedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function createPrismaMock(initialMessages: SystemMessageRecord[]) {
  const messages = [...initialMessages];
  let nextId = Math.max(0, ...messages.map((message) => message.id)) + 1;

  return {
    prisma: {
      systemMessage: {
        count: async () => messages.length,
        findMany: async () =>
          [...messages].sort((left, right) => {
            const updatedAtDiff = right.updatedAt.getTime() - left.updatedAt.getTime();
            if (updatedAtDiff !== 0) {
              return updatedAtDiff;
            }

            return right.id - left.id;
          }),
        findUnique: async ({ where }: { where: { id: number } }) =>
          messages.find((message) => message.id === where.id) ?? null,
        create: async ({
          data,
        }: {
          data: Omit<SystemMessageRecord, 'id' | 'createdAt' | 'updatedAt'>;
        }) => {
          const createdAt = new Date('2026-04-04T12:00:00.000Z');
          const systemMessage: SystemMessageRecord = {
            id: nextId++,
            title: data.title,
            message: data.message,
            severity: data.severity,
            publishedAt: data.publishedAt,
            expiresAt: data.expiresAt,
            createdAt,
            updatedAt: createdAt,
          };

          messages.push(systemMessage);
          return systemMessage;
        },
        update: async ({
          where,
          data,
        }: {
          where: { id: number };
          data: Partial<SystemMessageRecord>;
        }) => {
          const systemMessage = messages.find((message) => message.id === where.id);
          if (!systemMessage) {
            throw new Error('System message not found');
          }

          Object.assign(systemMessage, data, {
            updatedAt: new Date('2026-04-04T13:00:00.000Z'),
          });

          return systemMessage;
        },
        delete: async ({ where }: { where: { id: number } }) => {
          const index = messages.findIndex((message) => message.id === where.id);
          if (index === -1) {
            throw new Error('System message not found');
          }

          return messages.splice(index, 1)[0] as SystemMessageRecord;
        },
      },
    },
    state: {
      messages,
    },
  };
}

describe('admin system message service', () => {
  it('returns system messages list sorted by most recently updated', async () => {
    const { prisma } = createPrismaMock([
      {
        id: 1,
        title: 'Draft',
        message: 'Save this for later',
        severity: 'INFO',
        publishedAt: null,
        expiresAt: null,
        createdAt: new Date('2026-04-01T08:00:00.000Z'),
        updatedAt: new Date('2026-04-01T08:00:00.000Z'),
      },
      {
        id: 2,
        title: 'Live',
        message: 'Shown on homepage',
        severity: 'WARNING',
        publishedAt: new Date('2026-04-03T08:00:00.000Z'),
        expiresAt: null,
        createdAt: new Date('2026-04-03T08:00:00.000Z'),
        updatedAt: new Date('2026-04-03T09:00:00.000Z'),
      },
    ]);

    const result = await getAdminSystemMessages(prisma as never);

    expect(result.total).toBe(2);
    expect(result.items[0]?.id).toBe(2);
    expect(result.items[1]?.publishedAt).toBeNull();
  });

  it('creates draft and published system messages', async () => {
    const { prisma } = createPrismaMock([]);

    const draft = await createAdminSystemMessage(prisma as never, {
      title: ' Draft title ',
      message: 'Draft body',
      severity: 'INFO',
      expiresAt: null,
      published: false,
    });

    const published = await createAdminSystemMessage(prisma as never, {
      title: null,
      message: 'Published body',
      severity: 'SUCCESS',
      expiresAt: '2026-04-10T12:00:00.000Z',
      published: true,
    });

    expect(draft.systemMessage.title).toBe('Draft title');
    expect(draft.systemMessage.publishedAt).toBeNull();
    expect(published.systemMessage.title).toBeNull();
    expect(published.systemMessage.publishedAt).toBeInstanceOf(Date);
    expect(published.systemMessage.expiresAt).toEqual(new Date('2026-04-10T12:00:00.000Z'));
  });

  it('publishes and unpublishes existing messages without losing content', async () => {
    const { prisma, state } = createPrismaMock([
      {
        id: 1,
        title: 'Maintenance',
        message: 'Planned downtime',
        severity: 'WARNING',
        publishedAt: null,
        expiresAt: null,
        createdAt: new Date('2026-04-01T08:00:00.000Z'),
        updatedAt: new Date('2026-04-01T08:00:00.000Z'),
      },
    ]);

    const published = await updateAdminSystemMessage(prisma as never, {
      messageId: 1,
      input: {
        published: true,
      },
    });

    const unpublished = await updateAdminSystemMessage(prisma as never, {
      messageId: 1,
      input: {
        published: false,
      },
    });

    expect(published.systemMessage.publishedAt).toBeInstanceOf(Date);
    expect(unpublished.systemMessage.publishedAt).toBeNull();
    expect(state.messages[0]?.message).toBe('Planned downtime');
  });

  it('deletes system messages and rejects unknown ids', async () => {
    const { prisma, state } = createPrismaMock([
      {
        id: 1,
        title: 'Old banner',
        message: 'To be removed',
        severity: 'ERROR',
        publishedAt: new Date('2026-04-02T08:00:00.000Z'),
        expiresAt: null,
        createdAt: new Date('2026-04-02T08:00:00.000Z'),
        updatedAt: new Date('2026-04-02T08:00:00.000Z'),
      },
    ]);

    const deleted = await deleteAdminSystemMessage(prisma as never, {
      messageId: 1,
    });

    expect(deleted.systemMessage.id).toBe(1);
    expect(state.messages).toHaveLength(0);

    try {
      await deleteAdminSystemMessage(prisma as never, {
        messageId: 99,
      });
      throw new Error('Expected deleteAdminSystemMessage to throw');
    } catch (error) {
      expect(isAdminSystemMessageActionError(error)).toBe(true);
      if (isAdminSystemMessageActionError(error)) {
        expect(error.statusCode).toBe(404);
      }
    }
  });
});
