import type { outputShapeKey } from '@pothos/core';

import { builder } from '../../graphql/builder.js';
import { rethrowAuthzOrError } from '../../graphql/errors.js';
import { EventRef } from '../event/event.graphql-types.js';
import { ResponseMessageRef } from '../graphql/graphql.graphql-types.js';

import {
  verifyUserEmail,
  resendUserEmailVerification,
  anonymizeCurrentUserAccount,
  changeCurrentUserPassword,
  createAuthenticatedUserCard,
  deleteAuthenticatedUserCard,
  findCurrentUser,
  findCurrentUserCards,
  findMyEvents,
  requestUserPasswordReset,
  resetUserPassword,
  setDefaultAuthenticatedUserCard,
  signIn,
  signUp,
  updateAuthenticatedUser,
  updateAuthenticatedUserCard,
} from './user.service.js';
import { UserCardRef, UserCardTypeRef, UserRef } from './user.graphql-types.js';
import {
  changeCurrentUserPasswordInputSchema,
  createUserCardInputSchema,
  deleteCurrentAccountInputSchema,
  loginInputSchema,
  updateCurrentUserInputSchema,
  updateUserCardInputSchema,
  userInputSchema,
} from './user.schema.js';

async function requireUser<T>(user: Promise<T | null>): Promise<T> {
  const result = await user;
  if (!result) {
    throw new Error('Current user not found');
  }
  return result;
}

type OutputShapeOf<Ref> = Ref extends { [outputShapeKey]: infer Shape } ? Shape : never;
type UserGraphQLShape = OutputShapeOf<typeof UserRef>;

const AuthPayloadRef = builder
  .objectRef<{
    token?: string | null;
    user?: unknown;
  }>('AuthPayload')
  .implement({
    fields: (t) => ({
      token: t.exposeString('token', { nullable: true }),
      user: t.field({
        type: UserRef,
        nullable: true,
        resolve: (payload) => (payload.user ? (payload.user as UserGraphQLShape) : null),
      }),
    }),
  });

const ResetResponseRef = builder
  .objectRef<{
    success: boolean;
    message?: string | null;
  }>('ResetResponse')
  .implement({
    fields: (t) => ({
      success: t.exposeBoolean('success'),
      message: t.exposeString('message', { nullable: true }),
    }),
  });

const LoginInputRef = builder.inputType('LoginInput', {
  fields: (t) => ({
    username: t.field({
      type: 'username_String_NotNull_maxLength_255',
      required: true,
    }),
    password: t.field({
      type: 'password_String_NotNull_maxLength_255',
      required: true,
    }),
  }),
});

const UserInputRef = builder.inputType('UserInput', {
  fields: (t) => ({
    email: t.field({
      type: 'email_String_NotNull_maxLength_255_format_email',
      required: true,
    }),
    password: t.field({
      type: 'password_String_NotNull_maxLength_255',
      required: true,
    }),
    firstname: t.field({
      type: 'firstname_String_NotNull_maxLength_255',
      required: true,
    }),
    lastname: t.field({
      type: 'lastname_String_NotNull_maxLength_255',
      required: true,
    }),
    organisation: t.field({
      type: 'organisation_String_maxLength_191',
    }),
  }),
});

const UpdateCurrentUserInputRef = builder.inputType('UpdateCurrentUserInput', {
  fields: (t) => ({
    email: t.field({
      type: 'email_String_maxLength_255_format_email',
    }),
    firstname: t.field({
      type: 'firstname_String_minLength_1_maxLength_255',
    }),
    lastname: t.field({
      type: 'lastname_String_minLength_1_maxLength_255',
    }),
    organisation: t.field({
      type: 'organisation_String_maxLength_191',
    }),
    emergencyContact: t.field({
      type: 'emergencyContact_String_maxLength_255',
    }),
  }),
});

const CreateUserCardInputRef = builder.inputType('CreateUserCardInput', {
  fields: (t) => ({
    sportId: t.int({ required: true }),
    type: t.field({
      type: UserCardTypeRef,
      required: true,
    }),
    cardNumber: t.field({
      type: 'cardNumber_String_NotNull_minLength_1_maxLength_64',
      required: true,
    }),
    isDefault: t.boolean(),
  }),
});

const UpdateUserCardInputRef = builder.inputType('UpdateUserCardInput', {
  fields: (t) => ({
    id: t.int({ required: true }),
    sportId: t.int({ required: true }),
    type: t.field({
      type: UserCardTypeRef,
      required: true,
    }),
    cardNumber: t.field({
      type: 'cardNumber_String_NotNull_minLength_1_maxLength_64',
      required: true,
    }),
  }),
});

const ChangeCurrentUserPasswordInputRef = builder.inputType('ChangeCurrentUserPasswordInput', {
  fields: (t) => ({
    currentPassword: t.field({
      type: 'currentPassword_String_NotNull_minLength_1_maxLength_255',
      required: true,
    }),
    newPassword: t.field({
      type: 'newPassword_String_NotNull_minLength_8_maxLength_255',
      required: true,
    }),
  }),
});

