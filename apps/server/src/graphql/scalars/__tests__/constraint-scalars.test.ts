import { describe, expect, it } from 'vitest';

import { schema } from '../../schema.js';

type ScalarLike = {
  parseValue: (value: unknown) => unknown;
  serialize: (value: unknown) => unknown;
};

function scalar(name: string): ScalarLike {
  const type = schema.getType(name);

  if (!type || typeof type !== 'object' || !('parseValue' in type) || !('serialize' in type)) {
    throw new Error(`Scalar ${name} is not registered`);
  }

  return type as unknown as ScalarLike;
}

describe('legacy GraphQL constraint scalars', () => {
  it('validates email compatibility scalar values', () => {
    const emailScalar = scalar('email_String_NotNull_maxLength_255_format_email');

    expect(emailScalar.parseValue('runner@example.test')).toBe('runner@example.test');
    expect(() => emailScalar.parseValue('not-an-email')).toThrow(
      'email_String_NotNull_maxLength_255_format_email must be a valid email address',
    );
  });

  it('validates min and max length constraints', () => {
    const cardNumberScalar = scalar('cardNumber_String_NotNull_minLength_1_maxLength_64');
    const newPasswordScalar = scalar('newPassword_String_NotNull_minLength_8_maxLength_255');

    expect(cardNumberScalar.parseValue('123456')).toBe('123456');
    expect(() => cardNumberScalar.parseValue('')).toThrow(
      'cardNumber_String_NotNull_minLength_1_maxLength_64 must be at least 1 characters long',
    );
    expect(() => cardNumberScalar.parseValue('x'.repeat(65))).toThrow(
      'cardNumber_String_NotNull_minLength_1_maxLength_64 must be at most 64 characters long',
    );
    expect(() => newPasswordScalar.parseValue('short')).toThrow(
      'newPassword_String_NotNull_minLength_8_maxLength_255 must be at least 8 characters long',
    );
  });

  it('validates legacy pattern constraint scalar values', () => {
    const startOriginScalar = scalar('origin_String_NotNull_maxLength_32_pattern_START');
    const anyOriginScalar = scalar(
      'origin_String_NotNull_maxLength_32_pattern_STARTFINISHITOFFICE',
    );
    const statusScalar = scalar(
      'status_String_NotNull_maxLength_32_pattern_ActiveInactiveDidNotStartLateStart',
    );

    expect(startOriginScalar.serialize('START')).toBe('START');
    expect(() => startOriginScalar.serialize('FINISH')).toThrow(
      'origin_String_NotNull_maxLength_32_pattern_START does not match the required pattern',
    );
    expect(anyOriginScalar.parseValue('FINISH')).toBe('FINISH');
    expect(() => anyOriginScalar.parseValue('MAP')).toThrow(
      'origin_String_NotNull_maxLength_32_pattern_STARTFINISHITOFFICE does not match the required pattern',
    );
    expect(statusScalar.parseValue('LateStart')).toBe('LateStart');
    expect(() => statusScalar.parseValue('DNS')).toThrow(
      'status_String_NotNull_maxLength_32_pattern_ActiveInactiveDidNotStartLateStart does not match the required pattern',
    );
  });
});
