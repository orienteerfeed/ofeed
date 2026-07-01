import argon2 from 'argon2';
import { GraphQLError } from 'graphql';
import { isRelayDiscipline } from '../../utils/relay.js';

import type { AppPrismaClient } from '../../db/prisma-client.js';
import { AuthenticationError, ValidationError } from '../../exceptions/index.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { GraphQLAuthContext } from '../../graphql/context.types.js';
import prisma from '../../utils/context.js';
import { AuthzError } from '../../utils/authz.js';
import { formatUtcDateTimeRfc3339 } from '../../utils/time.js';
import {
  verifyEmail,
  sendVerificationEmailHelper,
  authenticateUser,
  changeAuthenticatedUserPassword,
  passwordResetConfirm,
  passwordResetRequest,
  signupUser,
} from '../auth/auth.service.js';
import { generateJwtTokenForLink } from '../../utils/jwtToken.js';
import { getEventStatusSummary } from '../event/event.status.service.js';
import type {
  ChangeCurrentUserPasswordInput,
  CreateUserCardInput,
  DeleteCurrentAccountInput,
  LoginInput,
  UpdateCurrentUserInput,
  UpdateUserCardInput,
  UserInput,
} from './user.schema.js';

export type UserFindUniqueSelection = Omit<Prisma.UserFindUniqueArgs, 'where'>;
export type EventFindManySelection = Omit<Prisma.EventFindManyArgs, 'where'>;
export type UserCardFindManySelection = Omit<Prisma.UserCardFindManyArgs, 'where'>;

export function getAuthenticatedUserId(auth: GraphQLAuthContext) {
  if (!auth?.isAuthenticated || !auth.userId) {
    throw new AuthzError('Unauthorized: Invalid or missing credentials', 401);
  }

  const userId = Number(auth.userId);
  if (!Number.isFinite(userId)) {
    throw new AuthzError('Unauthorized: Invalid user identifier', 401);
  }

  return userId;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  return 'Unexpected error';
}

export function toGraphQLUserMutationError(error: unknown) {
  if (error instanceof GraphQLError) {
    return error;
  }

  if (error instanceof AuthenticationError) {
    return new GraphQLError(
      error.message === 'Login failed' ? 'Invalid email or password' : error.message,
      {
        extensions: {
          code: 'UNAUTHENTICATED',
          http: { status: 401 },
        },
      },
    );
  }

  if (error instanceof ValidationError) {
    return new GraphQLError(error.message, {
      extensions: {
        code: 'BAD_USER_INPUT',
        http: { status: 422 },
      },
    });
  }

  if (error instanceof Error) {
    return new GraphQLError(error.message, {
      extensions: {
        code: 'INTERNAL_SERVER_ERROR',
      },
    });
  }

  return new GraphQLError('Unexpected error', {
    extensions: {
      code: 'INTERNAL_SERVER_ERROR',
    },
  });
}

export function findCurrentUser(
  db: AppPrismaClient,
  auth: GraphQLAuthContext,
  query: UserFindUniqueSelection = {},
) {
  const userId = getAuthenticatedUserId(auth);

  return db.user.findUnique({
    ...query,
    where: { id: userId },
  });
}

export function findMyEvents(
  db: AppPrismaClient,
  auth: GraphQLAuthContext,
  query: EventFindManySelection = {},
) {
  const userId = getAuthenticatedUserId(auth);

  return db.event.findMany({
    ...query,
    where: { authorId: userId },
  });
}

export function findCurrentUserCards(
  db: AppPrismaClient,
  auth: GraphQLAuthContext,
  query: UserCardFindManySelection = {},
) {
  const userId = getAuthenticatedUserId(auth);

  return db.userCard.findMany({
    ...query,
    where: { userId },
    orderBy: [{ sportId: 'asc' }, { isDefault: 'desc' }, { updatedAt: 'desc' }],
  });
}

export async function signIn(input: LoginInput) {
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
        role: loginSuccessPayload.user.role,
        organisation: loginSuccessPayload.user.organisation ?? null,
        emergencyContact: loginSuccessPayload.user.emergencyContact ?? null,
      },
    };
  } catch (error) {
    throw toGraphQLUserMutationError(error);
  }
}

export async function signUp(input: UserInput, activationUrl: string) {
  const { email, password, firstname, lastname, organisation } = input;

  try {
    const signUpPayload = await signupUser(
      email,
      password,
      firstname,
      lastname,
      activationUrl,
      organisation,
    );

    return {
      token: signUpPayload.token,
      user: {
        id: signUpPayload.user.id,
        firstname,
        lastname,
        email,
        role: signUpPayload.user.role,
        organisation: signUpPayload.user.organisation ?? null,
        emergencyContact: signUpPayload.user.emergencyContact ?? null,
      },
      message: 'User successfuly created',
    };
  } catch (error) {
    throw toGraphQLUserMutationError(error);
  }
}

