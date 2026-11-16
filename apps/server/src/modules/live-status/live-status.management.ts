import type { Prisma } from '../../generated/prisma/client.js';
import type { AppPrismaClient } from '../../db/prisma-client.js';
import { AuthzError } from '../../utils/authz.js';
import { lockRadioInventory } from '../yaroc/yaroc.session.js';

export async function changeManualLiveDevice(
  db: AppPrismaClient,
  eventId: string,
  deviceId: string,
  data: Prisma.LiveDeviceUpdateManyMutationInput,
) {
  return db.$transaction(async (tx) => {
    await lockRadioInventory(tx);
    const device = await tx.liveDevice.findFirst({ where: { id: deviceId, eventId } });
    if (!device) throw new Error('Device not found');
    if (
      device.systemDeviceId ||
      (device.macAddress &&
        (await tx.systemRadioDevice.findUnique({ where: { macAddress: device.macAddress } })))
    )
      throw new AuthzError('System devices are managed in Admin zone', 403);
    await tx.liveDevice.updateMany({
      where: { id: deviceId, eventId, systemDeviceId: null },
      data,
    });
  });
}
