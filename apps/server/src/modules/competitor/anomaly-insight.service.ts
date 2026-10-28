import { type EventAnomalyInsight } from '@repo/shared';
import type { AppPrismaClient } from '../../db/prisma-client.js';
import { AuthzError, requireEventOwnerOrAdmin, type AuthzAuthContext } from '../../utils/authz.js';
import { analyzeEventAnomalies } from './anomaly-analysis.js';

export async function getEventAnomalyInsight(
  prisma: AppPrismaClient,
  auth: AuthzAuthContext,
  eventId: string,
): Promise<EventAnomalyInsight> {
  if (!auth?.isAuthenticated || auth.type !== 'jwt') {
    throw new AuthzError('User JWT required', 401);
  }
  await requireEventOwnerOrAdmin(prisma, auth, eventId);
  const [event, classes] = await Promise.all([
    prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      select: { defaultStartMode: true, eventFormat: true },
    }),
    prisma.class.findMany({
      where: { eventId },
      select: {
        id: true,
        name: true,
        startMode: true,
        resultListMode: true,
        course: {
          select: {
            courseControls: {
              select: {
                controlCode: true,
                sequence: true,
                type: true,
                control: { select: { type: true } },
              },
              orderBy: { sequence: 'asc' },
            },
          },
        },
        competitors: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
            registration: true,
            bibNumber: true,
            card: true,
            organisation: { select: { name: true } },
            startTime: true,
            status: true,
            splits: { select: { controlCode: true, time: true } },
            punches: {
              where: { eventId, controlCode: 0, superseded: false },
              select: { punchTime: true },
              orderBy: { punchTime: 'asc' },
            },
          },
        },
      },
    }),
  ]);
  return analyzeEventAnomalies(event, classes);
}
