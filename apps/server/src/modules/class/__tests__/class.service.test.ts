import { describe, expect, it, vi } from 'vitest';

import { updateClassFeeForGraphQL } from '../class.service.js';

const auth = { isAuthenticated: true, userId: 7 } as const;

function createPrismaMock() {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue({ role: 'USER' }),
    },
    event: {
      findUnique: vi.fn().mockResolvedValue({ id: 'event-1', authorId: 7 }),
    },
    class: {
      findUnique: vi.fn().mockResolvedValue({ id: 42, eventId: 'event-1' }),
      update: vi.fn().mockResolvedValue({ id: 42 }),
    },
  };
}

describe('updateClassFeeForGraphQL', () => {
  it('updates a valid non-negative fee with 2 decimal places', async () => {
    const prisma = createPrismaMock();

    await expect(
      updateClassFeeForGraphQL(prisma as never, auth, { classId: 42, fee: 123.45 }),
    ).resolves.toEqual({ message: 'Class fee updated' });

    expect(prisma.class.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { fee: 123.45 },
    });
  });

  it('allows clearing the class fee', async () => {
    const prisma = createPrismaMock();

    await expect(
      updateClassFeeForGraphQL(prisma as never, auth, { classId: 42, fee: null }),
    ).resolves.toEqual({ message: 'Class fee updated' });

    expect(prisma.class.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { fee: null },
    });
  });

  it('rejects negative fees before database access', async () => {
    const prisma = createPrismaMock();

    await expect(
      updateClassFeeForGraphQL(prisma as never, auth, { classId: 42, fee: -0.01 }),
    ).rejects.toThrow('Class fee must be greater than or equal to 0.');

    expect(prisma.class.findUnique).not.toHaveBeenCalled();
    expect(prisma.class.update).not.toHaveBeenCalled();
  });

  it('rejects fees with more than 2 decimal places before database access', async () => {
    const prisma = createPrismaMock();

    await expect(
      updateClassFeeForGraphQL(prisma as never, auth, { classId: 42, fee: 10.123 }),
    ).rejects.toThrow('Class fee can have at most 2 decimal places.');

    expect(prisma.class.findUnique).not.toHaveBeenCalled();
    expect(prisma.class.update).not.toHaveBeenCalled();
  });
});
