import { describe, expect, it } from 'vitest';

import {
  checkClassEligibility,
  parseBirthYearFromRegistration,
  parseSexFromRegistration,
  resolveEntryBirthYear,
  resolveTwoDigitYear,
} from '@repo/shared';

const REFERENCE_YEAR = 2026;

describe('parseBirthYearFromRegistration', () => {
  it('derives a 20th-century birth year (CHC9501 -> 1995)', () => {
    expect(parseBirthYearFromRegistration('CHC9501', REFERENCE_YEAR)).toBe(1995);
  });

  it('derives a 21st-century birth year (CHC0101 -> 2001)', () => {
    expect(parseBirthYearFromRegistration('CHC0101', REFERENCE_YEAR)).toBe(2001);
  });

  it('treats the reference year itself as current century (CHC2601 -> 2026)', () => {
    expect(parseBirthYearFromRegistration('CHC2601', REFERENCE_YEAR)).toBe(2026);
  });

  it('treats one past the reference year as previous century (CHC2701 -> 1927)', () => {
    expect(parseBirthYearFromRegistration('CHC2701', REFERENCE_YEAR)).toBe(1927);
  });

  it('accepts lowercase and surrounding whitespace', () => {
    expect(parseBirthYearFromRegistration(' chc9501 ', REFERENCE_YEAR)).toBe(1995);
  });

  it.each(['CH9501', 'CHCX501', 'CHC950', 'CHC95011', '9501CHC', ''])(
    'returns null for malformed registration %j',
    (registration) => {
      expect(parseBirthYearFromRegistration(registration, REFERENCE_YEAR)).toBeNull();
    },
  );
});

describe('resolveTwoDigitYear', () => {
  it('matches parseBirthYearFromRegistration century resolution', () => {
    expect(resolveTwoDigitYear(95, REFERENCE_YEAR)).toBe(1995);
    expect(resolveTwoDigitYear(1, REFERENCE_YEAR)).toBe(2001);
    expect(resolveTwoDigitYear(26, REFERENCE_YEAR)).toBe(2026);
    expect(resolveTwoDigitYear(27, REFERENCE_YEAR)).toBe(1927);
  });
});

describe('parseSexFromRegistration', () => {
  it('derives male for sequence 01-50 (CHC9501 -> M)', () => {
    expect(parseSexFromRegistration('CHC9501')).toBe('M');
  });

  it('derives female for sequence 51-99 (CHC9551 -> F)', () => {
    expect(parseSexFromRegistration('CHC9551')).toBe('F');
  });

  it('treats the boundary values correctly (50 -> M, 51 -> F)', () => {
    expect(parseSexFromRegistration('CHC9550')).toBe('M');
    expect(parseSexFromRegistration('CHC9551')).toBe('F');
  });

  it('treats sequence 99 as female and 00 as unknown', () => {
    expect(parseSexFromRegistration('CHC9599')).toBe('F');
    expect(parseSexFromRegistration('CHC9500')).toBeNull();
  });

  it('accepts lowercase and surrounding whitespace', () => {
    expect(parseSexFromRegistration(' chc9501 ')).toBe('M');
  });

  it.each(['CH9501', 'CHCX501', 'CHC950', 'CHC95011', ''])(
    'returns null for malformed registration %j',
    (registration) => {
      expect(parseSexFromRegistration(registration)).toBeNull();
    },
  );
});

describe('resolveEntryBirthYear', () => {
  it('prefers the explicit birth year over the registration', () => {
    expect(
      resolveEntryBirthYear({ birthYear: 1990, registration: 'CHC9501' }, REFERENCE_YEAR),
    ).toBe(1990);
  });

  it('falls back to the registration when birth year is missing', () => {
    expect(resolveEntryBirthYear({ registration: 'CHC9501' }, REFERENCE_YEAR)).toBe(1995);
  });

  it('returns null when neither source is usable', () => {
    expect(resolveEntryBirthYear({}, REFERENCE_YEAR)).toBeNull();
    expect(resolveEntryBirthYear({ registration: 'bad' }, REFERENCE_YEAR)).toBeNull();
  });
});

describe('checkClassEligibility', () => {
  it('always passes for unrestricted classes, even without a birth year', () => {
    expect(checkClassEligibility(null, {})).toEqual({ eligible: true });
    expect(checkClassEligibility(1990, { birthYearFrom: null, birthYearTo: null })).toEqual({
      eligible: true,
    });
  });

  it('fails with UNKNOWN_BIRTH_YEAR when the class is restricted and no year is known', () => {
    expect(checkClassEligibility(null, { birthYearFrom: 2006 })).toEqual({
      eligible: false,
      reason: 'UNKNOWN_BIRTH_YEAR',
    });
  });

  it('fails with TOO_OLD below birthYearFrom', () => {
    expect(checkClassEligibility(2005, { birthYearFrom: 2006, birthYearTo: 2012 })).toEqual({
      eligible: false,
      reason: 'TOO_OLD',
    });
  });

  it('fails with TOO_YOUNG above birthYearTo', () => {
    expect(checkClassEligibility(2013, { birthYearFrom: 2006, birthYearTo: 2012 })).toEqual({
      eligible: false,
      reason: 'TOO_YOUNG',
    });
  });

  it('passes on inclusive boundaries', () => {
    expect(checkClassEligibility(2006, { birthYearFrom: 2006, birthYearTo: 2012 })).toEqual({
      eligible: true,
    });
    expect(checkClassEligibility(2012, { birthYearFrom: 2006, birthYearTo: 2012 })).toEqual({
      eligible: true,
    });
  });

  it('supports one-sided limits', () => {
    expect(checkClassEligibility(1980, { birthYearTo: 2008 })).toEqual({ eligible: true });
    expect(checkClassEligibility(2010, { birthYearTo: 2008 })).toEqual({
      eligible: false,
      reason: 'TOO_YOUNG',
    });
    expect(checkClassEligibility(2010, { birthYearFrom: 2006 })).toEqual({ eligible: true });
  });

  it('supports inclusive ageFrom and ageTo limits', () => {
    expect(
      checkClassEligibility(2006, {
        ageFrom: 14,
        ageTo: 20,
        referenceYear: REFERENCE_YEAR,
      }),
    ).toEqual({ eligible: true });
    expect(
      checkClassEligibility(2012, {
        ageFrom: 14,
        ageTo: 20,
        referenceYear: REFERENCE_YEAR,
      }),
    ).toEqual({ eligible: true });
    expect(
      checkClassEligibility(2005, {
        ageFrom: 14,
        ageTo: 20,
        referenceYear: REFERENCE_YEAR,
      }),
    ).toEqual({ eligible: false, reason: 'TOO_OLD' });
    expect(
      checkClassEligibility(2013, {
        ageFrom: 14,
        ageTo: 20,
        referenceYear: REFERENCE_YEAR,
      }),
    ).toEqual({ eligible: false, reason: 'TOO_YOUNG' });
  });
});
