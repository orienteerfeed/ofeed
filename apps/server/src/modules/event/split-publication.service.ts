import { GraphQLError } from 'graphql';

import type { AppPrismaClient } from '../../db/prisma-client.js';
import type { SplitPublicationMode } from '../../generated/prisma/client.js';

type ViewerAuthContext = {
  isAuthenticated: boolean;
  type: 'jwt' | 'eventBasic' | null;
  userId?: number | string;
};

export type SplitPublicationReason =
  | 'PUBLISHED'
  | 'WAITING_FOR_LAST_START'
  | 'WAITING_FOR_SCHEDULED'
  | 'DISABLED';

export type SplitPublicationStatus = {
  eventId: string;
  classId: number;
  mode: SplitPublicationMode;
  isPublished: boolean;
  isAccessible: boolean;
  publishAt: Date | null;
  reason: SplitPublicationReason;
  canBypass: boolean;
};

type SplitPublicationComputationInput = {
  mode: SplitPublicationMode;
  publishAt?: Date | null;
  canBypass?: boolean;
  now?: Date;
};

function normalizeAuthUserId(auth: ViewerAuthContext | null | undefined): number | null {
  if (typeof auth?.userId === 'number') {
    return Number.isFinite(auth.userId) ? auth.userId : null;
  }

  if (typeof auth?.userId === 'string' && auth.userId.trim() !== '') {
    const parsedUserId = Number(auth.userId);
    return Number.isFinite(parsedUserId) ? parsedUserId : null;
  }

  return null;
}

async function hasSplitPublicationBypass(
  prisma: AppPrismaClient,
  auth: ViewerAuthContext | null | undefined,
  authorId: number | null,
): Promise<boolean> {
  if (!auth?.isAuthenticated || auth.type !== 'jwt') {
    return false;
  }

  const userId = normalizeAuthUserId(auth);
  if (userId === null) {
    return false;
  }

  if (authorId !== null && authorId === userId) {
    return true;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  return user?.role === 'ADMIN';
}

export function computeSplitPublicationStatus(
  input: SplitPublicationComputationInput,
): Omit<SplitPublicationStatus, 'eventId' | 'classId'> {
  const now = input.now ?? new Date();
  const publishAt = input.publishAt ?? null;
  const canBypass = input.canBypass ?? false;

  let isPublished = false;
  let reason: SplitPublicationReason = 'PUBLISHED';

  switch (input.mode) {
    case 'UNRESTRICTED':
      isPublished = true;
      reason = 'PUBLISHED';
      break;
    case 'LAST_START':
      isPublished = publishAt !== null && now >= publishAt;
      reason = isPublished ? 'PUBLISHED' : 'WAITING_FOR_LAST_START';
      break;
    case 'SCHEDULED':
      isPublished = publishAt !== null && now >= publishAt;
      reason = isPublished ? 'PUBLISHED' : 'WAITING_FOR_SCHEDULED';
      break;
    case 'DISABLED':
      isPublished = false;
      reason = 'DISABLED';
      break;
  }

  return {
    mode: input.mode,
    isPublished,
    isAccessible: canBypass || isPublished,
    publishAt,
    reason,
    canBypass,
  };
}

export async function getSplitPublicationStatus(
  prisma: AppPrismaClient,
  auth: ViewerAuthContext | null | undefined,
  classId: number,
  options?: {
    now?: Date;
  },
): Promise<SplitPublicationStatus> {
  const eventClass = await prisma.class.findUnique({
    where: { id: classId },
    select: {
      id: true,
      eventId: true,
      event: {
        select: {
          authorId: true,
          splitPublicationMode: true,
          splitPublicationAt: true,
        },
      },
    },
  });

  if (!eventClass) {
    throw new GraphQLError('Class not found.');
  }

  const canBypass = await hasSplitPublicationBypass(prisma, auth, eventClass.event.authorId);

  let publishAt = eventClass.event.splitPublicationAt ?? null;
  if (eventClass.event.splitPublicationMode === 'LAST_START') {
    const aggregate = await prisma.competitor.aggregate({
      where: {
        classId,
        startTime: {
          not: null,
        },
      },
      _max: {
        startTime: true,
      },
    });

    publishAt = aggregate._max.startTime ?? null;
  }

  return {
    eventId: eventClass.eventId,
    classId,
    ...computeSplitPublicationStatus({
      mode: eventClass.event.splitPublicationMode,
      publishAt,
      canBypass,
      now: options?.now,
    }),
  };
}

function getSplitPublicationAccessMessage(status: SplitPublicationStatus): string {
  if (status.reason === 'DISABLED') {
    return 'Split times are not published for this event.';
  }

  return 'Split times are not published yet.';
}

export async function assertSplitPublicationAccessible(
  prisma: AppPrismaClient,
  auth: ViewerAuthContext | null | undefined,
  classId: number,
): Promise<SplitPublicationStatus> {
  const status = await getSplitPublicationStatus(prisma, auth, classId);

  if (!status.isAccessible) {
    throw new GraphQLError(getSplitPublicationAccessMessage(status));
  }

  return status;
}

export async function assertSplitPublicationAccessibleForCompetitor(
  prisma: AppPrismaClient,
  auth: ViewerAuthContext | null | undefined,
  competitorId: number,
): Promise<SplitPublicationStatus> {
  const competitor = await prisma.competitor.findUnique({
    where: { id: competitorId },
    select: {
      classId: true,
    },
  });

  if (!competitor) {
    throw new GraphQLError('Competitor not found.');
  }

  return assertSplitPublicationAccessible(prisma, auth, competitor.classId);
}
