import { GraphQLScalarType, Kind } from 'graphql';

import { builder } from '../builder.js';

type StringConstraint = {
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  email?: boolean;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateStringScalar(name: string, value: unknown, constraint: StringConstraint) {
  if (typeof value !== 'string') {
    throw new TypeError(`${name} cannot represent non-string value`);
  }

  if (constraint.minLength !== undefined && value.length < constraint.minLength) {
    throw new TypeError(`${name} must be at least ${constraint.minLength} characters long`);
  }

  if (constraint.maxLength !== undefined && value.length > constraint.maxLength) {
    throw new TypeError(`${name} must be at most ${constraint.maxLength} characters long`);
  }

  if (constraint.email && !EMAIL_PATTERN.test(value)) {
    throw new TypeError(`${name} must be a valid email address`);
  }

  if (constraint.pattern && !constraint.pattern.test(value)) {
    throw new TypeError(`${name} does not match the required pattern`);
  }

  return value;
}

function createStringConstraintScalar(name: string, constraint: StringConstraint) {
  return new GraphQLScalarType({
    name,
    serialize: (value) => validateStringScalar(name, value, constraint),
    parseValue: (value) => validateStringScalar(name, value, constraint),
    parseLiteral: (ast) => {
      if (ast.kind !== Kind.STRING) {
        throw new TypeError(`${name} cannot represent non-string value`);
      }

      return validateStringScalar(name, ast.value, constraint);
    },
  });
}

const constraintScalars = [
  createStringConstraintScalar('cardNumber_String_NotNull_minLength_1_maxLength_64', {
    minLength: 1,
    maxLength: 64,
  }),
  createStringConstraintScalar('currentPassword_String_NotNull_minLength_1_maxLength_255', {
    minLength: 1,
    maxLength: 255,
  }),
  createStringConstraintScalar('email_String_NotNull_maxLength_255_format_email', {
    maxLength: 255,
    email: true,
  }),
  createStringConstraintScalar('email_String_maxLength_255_format_email', {
    maxLength: 255,
    email: true,
  }),
  createStringConstraintScalar('emergencyContact_String_maxLength_255', {
    maxLength: 255,
  }),
  createStringConstraintScalar('firstname_String_NotNull_maxLength_255', {
    maxLength: 255,
  }),
  createStringConstraintScalar('firstname_String_minLength_1_maxLength_255', {
    minLength: 1,
    maxLength: 255,
  }),
  createStringConstraintScalar('lastname_String_NotNull_maxLength_255', {
    maxLength: 255,
  }),
  createStringConstraintScalar('lastname_String_minLength_1_maxLength_255', {
    minLength: 1,
    maxLength: 255,
  }),
  createStringConstraintScalar('newPassword_String_NotNull_minLength_8_maxLength_255', {
    minLength: 8,
    maxLength: 255,
  }),
  createStringConstraintScalar('organisation_String_maxLength_191', {
    maxLength: 191,
  }),
  createStringConstraintScalar('origin_String_NotNull_maxLength_32_pattern_START', {
    maxLength: 32,
    pattern: /^START$/,
  }),
  createStringConstraintScalar('origin_String_NotNull_maxLength_32_pattern_STARTFINISHITOFFICE', {
    maxLength: 32,
    pattern: /^(START|FINISH|IT|OFFICE)$/,
  }),
  createStringConstraintScalar('password_String_NotNull_maxLength_255', {
    maxLength: 255,
  }),
  createStringConstraintScalar('status_String_NotNull_maxLength_32_pattern_ActiveInactiveDidNotStartLateStart', {
    maxLength: 32,
    pattern: /^(Active|Inactive|DidNotStart|LateStart)$/,
  }),
  createStringConstraintScalar('username_String_NotNull_maxLength_255', {
    maxLength: 255,
  }),
];

for (const scalar of constraintScalars) {
  builder.addScalarType(scalar.name as never, scalar);
}
