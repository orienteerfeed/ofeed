import { verifyAresOrganizer } from './organizer-ares.service.js';
import { settlementSettingsSchema, organizerDetailsSchema } from '@repo/shared';
import type { AppPrismaClient } from '../../db/prisma-client.js';
import { Prisma } from '../../generated/prisma/client.js';
import { ValidationError } from '../../exceptions/index.js';
import { requireEventOwnerOrAdmin, type AuthzAuthContext } from '../../utils/authz.js';

export async function getSettlementSettings(
  prisma: AppPrismaClient,
  auth: AuthzAuthContext,
  eventId: string,
) {
  await requireEventOwnerOrAdmin(prisma, auth, eventId);
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  return {
    enabled: event.settlementEnabled,
    organizer:
      event.organizerDetails === null ? null : organizerDetailsSchema.parse(event.organizerDetails),
  };
}
export async function updateSettlementSettings(
  prisma: AppPrismaClient,
  auth: AuthzAuthContext,
  eventId: string,
  input: unknown,
) {
  await requireEventOwnerOrAdmin(prisma, auth, eventId);
  const parsed = settlementSettingsSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError('Invalid organizer settlement settings.');
  if (parsed.data.organizer) {
    parsed.data.organizer = await verifyAresOrganizer(parsed.data.organizer);
  }
  await prisma.event.update({
    where: { id: eventId },
    data: {
      settlementEnabled: parsed.data.enabled,
      organizerDetails: parsed.data.organizer ?? Prisma.DbNull,
    },
  });
  return parsed.data;
}
