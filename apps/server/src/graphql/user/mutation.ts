import {
  authenticateUser,
  changeAuthenticatedUserPassword,
  signupUser,
  passwordResetRequest,
  passwordResetConfirm,
} from '../../modules/auth/auth.service.js';

function getAuthenticatedUserId(context) {
  const { auth } = context;

  if (!auth?.isAuthenticated || !auth.userId) {
    throw new Error('Unauthorized: Invalid or missing credentials');
  }

  const userId = Number(auth.userId);
  if (!Number.isFinite(userId)) {
    throw new Error('Unauthorized: Invalid user identifier');
  }

  return userId;
}

export const signin = async (_, { input }, context) => {
  // Implement signin logic here
  const { username, password } = input;

  try {
    const loginSuccessPayload = await authenticateUser(username, password);
    return {
      token: loginSuccessPayload.token,
      user: {
        id: loginSuccessPayload.user.userId,
        firstname: loginSuccessPayload.user.firstName,
        lastname: loginSuccessPayload.user.lastName,
        email: loginSuccessPayload.user.email ?? username,
        organisation: loginSuccessPayload.user.organisation ?? null,
        emergencyContact: loginSuccessPayload.user.emergencyContact ?? null,
      },
    };
  } catch (error) {
    throw new Error(error.message);
  }
};

export const signup = async (_, { input }, context) => {
  // Implement signup logic here
  // Example: Check if user exists, hash password, save to DB, generate JWT
  const { email, password, firstname, lastname, organisation } = input;

  try {
    const signUpPayload = await signupUser(
      email,
      password,
      firstname,
      lastname,
      context.activationUrl,
      organisation
    );
    return {
      token: signUpPayload.token,
      user: {
        id: signUpPayload.user.id,
        firstname: firstname,
        lastname: lastname,
        email: email,
        organisation: signUpPayload.user.organisation ?? null,
      },
      message: 'User successfuly created',
    };
  } catch (error) {
    throw new Error(error.message);
  }
};

