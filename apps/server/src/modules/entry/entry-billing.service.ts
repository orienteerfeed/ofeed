import { billingDetailsSchema } from '@repo/shared';
import type { AppPrismaClient } from '../../db/prisma-client.js';
import { Prisma } from '../../generated/prisma/client.js';
import { NotFoundError, ValidationError } from '../../exceptions/index.js';
import { requireEventOwnerOrAdmin, type AuthzAuthContext } from '../../utils/authz.js';

export async function updateEntryPayerDetails(
  prisma: AppPrismaClient,
  auth: AuthzAuthContext,
  entryId: string,
  input: unknown,
) {
  const entry = await prisma.entry.findUnique({
    where: { id: entryId },
    select: { eventId: true },
  });
  if (!entry) throw new NotFoundError('Entry order not found.');
  await requireEventOwnerOrAdmin(prisma, auth, entry.eventId);
  const parsed = billingDetailsSchema.nullable().safeParse(input);
  if (!parsed.success) throw new ValidationError('Invalid payer details.');
  await prisma.entry.update({
    where: { id: entryId },
    data: { payerDetails: parsed.data ?? Prisma.DbNull },
  });
}
