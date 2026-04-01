import { getJwtToken } from './jwtToken.js';

export const getLoginSuccessPayload = async ({ userId, prisma }) => {
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
    },
    privileges,
  };

  return loginSuccessPayload;
};
