import { describe, expect, it } from 'vitest';
import {
  applyRegistrationFeeDiscount,
  matchesRegistrationPattern,
  registrationFeeDiscountsSchema,
} from '@repo/shared';

describe('registration fee discounts', () => {
  it.each([
    ['CHC9501', 'CHC*', true],
    [' chc9501 ', 'chc*', true],
    ['XCHC9501', 'CHC*', false],
    ['CHX9501', 'CHC*', false],
    ['CHC9501', 'CHC????', true],
    ['CHC95011', 'CHC????', false],
    ['CHC9501', 'CHC9501', true],
    ['CHC95011', 'CHC9501', false],
    ['', '*', false],
    ['   ', '*', false],
  ])('matches %s against %s = %s', (registration, pattern, expected) => {
    expect(matchesRegistrationPattern(registration, pattern)).toBe(expected);
  });

  it('uses the highest matching percentage without stacking and rounds cents', () => {
    const rules = [
      { pattern: 'CHC*', discountPercent: 25 },
      { pattern: '*9501', discountPercent: 50 },
    ];
    expect(applyRegistrationFeeDiscount(99.99, 'CHC9501', rules)).toBe(50);
    expect(applyRegistrationFeeDiscount(99.99, 'ABC9501', rules)).toBe(50);
    expect(applyRegistrationFeeDiscount(99.99, 'ABC9502', rules)).toBe(99.99);
    expect(applyRegistrationFeeDiscount(99.99, null, rules)).toBe(99.99);
    expect(
      applyRegistrationFeeDiscount(99.99, 'CHC9501', [{ pattern: 'CHC*', discountPercent: 100 }]),
    ).toBe(0);
  });

  it.each([
    [{ pattern: '', discountPercent: 50 }],
    [{ pattern: '^CHC.*$', discountPercent: 50 }],
    [{ pattern: 'CHC*', discountPercent: -1 }],
    [{ pattern: 'CHC*', discountPercent: 101 }],
    [{ pattern: 'CHC*', discountPercent: 12.345 }],
    [{ pattern: 'CHC*', discountPercent: NaN }],
    [{ pattern: 'a'.repeat(101), discountPercent: 50 }],
    Array.from({ length: 31 }, () => ({ pattern: '*', discountPercent: 50 })),
  ])('rejects invalid configuration %j', (...rules) => {
    expect(registrationFeeDiscountsSchema.safeParse(rules).success).toBe(false);
  });
});
