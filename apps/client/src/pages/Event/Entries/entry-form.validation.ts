import {
  checkClassEligibility,
  registrationPattern,
  resolveEntryBirthYear,
  type EntryAvailabilityClass,
} from '@repo/shared';

/** Raw string-based values coming from the entry dialog form. */
export interface EntryFormValues {
  firstname: string;
  lastname: string;
  registration: string;
  birthYear: string;
  organisation: string;
  license: string;
  note: string;
  card: string;
  cardRental: boolean;
  startTime: string;
}

export const EMPTY_ENTRY_FORM_VALUES: EntryFormValues = {
  firstname: '',
  lastname: '',
  registration: '',
  birthYear: '',
  organisation: '',
  license: '',
  note: '',
  card: '',
  cardRental: false,
  startTime: '',
};

/**
 * Error codes are mapped to i18n messages inside the dialog component so the
 * validation itself stays UI- and language-independent.
 */
export type EntryFormErrorCode =
  | 'FIRSTNAME_REQUIRED'
  | 'LASTNAME_REQUIRED'
  | 'REGISTRATION_OR_BIRTH_YEAR_REQUIRED'
  | 'REGISTRATION_INVALID'
  | 'BIRTH_YEAR_INVALID'
  | 'BIRTH_YEAR_NOT_ELIGIBLE'
  | 'CARD_OR_RENTAL_REQUIRED'
  | 'CARD_INVALID'
  | 'START_TIME_REQUIRED';

export type EntryFormErrors = Partial<
  Record<keyof EntryFormValues, EntryFormErrorCode>
>;

export interface ValidateEntryFormOptions {
  /** Year used to derive birth years from registrations and age limits. */
  referenceYear: number;
}

function parseBirthYearInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d{4}$/.test(trimmed)) return Number.NaN;
  return Number.parseInt(trimmed, 10);
}

/**
 * Validate the entry dialog values against the selected class. Pure and
 * synchronous so it can be unit-tested without rendering the form.
 */
export function validateEntryForm(
  values: EntryFormValues,
  entryClass: Pick<
    EntryAvailabilityClass,
    'birthYearFrom' | 'birthYearTo' | 'startMode' | 'slots'
  > & {
    ageFrom?: number | null;
    ageTo?: number | null;
  },
  options: ValidateEntryFormOptions
): EntryFormErrors {
  const errors: EntryFormErrors = {};

  if (!values.firstname.trim()) {
    errors.firstname = 'FIRSTNAME_REQUIRED';
  }
  if (!values.lastname.trim()) {
    errors.lastname = 'LASTNAME_REQUIRED';
  }

  const registration = values.registration.trim().toUpperCase();
  const birthYearInput = parseBirthYearInput(values.birthYear);

  if (!registration && values.birthYear.trim() === '') {
    errors.registration = 'REGISTRATION_OR_BIRTH_YEAR_REQUIRED';
  }
  if (registration && !registrationPattern.test(registration)) {
    errors.registration = 'REGISTRATION_INVALID';
  }
  if (Number.isNaN(birthYearInput)) {
    errors.birthYear = 'BIRTH_YEAR_INVALID';
  }

  // Age eligibility once we have a usable birth year source.
  if (!errors.registration && !errors.birthYear) {
    const birthYear = resolveEntryBirthYear(
      {
        birthYear: birthYearInput,
        registration: registration || null,
      },
      options.referenceYear
    );
    const eligibility = checkClassEligibility(birthYear, {
      birthYearFrom: entryClass.birthYearFrom,
      birthYearTo: entryClass.birthYearTo,
      ageFrom: entryClass.ageFrom,
      ageTo: entryClass.ageTo,
      referenceYear: options.referenceYear,
    });
    if (!eligibility.eligible) {
      errors.birthYear = 'BIRTH_YEAR_NOT_ELIGIBLE';
    }
  }

  const card = values.card.trim();
  if (!card && !values.cardRental) {
    errors.card = 'CARD_OR_RENTAL_REQUIRED';
  }
  if (card && !/^\d{1,9}$/.test(card)) {
    errors.card = 'CARD_INVALID';
  }

  if (entryClass.startMode !== 'FreeStart' && !values.startTime) {
    errors.startTime = 'START_TIME_REQUIRED';
  }

  return errors;
}

/** Resolve the effective birth year shown to the user (or sent to the cart). */
export function resolveFormBirthYear(
  values: Pick<EntryFormValues, 'registration' | 'birthYear'>,
  referenceYear: number
): number | null {
  const birthYearInput = parseBirthYearInput(values.birthYear);
  return resolveEntryBirthYear(
    {
      birthYear: Number.isNaN(birthYearInput) ? null : birthYearInput,
      registration: values.registration.trim().toUpperCase() || null,
    },
    referenceYear
  );
}