builder.queryFields((t) => ({
  currentUser: t.prismaField({
    type: UserRef,
    resolve: async (query, _root, _args, context) => {
      try {
        return await requireUser(findCurrentUser(context.prisma, context.auth, query));
      } catch (err) {
        return rethrowAuthzOrError(err, 'Failed to fetch current user');
      }
    },
  }),
  myEvents: t.prismaField({
    type: [EventRef],
    nullable: { list: true, items: false },
    resolve: async (query, _root, _args, context) => {
      try {
        return await findMyEvents(context.prisma, context.auth, query);
      } catch (err) {
        rethrowAuthzOrError(err, 'Failed to fetch my events');
      }
    },
  }),
  currentUserCards: t.prismaField({
    type: [UserCardRef],
    resolve: async (query, _root, _args, context) => {
      try {
        return await findCurrentUserCards(context.prisma, context.auth, query);
      } catch (err) {
        return rethrowAuthzOrError(err, 'Failed to fetch current user cards');
      }
    },
  }),
}));

builder.mutationFields((t) => ({
  signin: t.field({
    type: AuthPayloadRef,
    nullable: true,
    args: {
      input: t.arg({ type: LoginInputRef }),
    },
    resolve: (_root, args) => signIn(loginInputSchema.parse(args.input)),
  }),
  signup: t.field({
    type: ResponseMessageRef,
    nullable: true,
    args: {
      input: t.arg({ type: UserInputRef }),
    },
    resolve: (_root, args, context) =>
      signUp(userInputSchema.parse(args.input), context.activationUrl),
  }),
  verifyEmail: t.field({
    type: AuthPayloadRef,
    args: {
      token: t.arg.string({ required: true }),
    },
    resolve: (_root, args) => verifyUserEmail(args.token as string),
  }),
  resendEmailVerification: t.field({
    type: ResetResponseRef,
    resolve: (_root, _args, context) =>
      resendUserEmailVerification(context.auth).catch((err: unknown) =>
        rethrowAuthzOrError(err, 'Failed to resend email verification'),
      ),
  }),
  updateCurrentUser: t.field({
    type: UserRef,
    args: {
      input: t.arg({ type: UpdateCurrentUserInputRef, required: true }),
    },
    resolve: (_root, args, context) =>
      updateAuthenticatedUser(
        context.prisma,
        context.auth,
        updateCurrentUserInputSchema.parse(args.input),
      ).catch((err: unknown) => rethrowAuthzOrError(err, 'Failed to update current user')),
  }),
  createUserCard: t.field({
    type: UserCardRef,
    args: {
      input: t.arg({ type: CreateUserCardInputRef, required: true }),
    },
    resolve: (_root, args, context) =>
      createAuthenticatedUserCard(
        context.prisma,
        context.auth,
        createUserCardInputSchema.parse(args.input),
      ).catch((err: unknown) => rethrowAuthzOrError(err, 'Failed to create user card')),
  }),
  updateUserCard: t.field({
    type: UserCardRef,
    args: {
      input: t.arg({ type: UpdateUserCardInputRef, required: true }),
    },
    resolve: (_root, args, context) =>
      updateAuthenticatedUserCard(
        context.prisma,
        context.auth,
        updateUserCardInputSchema.parse(args.input),
      ).catch((err: unknown) => rethrowAuthzOrError(err, 'Failed to update user card')),
  }),
  deleteUserCard: t.boolean({
    args: {
      id: t.arg.int({ required: true }),
    },
    resolve: (_root, args, context) =>
      deleteAuthenticatedUserCard(context.prisma, context.auth, args.id).catch((err: unknown) =>
        rethrowAuthzOrError(err, 'Failed to delete user card'),
      ),
  }),
  setDefaultUserCard: t.field({
    type: UserCardRef,
    args: {
      id: t.arg.int({ required: true }),
    },
    resolve: (_root, args, context) =>
      setDefaultAuthenticatedUserCard(context.prisma, context.auth, args.id).catch(
        (err: unknown) => rethrowAuthzOrError(err, 'Failed to set default user card'),
      ),
  }),
  requestPasswordReset: t.field({
    type: ResetResponseRef,
    args: {
      email: t.arg.string({ required: true }),
    },
    resolve: (_root, args, context) =>
      requestUserPasswordReset(args.email as string, context.resetPasswordUrl),
  }),
  resetPassword: t.field({
    type: AuthPayloadRef,
    args: {
      token: t.arg.string({ required: true }),
      newPassword: t.arg.string({ required: true }),
    },
    resolve: (_root, args) => resetUserPassword(args.token as string, args.newPassword as string),
  }),
  changeCurrentUserPassword: t.field({
    type: ResetResponseRef,
    args: {
      input: t.arg({ type: ChangeCurrentUserPasswordInputRef, required: true }),
    },
    resolve: (_root, args, context) =>
      changeCurrentUserPassword(
        context.auth,
        changeCurrentUserPasswordInputSchema.parse(args.input),
      ).catch((err: unknown) =>
        rethrowAuthzOrError(err, 'Failed to change current user password'),
      ),
  }),
  deleteCurrentAccount: t.boolean({
    args: {
      currentPassword: t.arg.string({ required: true }),
      deleteEvents: t.arg.boolean(),
    },
    resolve: (_root, args, context) =>
      anonymizeCurrentUserAccount(
        context.auth,
        deleteCurrentAccountInputSchema.parse({
          currentPassword: args.currentPassword,
          deleteEvents: args.deleteEvents ?? false,
        }),
      ).catch((err: unknown) => rethrowAuthzOrError(err, 'Failed to delete account')),
  }),
}));
