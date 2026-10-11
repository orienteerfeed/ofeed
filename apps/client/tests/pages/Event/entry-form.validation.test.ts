import { describe, expect, it } from 'vitest';

import {
  EMPTY_ENTRY_FORM_VALUES,
  resolveFormBirthYear,
  validateEntryForm,
  type EntryFormValues,
} from '@/pages/Event/Entries/entry-form.validation';

const REFERENCE_YEAR = 2026;

const OPEN_CLASS = {
  birthYearFrom: null,
  birthYearTo: null,
  startMode: 'FreeStart',
  slots: [],
};

const YOUTH_CLASS = {
  // e.g. H14: born 2012 or later up to 2014
  birthYearFrom: 2012,
  birthYearTo: 2014,
  startMode: 'FreeStart',
  slots: [],
};

const AGE_RESTRICTED_CLASS = {
  birthYearFrom: null,
  birthYearTo: null,
  ageFrom: 14,
  ageTo: 20,
  startMode: 'FreeStart',
  slots: [],
};

const START_LIST_CLASS = {
  birthYearFrom: null,
  birthYearTo: null,
  startMode: 'StartList',
  slots: [{ id: 1, startTime: '2026-07-10T08:00:00.000Z', bibNumber: null }],
};

function values(overrides: Partial<EntryFormValues>): EntryFormValues {
  return {
    ...EMPTY_ENTRY_FORM_VALUES,
    firstname: 'Jan',
    lastname: 'Novak',
    registration: 'CHC9501',
    card: '8123456',
    ...overrides,
  };
}

describe('validateEntryForm', () => {
  it('passes for a complete FreeStart entry', () => {
    expect(
      validateEntryForm(values({}), OPEN_CLASS, {
        referenceYear: REFERENCE_YEAR,
      })
    ).toEqual({});
  });

  it('requires first and last name', () => {
    const errors = validateEntryForm(
      values({ firstname: ' ', lastname: '' }),
      OPEN_CLASS,
      { referenceYear: REFERENCE_YEAR }
    );
    expect(errors.firstname).toBe('FIRSTNAME_REQUIRED');
    expect(errors.lastname).toBe('LASTNAME_REQUIRED');
  });

  it('requires registration or birth year', () => {
    const errors = validateEntryForm(
      values({ registration: '', birthYear: '' }),
      OPEN_CLASS,
      { referenceYear: REFERENCE_YEAR }
    );
    expect(errors.registration).toBe('REGISTRATION_OR_BIRTH_YEAR_REQUIRED');
  });

  it('accepts a birth year without registration', () => {
    const errors = validateEntryForm(
      values({ registration: '', birthYear: '1995' }),
      OPEN_CLASS,
      { referenceYear: REFERENCE_YEAR }
    );
    expect(errors).toEqual({});
  });

  it('rejects a malformed registration', () => {
    const errors = validateEntryForm(
      values({ registration: 'XX99' }),
      OPEN_CLASS,
      { referenceYear: REFERENCE_YEAR }
    );
    expect(errors.registration).toBe('REGISTRATION_INVALID');
  });

  it('rejects a non-numeric birth year', () => {
    const errors = validateEntryForm(
      values({ birthYear: '19xx' }),
      OPEN_CLASS,
      { referenceYear: REFERENCE_YEAR }
    );
    expect(errors.birthYear).toBe('BIRTH_YEAR_INVALID');
  });

  it('rejects a registration-derived birth year outside the class range', () => {
    // CHC9501 -> 1995, youth class allows 2012–2014.
    const errors = validateEntryForm(values({}), YOUTH_CLASS, {
      referenceYear: REFERENCE_YEAR,
    });
    expect(errors.birthYear).toBe('BIRTH_YEAR_NOT_ELIGIBLE');
  });

  it('accepts an explicit birth year inside the class range', () => {
    const errors = validateEntryForm(
      values({ registration: '', birthYear: '2013' }),
      YOUTH_CLASS,
      { referenceYear: REFERENCE_YEAR }
    );
    expect(errors).toEqual({});
  });

  it('prefers the explicit birth year over the registration for eligibility', () => {
    const errors = validateEntryForm(
      values({ registration: 'CHC9501', birthYear: '2013' }),
      YOUTH_CLASS,
      { referenceYear: REFERENCE_YEAR }
    );
    expect(errors).toEqual({});
  });

  it('rejects a registration-derived birth year outside class age limits', () => {
    const errors = validateEntryForm(values({}), AGE_RESTRICTED_CLASS, {
      referenceYear: REFERENCE_YEAR,
    });
    expect(errors.birthYear).toBe('BIRTH_YEAR_NOT_ELIGIBLE');
  });

  it('accepts an explicit birth year inside class age limits', () => {
    const errors = validateEntryForm(
      values({ registration: '', birthYear: '2010' }),
      AGE_RESTRICTED_CLASS,
      { referenceYear: REFERENCE_YEAR }
    );
    expect(errors).toEqual({});
  });

  it('requires a card number or chip rental', () => {
    const errors = validateEntryForm(values({ card: '' }), OPEN_CLASS, {
      referenceYear: REFERENCE_YEAR,
    });
    expect(errors.card).toBe('CARD_OR_RENTAL_REQUIRED');
  });

  it('accepts chip rental instead of a card number', () => {
    const errors = validateEntryForm(
      values({ card: '', cardRental: true }),
      OPEN_CLASS,
      { referenceYear: REFERENCE_YEAR }
    );
    expect(errors).toEqual({});
  });

  it('rejects a non-numeric card number', () => {
    const errors = validateEntryForm(values({ card: 'abc' }), OPEN_CLASS, {
      referenceYear: REFERENCE_YEAR,
    });
    expect(errors.card).toBe('CARD_INVALID');
  });

  it('requires a start time for StartList classes', () => {
    const errors = validateEntryForm(values({}), START_LIST_CLASS, {
      referenceYear: REFERENCE_YEAR,
    });
    expect(errors.startTime).toBe('START_TIME_REQUIRED');
  });

  it('accepts a selected start time for StartList classes', () => {
    const errors = validateEntryForm(
      values({ startTime: '2026-07-10T08:00:00.000Z' }),
      START_LIST_CLASS,
      { referenceYear: REFERENCE_YEAR }
    );
    expect(errors).toEqual({});
  });
});

describe('resolveFormBirthYear', () => {
  it('derives the birth year from the registration (CHC9501 -> 1995)', () => {
    expect(
      resolveFormBirthYear(
        { registration: 'chc9501', birthYear: '' },
        REFERENCE_YEAR
      )
    ).toBe(1995);
  });

  it('prefers the explicit birth year', () => {
    expect(
      resolveFormBirthYear(
        { registration: 'CHC9501', birthYear: '1990' },
        REFERENCE_YEAR
      )
    ).toBe(1990);
  });

  it('returns null when nothing usable is provided', () => {
    expect(
      resolveFormBirthYear({ registration: '', birthYear: '' }, REFERENCE_YEAR)
    ).toBeNull();
  });
});
