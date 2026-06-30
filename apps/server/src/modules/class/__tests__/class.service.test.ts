import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  loadClassDefinitionsFromExternalSystemForGraphQL,
  updateClassFeeForGraphQL,
  updateClassForGraphQL,
} from '../class.service.js';

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
    $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it('updates the late-entry fee opt-out flag', async () => {
    const prisma = createPrismaMock();

    await expect(
      updateClassForGraphQL(prisma as never, auth, {
        classId: 42,
        lateEntryFeeDisabled: true,
      }),
    ).resolves.toEqual({ message: 'Class updated' });

    expect(prisma.class.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { lateEntryFeeDisabled: true },
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

describe('loadClassDefinitionsFromExternalSystemForGraphQL', () => {
  it('loads ORIS class definitions and overwrites matching local classes', async () => {
    const prisma = createPrismaMock();
    prisma.event.findUnique
      .mockResolvedValueOnce({
        id: 'event-1',
        externalSource: 'ORIS',
        externalEventId: '8835',
        classes: [
          { id: 1, externalId: '101', name: 'H21' },
          { id: 2, externalId: '102', name: 'D21' },
        ],
      })
      .mockResolvedValueOnce({ id: 'event-1', authorId: 7 });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            Status: 'OK',
            Data: {
              Classes: {
                Class_1: {
                  ID: '101',
                  Name: 'H21',
                  Fee: '250',
                  AgeFrom: '21',
                  AgeTo: '99',
                  Gender: 'M',
                  NoExtraFee: '1',
                },
                Class_2: {
                  ID: '102',
                  Name: 'D21',
                  Fee: '200.50',
                  AgeFrom: '21',
                  AgeTo: '99',
                  Gender: '',
                  NoExtraFee: '0',
                },
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    await expect(
      loadClassDefinitionsFromExternalSystemForGraphQL(prisma as never, auth, 'event-1'),
    ).resolves.toEqual({ updatedCount: 2 });

    expect(prisma.class.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        fee: 250,
        minAge: 21,
        maxAge: null,
        sex: 'M',
        lateEntryFeeDisabled: true,
      },
    });
    expect(prisma.class.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: {
        fee: 200.5,
        minAge: 21,
        maxAge: null,
        sex: 'B',
        lateEntryFeeDisabled: false,
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('falls back to matching by class name when local externalId is missing', async () => {
    const prisma = createPrismaMock();
    prisma.event.findUnique
      .mockResolvedValueOnce({
        id: 'event-1',
        externalSource: 'ORIS',
        externalEventId: '8835',
        classes: [{ id: 1, externalId: null, name: 'H21' }],
      })
      .mockResolvedValueOnce({ id: 'event-1', authorId: 7 });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            Data: {
              Classes: {
                H21: {
                  Name: 'H21',
                  Fee: '100',
                  AgeFrom: '21',
                  AgeTo: '35',
                  Gender: 'M',
                  NoExtraFee: false,
                },
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    await expect(
      loadClassDefinitionsFromExternalSystemForGraphQL(prisma as never, auth, 'event-1'),
    ).resolves.toEqual({ updatedCount: 1 });

    expect(prisma.class.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        fee: 100,
        minAge: 21,
        maxAge: 35,
        sex: 'M',
        lateEntryFeeDisabled: false,
      },
    });
  });

  it('uses ORIS nested ClassDefinition data while matching by the parent class name', async () => {
    const prisma = createPrismaMock();
    prisma.event.findUnique
      .mockResolvedValueOnce({
        id: 'event-1',
        externalSource: 'ORIS',
        externalEventId: '8835',
        classes: [{ id: 1, externalId: 'quickevent-10', name: 'D10F' }],
      })
      .mockResolvedValueOnce({ id: 'event-1', authorId: 7 });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            Data: {
              Classes: {
                Class_198733: {
                  ID: '198733',
                  Name: 'D10F',
                  Fee: '110',
                  NoExtraFee: '0',
                  ClassDefinition: {
                    ID: '43',
                    AgeFrom: '0',
                    AgeTo: '10',
                    Gender: 'F',
                    Name: 'D10',
                  },
                },
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    await expect(
      loadClassDefinitionsFromExternalSystemForGraphQL(prisma as never, auth, 'event-1'),
    ).resolves.toEqual({ updatedCount: 1 });

    expect(prisma.class.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        fee: 110,
        minAge: null,
        maxAge: 10,
        sex: 'F',
        lateEntryFeeDisabled: false,
      },
    });
  });

  it('keeps ORIS parent fee when nested ClassDefinition has the same class name', async () => {
    const prisma = createPrismaMock();
    prisma.event.findUnique
      .mockResolvedValueOnce({
        id: 'event-1',
        externalSource: 'ORIS',
        externalEventId: '8835',
        classes: [{ id: 1, externalId: 'quickevent-hdr', name: 'HDR' }],
      })
      .mockResolvedValueOnce({ id: 'event-1', authorId: 7 });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            Data: {
              Classes: {
                Class_198768: {
                  ID: '198768',
                  Name: 'HDR',
                  Fee: '110',
                  NoExtraFee: '1',
                  ClassDefinition: {
                    ID: '119',
                    AgeFrom: '0',
                    AgeTo: '99',
                    Gender: '',
                    Name: 'HDR',
                  },
                },
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    await expect(
      loadClassDefinitionsFromExternalSystemForGraphQL(prisma as never, auth, 'event-1'),
    ).resolves.toEqual({ updatedCount: 1 });

    expect(prisma.class.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        fee: 110,
        minAge: null,
        maxAge: null,
        sex: 'B',
        lateEntryFeeDisabled: true,
      },
    });
  });

  it('normalizes ORIS open age boundaries independently', async () => {
    const prisma = createPrismaMock();
    prisma.event.findUnique
      .mockResolvedValueOnce({
        id: 'event-1',
        externalSource: 'ORIS',
        externalEventId: '8835',
        classes: [
          { id: 1, externalId: 'quickevent-d10', name: 'D10' },
          { id: 2, externalId: 'quickevent-d35', name: 'D35' },
        ],
      })
      .mockResolvedValueOnce({ id: 'event-1', authorId: 7 });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            Data: {
              Classes: {
                Class_1: {
                  ID: '1',
                  Name: 'D10',
                  Fee: '110',
                  ClassDefinition: {
                    AgeFrom: '0',
                    AgeTo: '10',
                    Gender: 'F',
                    Name: 'D10',
                  },
                },
                Class_2: {
                  ID: '2',
                  Name: 'D35',
                  Fee: '140',
                  ClassDefinition: {
                    AgeFrom: '35',
                    AgeTo: '99',
                    Gender: 'F',
                    Name: 'D35',
                  },
                },
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    await expect(
      loadClassDefinitionsFromExternalSystemForGraphQL(prisma as never, auth, 'event-1'),
    ).resolves.toEqual({ updatedCount: 2 });

    expect(prisma.class.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({
        minAge: null,
        maxAge: 10,
      }),
    });
    expect(prisma.class.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: expect.objectContaining({
        minAge: 35,
        maxAge: null,
      }),
    });
  });

  it('rejects events without an external link', async () => {
    const prisma = createPrismaMock();
    prisma.event.findUnique
      .mockResolvedValueOnce({
        id: 'event-1',
        externalSource: null,
        externalEventId: null,
        classes: [{ id: 1, externalId: '101', name: 'H21' }],
      })
      .mockResolvedValueOnce({ id: 'event-1', authorId: 7 });

    await expect(
      loadClassDefinitionsFromExternalSystemForGraphQL(prisma as never, auth, 'event-1'),
    ).rejects.toThrow('External event link is not configured.');

    expect(prisma.class.update).not.toHaveBeenCalled();
  });
});
