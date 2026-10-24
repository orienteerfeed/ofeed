import { getJwtToken } from './jwtToken.js';
import type { AppPrismaClient } from '../db/prisma-client.js';

export const getLoginSuccessPayload = async ({
  userId,
  prisma,
}: {
  userId: number;
  prisma: AppPrismaClient;
}) => {
  const token = getJwtToken({ userId });

  const dbResponse = await prisma.user.findFirst({
    where: {
      id: userId,
      active: true,
    },
    select: {
      id: true,
      firstname: true,
      lastname: true,
      email: true,
      role: true,
      organisation: true,
      emergencyContact: true,
      active: true,
      emailVerifiedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!dbResponse) {
    throw new Error('Active user not found');
  }

  const privileges = dbResponse.role === 'ADMIN' ? ['ADMIN'] : [];

  const loginSuccessPayload = {
    token,
    user: {
      userId: dbResponse.id,
      firstName: dbResponse.firstname,
      lastName: dbResponse.lastname,
      email: dbResponse.email,
      role: dbResponse.role,
      organisation: dbResponse.organisation,
      emergencyContact: dbResponse.emergencyContact,
      active: dbResponse.active,
      emailVerifiedAt: dbResponse.emailVerifiedAt,
      createdAt: dbResponse.createdAt,
      updatedAt: dbResponse.updatedAt,
    },
    privileges,
  };

  return loginSuccessPayload;
};