export async function verifyUserEmail(token: string) {
  try {
    const verificationPayload = await verifyEmail(token);
    return {
      token: verificationPayload.token,
      user: {
        id: verificationPayload.user.userId,
        firstname: verificationPayload.user.firstName,
        lastname: verificationPayload.user.lastName,
        email: verificationPayload.user.email,
        role: verificationPayload.user.role,
        organisation: verificationPayload.user.organisation ?? null,
        emergencyContact: verificationPayload.user.emergencyContact ?? null,
      },
      message: 'Email verified',
    };
  } catch (error) {
    throw toGraphQLUserMutationError(error);
  }
}

export async function resendUserEmailVerification(auth: GraphQLAuthContext) {
  const userId = getAuthenticatedUserId(auth);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, firstname: true, lastname: true, emailVerifiedAt: true },
  });

  if (!user) {
    throw new GraphQLError('User not found', { extensions: { code: 'NOT_FOUND' } });
  }

  if (user.emailVerifiedAt) {
    return { success: true, message: 'Email already verified.' };
  }

  const verificationToken = generateJwtTokenForLink(user.id);
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  const verificationLink = `${frontendUrl}/auth/verify-email/${verificationToken}`;

  await sendVerificationEmailHelper(user.firstname, user.lastname, user.email, verificationLink);

  return { success: true, message: 'Verification email sent.' };
}

export async function updateAuthenticatedUser(
  db: AppPrismaClient,
  auth: GraphQLAuthContext,
  input: UpdateCurrentUserInput,
) {
  const userId = getAuthenticatedUserId(auth);

  const data: {
    email?: string;
    firstname?: string;
    lastname?: string;
    organisation?: string | null;
    emergencyContact?: string | null;
    emailVerifiedAt?: Date | null;
  } = {};
  let shouldSendVerificationEmail = false;

  if (input.email !== undefined) {
    const email = input.email?.trim().toLowerCase();
    if (!email) {
      throw new Error('Email cannot be empty');
    }

    const currentUser = await db.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!currentUser) {
      throw new Error('Current user not found');
    }

    shouldSendVerificationEmail = currentUser.email.trim().toLowerCase() !== email;
    data.email = email;

    if (shouldSendVerificationEmail) {
      data.emailVerifiedAt = null;
    }
  }

  if (input.firstname !== undefined) {
    const firstname = input.firstname?.trim();
    if (!firstname) {
      throw new Error('First name cannot be empty');
    }
    data.firstname = firstname;
  }

  if (input.lastname !== undefined) {
    const lastname = input.lastname?.trim();
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
    const updatedUser = await db.user.update({
      where: { id: userId },
      data,
    });

    if (shouldSendVerificationEmail) {
      const verificationToken = generateJwtTokenForLink(updatedUser.id);
      const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
      const verificationLink = `${frontendUrl}/auth/verify-email/${verificationToken}`;

      await sendVerificationEmailHelper(
        updatedUser.firstname,
        updatedUser.lastname,
        updatedUser.email,
        verificationLink,
      );
    }

    return updatedUser;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      throw new Error('Email is already in use');
    }
    throw new Error(getErrorMessage(error));
  }
}

