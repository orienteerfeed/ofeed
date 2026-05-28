import { UserCardType, UserRole } from '../../generated/prisma/enums.js';
import { builder } from '../../graphql/builder.js';

export const UserRoleRef = builder.enumType(UserRole, {
  name: 'UserRole',
});

export const UserCardTypeRef = builder.enumType(UserCardType, {
  name: 'UserCardType',
});

export const UserRef = builder.prismaObject('User', {
  fields: (t) => ({
    id: t.exposeInt('id'),
    email: t.field({
      type: 'email_String_NotNull_maxLength_255_format_email',
      resolve: (user) => user.email,
    }),
    firstname: t.field({
      type: 'firstname_String_NotNull_maxLength_255',
      resolve: (user) => user.firstname,
    }),
    lastname: t.field({
      type: 'lastname_String_NotNull_maxLength_255',
      resolve: (user) => user.lastname,
    }),
    role: t.field({
      type: UserRoleRef,
      resolve: (user) => user.role,
    }),
    organisation: t.field({
      type: 'organisation_String_maxLength_191',
      nullable: true,
      resolve: (user) => user.organisation,
    }),
    emergencyContact: t.field({
      type: 'emergencyContact_String_maxLength_255',
      nullable: true,
      resolve: (user) => user.emergencyContact,
    }),
    password: t.field({
      type: 'password_String_NotNull_maxLength_255',
      resolve: (user) => user.password,
    }),
    active: t.exposeBoolean('active', { nullable: true }),
    emailVerifiedAt: t.expose('emailVerifiedAt', { type: 'DateTime', nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
  }),
});

export const UserCardRef = builder.prismaObject('UserCard', {
  fields: (t) => ({
    id: t.exposeInt('id'),
    userId: t.exposeInt('userId'),
    sportId: t.exposeInt('sportId'),
    sport: t.relation('sport'),
    type: t.field({
      type: UserCardTypeRef,
      resolve: (userCard) => userCard.type,
    }),
    cardNumber: t.exposeString('cardNumber'),
    isDefault: t.exposeBoolean('isDefault'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
  }),
});
