import { getJwtToken } from './jwtToken.js';

export const getLoginSuccessPayload = async ({ userId, prisma }) => {
  const token = getJwtToken({ userId });

  const dbResponse = await prisma.user.findFirst({
    where: {
      id: userId,
      active: true,
    },
    select: { id: true, firstname: true, lastname: true },
  });

  const dbPrivilegesResponse = await hasPrivilege(userId, prisma);

  const privileges = dbPrivilegesResponse.map((privilege) => privilege.name);

  const loginSuccessPayload = {
    token,
    user: {
      userId: dbResponse.id,
      firstName: dbResponse.firstname,
      lastName: dbResponse.lastname,
    },
    privileges,
  };

  return loginSuccessPayload;
};

export const hasPrivilege = async (userId, prisma) => {
  // TODO: implement privileges for users
  /*   return await Permission.findAll({
    include: [
      {
        model: Role,
        required: true,
        include: [{ model: User, required: true, where: { id: userId } }],
      },
    ],
  }); */
  return [];
};
