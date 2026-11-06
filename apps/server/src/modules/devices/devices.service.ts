import type { z } from '@hono/zod-openapi';

import type { AppPrismaClient } from '../../db/prisma-client.js';
import type { PushDevice } from '../../generated/prisma/client.js';
import { readBankPushSettings } from '../bank/bank-notifications.js';
import type { notificationSettingsSchema, registerPushTokenSchema } from './devices.schema.js';

const serialize = (device: PushDevice) => ({
  deviceId: device.deviceId,
  platform: device.platform === 'IOS' ? ('ios' as const) : ('android' as const),
  createdAt: device.createdAt.toISOString(),
  updatedAt: device.updatedAt.toISOString(),
});

/** Upsert by (user, device). A token re-registered elsewhere moves to this user and device. */
export async function registerPushToken(
  prisma: AppPrismaClient,
  userId: number,
  input: z.infer<typeof registerPushTokenSchema>,
) {
  const platform = input.platform === 'ios' ? 'IOS' : 'ANDROID';
  const device = await prisma.$transaction(async (tx) => {
    await tx.pushDevice.deleteMany({
      where: {
        expoPushToken: input.expoPushToken,
        NOT: { userId, deviceId: input.deviceId },
      },
    });
    return tx.pushDevice.upsert({
      where: { userId_deviceId: { userId, deviceId: input.deviceId } },
      create: { userId, deviceId: input.deviceId, expoPushToken: input.expoPushToken, platform },
      update: { expoPushToken: input.expoPushToken, platform },
    });
  });
  return serialize(device);
}

/** Idempotent: unregistering an unknown device succeeds. */
export async function unregisterPushToken(
  prisma: AppPrismaClient,
  userId: number,
  deviceId: string,
) {
  const { count } = await prisma.pushDevice.deleteMany({ where: { userId, deviceId } });
  return { deleted: count };
}

export async function getNotificationSettings(prisma: AppPrismaClient, userId: number) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { bankPushStatuses: true },
  });
  return { bankPayment: readBankPushSettings(user.bankPushStatuses) };
}

export async function updateNotificationSettings(
  prisma: AppPrismaClient,
  userId: number,
  input: z.infer<typeof notificationSettingsSchema>,
) {
  await prisma.user.update({
    where: { id: userId },
    data: { bankPushStatuses: input.bankPayment },
  });
  return { bankPayment: input.bankPayment };
}
