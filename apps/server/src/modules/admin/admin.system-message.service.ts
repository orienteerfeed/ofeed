import {
  adminSystemMessageListSchema,
  adminSystemMessageMutationResultSchema,
  adminSystemMessageItemSchema,
  type AdminSystemMessageUpdateInput,
  type AdminSystemMessageUpsertInput,
} from '@repo/shared';

type SystemMessageSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS';

type SystemMessageRecord = {
  id: number;
  title: string | null;
  message: string;
  severity: SystemMessageSeverity;
  publishedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type PrismaLike = {
  systemMessage: {
    count: (args?: Record<string, unknown>) => Promise<number>;
    findMany: (args: Record<string, unknown>) => Promise<SystemMessageRecord[]>;
    findUnique: (args: Record<string, unknown>) => Promise<SystemMessageRecord | null>;
    create: (args: Record<string, unknown>) => Promise<SystemMessageRecord>;
    update: (args: Record<string, unknown>) => Promise<SystemMessageRecord>;
    delete: (args: Record<string, unknown>) => Promise<SystemMessageRecord>;
  };
};

class AdminSystemMessageActionError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'AdminSystemMessageActionError';
    this.statusCode = statusCode;
  }
}

export function isAdminSystemMessageActionError(
  error: unknown,
): error is AdminSystemMessageActionError {
  return error instanceof AdminSystemMessageActionError;
}

function normalizeTitle(value: string | null | undefined) {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalDate(
  value: string | Date | null | undefined,
  fieldName: string,
): Date | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new AdminSystemMessageActionError(`Invalid ${fieldName}`, 422);
  }

  return parsed;
}

function mapAdminSystemMessageItem(systemMessage: SystemMessageRecord) {
  return adminSystemMessageItemSchema.parse({
    id: systemMessage.id,
    title: systemMessage.title,
    message: systemMessage.message,
    severity: systemMessage.severity,
    publishedAt: systemMessage.publishedAt,
    expiresAt: systemMessage.expiresAt,
    createdAt: systemMessage.createdAt,
    updatedAt: systemMessage.updatedAt,
  });
}

async function loadSystemMessageForMutation(prisma: PrismaLike, messageId: number) {
  const systemMessage = await prisma.systemMessage.findUnique({
    where: { id: messageId },
  });

  if (!systemMessage) {
    throw new AdminSystemMessageActionError('Admin system message target not found', 404);
  }

  return systemMessage;
}

export async function getAdminSystemMessages(prisma: PrismaLike) {
  const [total, itemsRaw] = await Promise.all([
    prisma.systemMessage.count(),
    prisma.systemMessage.findMany({
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    }),
  ]);

  return adminSystemMessageListSchema.parse({
    total,
    items: itemsRaw.map(mapAdminSystemMessageItem),
  });
}

export async function createAdminSystemMessage(
  prisma: PrismaLike,
  input: AdminSystemMessageUpsertInput,
) {
  const systemMessage = await prisma.systemMessage.create({
    data: {
      title: normalizeTitle(input.title),
      message: input.message.trim(),
      severity: input.severity,
      expiresAt: normalizeOptionalDate(input.expiresAt, 'expiration date') ?? null,
      publishedAt: input.published ? new Date() : null,
    },
  });

  return adminSystemMessageMutationResultSchema.parse({
    systemMessage: mapAdminSystemMessageItem(systemMessage),
  });
}

export async function updateAdminSystemMessage(
  prisma: PrismaLike,
  params: {
    messageId: number;
    input: AdminSystemMessageUpdateInput;
  },
) {
  const existing = await loadSystemMessageForMutation(prisma, params.messageId);
  const data: Record<string, unknown> = {};

  if ('title' in params.input) {
    data.title = normalizeTitle(params.input.title);
  }

  if ('message' in params.input && typeof params.input.message === 'string') {
    data.message = params.input.message.trim();
  }

  if ('severity' in params.input && params.input.severity !== undefined) {
    data.severity = params.input.severity;
  }

  if ('expiresAt' in params.input) {
    data.expiresAt = normalizeOptionalDate(params.input.expiresAt, 'expiration date') ?? null;
  }

  if ('published' in params.input && typeof params.input.published === 'boolean') {
    data.publishedAt = params.input.published ? (existing.publishedAt ?? new Date()) : null;
  }

  const systemMessage = await prisma.systemMessage.update({
    where: { id: params.messageId },
    data,
  });

  return adminSystemMessageMutationResultSchema.parse({
    systemMessage: mapAdminSystemMessageItem(systemMessage),
  });
}

export async function deleteAdminSystemMessage(
  prisma: PrismaLike,
  params: {
    messageId: number;
  },
) {
  await loadSystemMessageForMutation(prisma, params.messageId);

  const systemMessage = await prisma.systemMessage.delete({
    where: { id: params.messageId },
  });

  return adminSystemMessageMutationResultSchema.parse({
    systemMessage: mapAdminSystemMessageItem(systemMessage),
  });
}