export const updateCurrentUser = async (_, { input }, context) => {
  const { prisma } = context;
  const userId = getAuthenticatedUserId(context);

  const data: {
    email?: string;
    firstname?: string;
    lastname?: string;
    organisation?: string | null;
    emergencyContact?: string | null;
  } = {};

  if (input.email !== undefined) {
    const email = input.email.trim().toLowerCase();
    if (!email) {
      throw new Error('Email cannot be empty');
    }
    data.email = email;
  }

  if (input.firstname !== undefined) {
    const firstname = input.firstname.trim();
    if (!firstname) {
      throw new Error('First name cannot be empty');
    }
    data.firstname = firstname;
  }

  if (input.lastname !== undefined) {
    const lastname = input.lastname.trim();
    if (!lastname) {
      throw new Error('Last name cannot be empty');
    }
    data.lastname = lastname;
  }

  if (input.organisation !== undefined) {
    const organisation = input.organisation?.trim();
    data.organisation = organisation ? organisation : null;
  }

  if (input.emergencyContact !== undefined) {
    const emergencyContact = input.emergencyContact?.trim();
    data.emergencyContact = emergencyContact ? emergencyContact : null;
  }

  if (Object.keys(data).length === 0) {
    throw new Error('No profile fields were provided for update');
  }

  try {
    return prisma.user.update({
      where: { id: userId },
      data,
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      throw new Error('Email is already in use');
    }
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw new Error('Failed to update user profile');
  }
};

export const createUserCard = async (_, { input }, context) => {
  const { prisma } = context;
  const userId = getAuthenticatedUserId(context);
  const sportId = Number(input.sportId);
  const cardNumber = input.cardNumber.trim();

  if (!Number.isFinite(sportId)) {
    throw new Error('Invalid sport identifier');
  }

  if (!cardNumber) {
    throw new Error('Card number cannot be empty');
  }

  const type = input.type ?? 'SPORTIDENT';

  try {
    return await prisma.$transaction(async tx => {
      const sport = await tx.sport.findUnique({
        where: { id: sportId },
        select: { id: true },
      });

      if (!sport) {
        throw new Error('Sport not found');
      }

      let shouldSetDefault = input.isDefault === true;
      if (!shouldSetDefault) {
        const existingDefault = await tx.userCard.findFirst({
          where: { userId, sportId, isDefault: true },
          select: { id: true },
        });
        shouldSetDefault = !existingDefault;
      }

      if (shouldSetDefault) {
        await tx.userCard.updateMany({
          where: { userId, sportId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.userCard.create({
        data: {
          userId,
          sportId,
          type,
          cardNumber,
          isDefault: shouldSetDefault,
        },
        include: { sport: true },
      });
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      throw new Error('This card is already saved for the selected sport');
    }
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw new Error('Failed to create user card');
  }
};

export const updateUserCard = async (_, { input }, context) => {
  const { prisma } = context;
  const userId = getAuthenticatedUserId(context);
  const sportId = Number(input.sportId);
  const cardNumber = input.cardNumber.trim();

  if (!Number.isFinite(sportId)) {
    throw new Error('Invalid sport identifier');
  }

  if (!cardNumber) {
    throw new Error('Card number cannot be empty');
  }

  try {
    return await prisma.$transaction(async tx => {
      const existing = await tx.userCard.findFirst({
        where: { id: input.id, userId },
        select: { id: true, sportId: true, isDefault: true },
      });

      if (!existing) {
        throw new Error('Card not found');
      }

      const sport = await tx.sport.findUnique({
        where: { id: sportId },
        select: { id: true },
      });

      if (!sport) {
        throw new Error('Sport not found');
      }

      if (existing.isDefault && existing.sportId !== sportId) {
        await tx.userCard.updateMany({
          where: { userId, sportId, isDefault: true, id: { not: existing.id } },
          data: { isDefault: false },
        });
      }

      const updatedCard = await tx.userCard.update({
        where: { id: input.id },
        data: {
          sportId,
          type: input.type,
          cardNumber,
        },
        include: { sport: true },
      });

      if (existing.isDefault && existing.sportId !== sportId) {
        const replacement = await tx.userCard.findFirst({
          where: { userId, sportId: existing.sportId },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          select: { id: true },
        });

        if (replacement) {
          await tx.userCard.update({
            where: { id: replacement.id },
            data: { isDefault: true },
          });
        }
      }

      return updatedCard;
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      throw new Error('This card is already saved for the selected sport');
    }
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw new Error('Failed to update user card');
  }
};

export const deleteUserCard = async (_, { id }, context) => {
  const { prisma } = context;
  const userId = getAuthenticatedUserId(context);

  await prisma.$transaction(async tx => {
    const existing = await tx.userCard.findFirst({
      where: { id, userId },
      select: { id: true, sportId: true, isDefault: true },
    });

    if (!existing) {
      throw new Error('Card not found');
    }

    await tx.userCard.delete({
      where: { id: existing.id },
    });

    if (existing.isDefault) {
      const replacement = await tx.userCard.findFirst({
        where: { userId, sportId: existing.sportId },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: { id: true },
      });

      if (replacement) {
        await tx.userCard.update({
          where: { id: replacement.id },
          data: { isDefault: true },
        });
      }
    }
  });

  return true;
};

export const setDefaultUserCard = async (_, { id }, context) => {
  const { prisma } = context;
  const userId = getAuthenticatedUserId(context);

  return prisma.$transaction(async tx => {
    const existing = await tx.userCard.findFirst({
      where: { id, userId },
      select: { id: true, sportId: true },
    });

    if (!existing) {
      throw new Error('Card not found');
    }

    await tx.userCard.updateMany({
      where: { userId, sportId: existing.sportId, isDefault: true },
      data: { isDefault: false },
    });

    return tx.userCard.update({
      where: { id: existing.id },
      data: { isDefault: true },
      include: { sport: true },
    });
  });
};

export const requestPasswordReset = async (_, { email }, context) => {
  // Example: Check if user exists, hash password, save to DB, generate JWT

  // Get password reset base URL from headers
  const passwordResetBaseUrl = context.resetPasswordUrl;
  if (!passwordResetBaseUrl) throw new Error('Missing password reset URL in headers');

  try {
    const passwordResetPayload = await passwordResetRequest(email, passwordResetBaseUrl);
    return {
      success: passwordResetPayload.success,
      message: passwordResetPayload.message,
    };
  } catch (error) {
    throw new Error(error.message);
  }
};

export const resetPassword = async (_, { token, newPassword }, context) => {
  try {
    const passwordResetPayload = await passwordResetConfirm(token, newPassword);
    return {
      token: passwordResetPayload.jwtToken,
      user: passwordResetPayload.user,
      message: 'Password reset successful',
    };
  } catch (error) {
    throw new Error(error.message);
  }
};

export const changeCurrentUserPassword = async (_, { input }, context) => {
  const userId = getAuthenticatedUserId(context);

  try {
    return await changeAuthenticatedUserPassword(
      userId,
      input.currentPassword,
      input.newPassword,
    );
  } catch (error) {
    throw new Error(error.message);
  }
};
