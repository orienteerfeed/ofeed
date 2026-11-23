import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../../generated/prisma/client.js';
import { updateEntryPayerDetails } from '../entry-billing.service.js';
import {
  getSettlementSettings,
  updateSettlementSettings,
} from '../../event/event-settlement.service.js';
vi.mock('../../event/organizer-ares.service.js', () => ({
  verifyAresOrganizer: vi.fn(async (value: unknown) => value),
}));
const organizer = {
  name: 'Club',
  street: 'Main 1',
  city: 'Choceň',
  postalCode: '56501',
  country: 'CZ',
  companyId: '15030237',
};
const auth = { isAuthenticated: true, type: 'jwt' as const, userId: 7 };
const prisma = {
  user: { findUnique: vi.fn() },
  event: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
  entry: { findUnique: vi.fn(), update: vi.fn() },
};
const client = prisma as unknown as Parameters<typeof updateEntryPayerDetails>[0];
beforeEach(() => {
  vi.resetAllMocks();
  prisma.entry.findUnique.mockResolvedValue({ eventId: 'race', status: 'PROCESSED' });
  prisma.event.findUnique.mockResolvedValue({ authorId: 7 });
  prisma.user.findUnique.mockResolvedValue({ role: 'USER' });
});
describe('billing service authorization and persistence', () => {
  it('corrects or clears payer on processed orders without changing prices', async () => {
    await updateEntryPayerDetails(client, auth, 'entry', organizer);
    expect(prisma.entry.update).toHaveBeenCalledWith({
      where: { id: 'entry' },
      data: { payerDetails: organizer },
    });
    await updateEntryPayerDetails(client, auth, 'entry', null);
    expect(prisma.entry.update).toHaveBeenLastCalledWith({
      where: { id: 'entry' },
      data: { payerDetails: Prisma.DbNull },
    });
  });
  it('rejects invalid billing and non-owner writes', async () => {
    await expect(
      updateEntryPayerDetails(client, auth, 'entry', { name: 'Incomplete' }),
    ).rejects.toThrow();
    await expect(
      updateEntryPayerDetails(client, { ...auth, userId: 8 }, 'entry', organizer),
    ).rejects.toThrow();
    expect(prisma.entry.update).not.toHaveBeenCalled();
  });
  it('saves enabled settings only with complete organizer data and defaults disabled', async () => {
    await expect(
      updateSettlementSettings(client, auth, 'race', { enabled: true, organizer: null }),
    ).rejects.toThrow();
    expect(prisma.event.update).not.toHaveBeenCalled();
    await updateSettlementSettings(client, auth, 'race', { enabled: true, organizer });
    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: 'race' },
      data: { settlementEnabled: true, organizerDetails: organizer },
    });
    prisma.event.findUniqueOrThrow.mockResolvedValue({
      settlementEnabled: false,
      organizerDetails: null,
    });
    expect(await getSettlementSettings(client, auth, 'race')).toEqual({
      enabled: false,
      organizer: null,
    });
    await expect(getSettlementSettings(client, { ...auth, userId: 8 }, 'race')).rejects.toThrow();
  });
});
