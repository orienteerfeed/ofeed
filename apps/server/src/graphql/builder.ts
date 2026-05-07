import SchemaBuilder from '@pothos/core';
import PrismaPlugin from '@pothos/plugin-prisma';

import type PrismaTypes from '../generated/pothos-prisma-types.js';
import { getDatamodel } from '../generated/pothos-prisma-types.js';
import prisma from '../utils/context.js';
import type { GraphQLContext } from './context.types.js';

type StringConstraintScalar = {
  Input: string;
  Output: string;
};

const nonStrictPothosOption = {
  notStrict: 'Pothos may not work correctly when strict mode is not enabled in tsconfig.json',
} as const;

export const builder = new SchemaBuilder<{
  Context: GraphQLContext;
  DefaultFieldNullability: false;
  PrismaTypes: PrismaTypes;
  Scalars: {
    Date: {
      Input: Date;
      Output: Date;
    };
    DateTime: {
      Input: Date;
      Output: Date;
    };
    cardNumber_String_NotNull_minLength_1_maxLength_64: StringConstraintScalar;
    currentPassword_String_NotNull_minLength_1_maxLength_255: StringConstraintScalar;
    email_String_NotNull_maxLength_255_format_email: StringConstraintScalar;
    email_String_maxLength_255_format_email: StringConstraintScalar;
    emergencyContact_String_maxLength_255: StringConstraintScalar;
    firstname_String_NotNull_maxLength_255: StringConstraintScalar;
    firstname_String_minLength_1_maxLength_255: StringConstraintScalar;
    lastname_String_NotNull_maxLength_255: StringConstraintScalar;
    lastname_String_minLength_1_maxLength_255: StringConstraintScalar;
    newPassword_String_NotNull_minLength_8_maxLength_255: StringConstraintScalar;
    organisation_String_maxLength_191: StringConstraintScalar;
    origin_String_NotNull_maxLength_32_pattern_START: StringConstraintScalar;
    origin_String_NotNull_maxLength_32_pattern_STARTFINISHITOFFICE: StringConstraintScalar;
    password_String_NotNull_maxLength_255: StringConstraintScalar;
    status_String_NotNull_maxLength_32_pattern_ActiveInactiveDidNotStartLateStart: StringConstraintScalar;
    username_String_NotNull_maxLength_255: StringConstraintScalar;
  };
}>({
  plugins: [PrismaPlugin],
  defaultFieldNullability: false,
  ...nonStrictPothosOption,
  prisma: {
    client: prisma,
    dmmf: getDatamodel(),
    onUnusedQuery: process.env.NODE_ENV === 'production' ? null : 'warn',
  },
});

builder.queryType({
  fields: (t) => ({
    _empty: t.string({
      nullable: true,
      resolve: (): null => null,
    }),
  }),
});

builder.mutationType({
  fields: (t) => ({
    _empty: t.string({
      args: {
        nothing: t.arg.string(),
      },
      nullable: true,
      resolve: (): null => null,
    }),
  }),
});

builder.subscriptionType({
  fields: (t) => ({
    _empty: t.string({
      args: {
        nothing: t.arg.string(),
      },
      nullable: true,
      subscribe: async function* () {
        return;
      },
      resolve: (): null => null,
    }),
  }),
});
