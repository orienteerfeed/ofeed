import { describe, expect, it, vi } from 'vitest';

import { updateClassFeeForGraphQL, updateClassForGraphQL } from '../class.service.js';

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
      findUnique: vi.fn().mockResolvedValue({
        id: 42,
        eventId: 'event-1',
        minAge: null,
        maxAge: null,
        minTeamMembers: null,
        maxTeamMembers: null,
      }),
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

describe('updateClassForGraphQL', () => {
  it('updates only the provided fields', async () => {
    const prisma = createPrismaMock();

    await expect(
      updateClassForGraphQL(prisma as never, auth, {
        classId: 42,
        maxNumberOfCompetitors: 30,
        sex: 'F',
      }),
    ).resolves.toEqual({ message: 'Class updated' });

    expect(prisma.class.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { maxNumberOfCompetitors: 30, sex: 'F' },
    });
  });

  it('clears a nullable field when null is passed', async () => {
    const prisma = createPrismaMock();

    await expect(
      updateClassForGraphQL(prisma as never, auth, { classId: 42, startMode: null }),
    ).resolves.toEqual({ message: 'Class updated' });

    expect(prisma.class.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { startMode: null },
    });
  });

  it('rejects minAge greater than maxAge before database access', async () => {
    const prisma = createPrismaMock();

    await expect(
      updateClassForGraphQL(prisma as never, auth, { classId: 42, minAge: 40, maxAge: 10 }),
    ).rejects.toThrow('minAge must be less than or equal to maxAge.');

    expect(prisma.class.findUnique).not.toHaveBeenCalled();
    expect(prisma.class.update).not.toHaveBeenCalled();
  });

  it('rejects a partial age update that conflicts with the stored maxAge', async () => {
    const prisma = createPrismaMock();
    prisma.class.findUnique.mockResolvedValueOnce({
      id: 42,
      eventId: 'event-1',
      minAge: 1,
      maxAge: 10,
      minTeamMembers: null,
      maxTeamMembers: null,
    });

    await expect(
      updateClassForGraphQL(prisma as never, auth, { classId: 42, minAge: 40 }),
    ).rejects.toThrow('minAge must be less than or equal to maxAge.');

    expect(prisma.class.update).not.toHaveBeenCalled();
  });

  it('rejects minTeamMembers greater than maxTeamMembers', async () => {
    const prisma = createPrismaMock();

    await expect(
      updateClassForGraphQL(prisma as never, auth, {
        classId: 42,
        minTeamMembers: 5,
        maxTeamMembers: 2,
      }),
    ).rejects.toThrow('minTeamMembers must be less than or equal to maxTeamMembers.');

    expect(prisma.class.update).not.toHaveBeenCalled();
  });

  it('rejects a partial team-size update that conflicts with the stored minimum', async () => {
    const prisma = createPrismaMock();
    prisma.class.findUnique.mockResolvedValueOnce({
      id: 42,
      eventId: 'event-1',
      minAge: null,
      maxAge: null,
      minTeamMembers: 3,
      maxTeamMembers: 5,
    });

    await expect(
      updateClassForGraphQL(prisma as never, auth, { classId: 42, maxTeamMembers: 2 }),
    ).rejects.toThrow('minTeamMembers must be less than or equal to maxTeamMembers.');

    expect(prisma.class.update).not.toHaveBeenCalled();
  });

  it('rejects fees with more than 2 decimal places', async () => {
    const prisma = createPrismaMock();

    await expect(
      updateClassForGraphQL(prisma as never, auth, { classId: 42, fee: 10.123 }),
    ).rejects.toThrow('Class fee can have at most 2 decimal places.');

    expect(prisma.class.update).not.toHaveBeenCalled();
  });

  it('throws when the class does not exist', async () => {
    const prisma = createPrismaMock();
    prisma.class.findUnique.mockResolvedValueOnce(null);

    await expect(
      updateClassForGraphQL(prisma as never, auth, { classId: 999, minAge: 1 }),
    ).rejects.toThrow('Class not found');
  });
});