export async function createAuthenticatedUserCard(
  db: AppPrismaClient,
  auth: GraphQLAuthContext,
  input: CreateUserCardInput,
) {
  const userId = getAuthenticatedUserId(auth);
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
    return await db.$transaction(async (tx) => {
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
    throw new Error(getErrorMessage(error) || 'Failed to create user card');
  }
}

export async function updateAuthenticatedUserCard(
  db: AppPrismaClient,
  auth: GraphQLAuthContext,
  input: UpdateUserCardInput,
) {
  const userId = getAuthenticatedUserId(auth);
  const sportId = Number(input.sportId);
  const cardNumber = input.cardNumber.trim();

  if (!Number.isFinite(sportId)) {
    throw new Error('Invalid sport identifier');
  }

  if (!cardNumber) {
    throw new Error('Card number cannot be empty');
  }

  try {
    return await db.$transaction(async (tx) => {
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
    throw new Error(getErrorMessage(error) || 'Failed to update user card');
  }
}

export async function deleteAuthenticatedUserCard(
  db: AppPrismaClient,
  auth: GraphQLAuthContext,
  id: number,
) {
  const userId = getAuthenticatedUserId(auth);

  await db.$transaction(async (tx) => {
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
}

export async function setDefaultAuthenticatedUserCard(
  db: AppPrismaClient,
  auth: GraphQLAuthContext,
  id: number,
) {
  const userId = getAuthenticatedUserId(auth);

  return db.$transaction(async (tx) => {
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
}

export async function requestUserPasswordReset(email: string, resetPasswordUrl: string) {
  if (!resetPasswordUrl) {
    throw new ValidationError('Missing password reset URL in headers');
  }

  const passwordResetPayload = await passwordResetRequest(email, resetPasswordUrl);
  return {
    success: passwordResetPayload.success,
    message: passwordResetPayload.message,
  };
}

export async function resetUserPassword(token: string, newPassword: string) {
  const passwordResetPayload = await passwordResetConfirm(token, newPassword);
  return {
    token: passwordResetPayload.jwtToken,
    user: passwordResetPayload.user,
    message: 'Password reset successful',
  };
}

export async function changeCurrentUserPassword(
  auth: GraphQLAuthContext,
  input: ChangeCurrentUserPasswordInput,
) {
  const userId = getAuthenticatedUserId(auth);

  try {
    return await changeAuthenticatedUserPassword(userId, input.currentPassword, input.newPassword);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function anonymizeCurrentUserAccount(
  auth: GraphQLAuthContext,
  input: DeleteCurrentAccountInput,
) {
  const userId = getAuthenticatedUserId(auth);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, password: true, deletedAt: true },
  });

  if (!user) {
    throw new GraphQLError('User not found', { extensions: { code: 'NOT_FOUND' } });
  }

  if (user.deletedAt) {
    throw new GraphQLError('Account is already scheduled for deletion', {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }

  const isPasswordValid = await argon2.verify(user.password, input.currentPassword);
  if (!isPasswordValid) {
    throw new GraphQLError('Current password is incorrect', {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }

  await prisma.$transaction(async (tx) => {
    const clients = await tx.oAuthClient.findMany({
      where: { userId },
      select: { id: true },
    });
    const clientIds = clients.map((c) => c.id);

    if (clientIds.length > 0) {
      await tx.oAuthAuthorizationCode.deleteMany({ where: { clientId: { in: clientIds } } });
      await tx.oAuthAccessToken.deleteMany({ where: { clientId: { in: clientIds } } });
      await tx.oAuthRefreshToken.deleteMany({ where: { clientId: { in: clientIds } } });
      await tx.oAuthGrant.deleteMany({ where: { clientId: { in: clientIds } } });
      await tx.oAuthScope.deleteMany({ where: { clientId: { in: clientIds } } });
      await tx.oAuthRedirectUri.deleteMany({ where: { clientId: { in: clientIds } } });
      await tx.oAuthClient.deleteMany({ where: { userId } });
    }

    await tx.passwordResetToken.deleteMany({ where: { userId } });

    await tx.userCard.deleteMany({ where: { userId } });

    if (input.deleteEvents) {
      const eventIds = (
        await tx.event.findMany({ where: { authorId: userId }, select: { id: true } })
      ).map((e) => e.id);

      if (eventIds.length > 0) {
        const classIds = (
          await tx.class.findMany({
            where: { eventId: { in: eventIds } },
            select: { id: true },
          })
        ).map((c) => c.id);

        if (classIds.length > 0) {
          const competitorIds = (
            await tx.competitor.findMany({
              where: { classId: { in: classIds } },
              select: { id: true },
            })
          ).map((c) => c.id);

          if (competitorIds.length > 0) {
            await tx.split.deleteMany({ where: { competitorId: { in: competitorIds } } });
          }

          await tx.protocol.deleteMany({ where: { eventId: { in: eventIds } } });

          if (competitorIds.length > 0) {
            await tx.competitor.deleteMany({ where: { id: { in: competitorIds } } });
          }

          await tx.team.deleteMany({ where: { classId: { in: classIds } } });
          await tx.class.deleteMany({ where: { id: { in: classIds } } });
        } else {
          await tx.protocol.deleteMany({ where: { eventId: { in: eventIds } } });
        }

        await tx.eventExternalResultsSyncState.deleteMany({
          where: { eventId: { in: eventIds } },
        });

        await tx.event.deleteMany({ where: { id: { in: eventIds } } });
      }
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        email: `deleted-${userId}@deleted.invalid`,
        firstname: 'Deleted',
        lastname: 'User',
        password: 'ACCOUNT_DELETED',
        organisation: null,
        emergencyContact: null,
        active: false,
        emailVerifiedAt: null,
        deletedAt: new Date(),
      },
    });
  });

  return true;
}

export async function listMyEvents(userId: number | string) {
  const events = await prisma.event.findMany({
    where: { authorId: userId as number },
    select: {
      id: true,
      name: true,
      organizer: true,
      date: true,
      location: true,
      discipline: true,
      published: true,
      timezone: true,
      entriesOpenAt: true,
      entriesCloseAt: true,
      resultsOfficialAt: true,
      resultsOfficialManuallySetAt: true,
      externalSource: true,
      externalEventId: true,
    },
  });

  return Promise.all(
    events.map(async (event) => {
      const statusSummary = await getEventStatusSummary(prisma as AppPrismaClient, event);

      return {
        id: event.id,
        name: event.name,
        organizer: event.organizer,
        date: formatUtcDateTimeRfc3339(event.date) ?? event.date,
        location: event.location,
        relay: isRelayDiscipline(event.discipline),
        published: event.published,
        statusSummary: {
          primary: statusSummary.primary,
        },
      };
    }),
  );
}
