import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import {
  registrationPattern,
  type EntryAvailabilityClass,
  type EventEntryAvailability,
  type RegistrationLookupItem,
} from '@repo/shared';
import { useForm, useStore } from '@tanstack/react-form';
import { useNavigate } from '@tanstack/react-router';
import {
  AlertTriangle,
  CheckCircle2,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/atoms';
import { Field } from '@/components/organisms';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks';
import { formatTimeToHms } from '@/lib/date';
import PATHNAMES from '@/lib/paths/pathnames';
import { useAddCartItem } from '@/stores/cart';

import { formatEntryFee } from './EntryClassCard';
import {
  EMPTY_ENTRY_FORM_VALUES,
  resolveFormBirthYear,
  validateEntryForm,
  type EntryFormErrorCode,
} from './entry-form.validation';
import {
  ClubAutocomplete,
  RegistrationAutocomplete,
} from './RegistrationAutocomplete';

export const COMPETITORS_BY_CARD = gql`
  query CompetitorsByCard($eventId: String!, $card: Int!) {
    competitorsByCard(eventId: $eventId, card: $card) {
      id
      firstname
      lastname
      registration
      organisation
      card
      class {
        id
        name
      }
    }
  }
`;

export const COMPETITORS_BY_REGISTRATION = gql`
  query CompetitorsByRegistration($eventId: String!, $registration: String!) {
    competitorsByRegistration(eventId: $eventId, registration: $registration) {
      id
      firstname
      lastname
      registration
      organisation
      card
      class {
        id
        name
      }
    }
  }
`;

export const CURRENT_USER_ENTRY_PREFILL = gql`
  query CurrentUserEntryPrefill {
    currentUser {
      id
      firstname
      lastname
      organisation
    }
    currentUserCards {
      id
      sportId
      cardNumber
      type
      isDefault
    }
  }
`;

type ExistingCompetitor = {
  id: number;
  firstname: string;
  lastname: string;
  registration: string;
  organisation: string | null;
  card: number | null;
  class: {
    id: number;
    name: string;
  };
};

type CurrentUserEntryPrefillCard = {
  id: number;
  sportId: number;
  cardNumber: string;
  type: 'SPORTIDENT';
  isDefault: boolean;
};

type CurrentUserEntryPrefillData = {
  currentUser: {
    id: number;
    firstname: string;
    lastname: string;
    organisation: string | null;
  };
  currentUserCards: CurrentUserEntryPrefillCard[];
};

function formatExistingCompetitor(competitor: ExistingCompetitor) {
  const registration = competitor.registration
    ? ` (${competitor.registration})`
    : '';
  return `${competitor.firstname} ${competitor.lastname}${registration} - ${competitor.class.name}`;
}

interface AddedEntrySummary {
  name: string;
  className: string;
}

interface EntryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryClass: EntryAvailabilityClass | null;
  availability: EventEntryAvailability;
  eventId: string;
  eventName: string;
  eventSportId: number;
}

const ERROR_MESSAGE_KEYS = {
  FIRSTNAME_REQUIRED: 'Pages.Event.Entries.Form.Errors.FirstnameRequired',
  LASTNAME_REQUIRED: 'Pages.Event.Entries.Form.Errors.LastnameRequired',
  REGISTRATION_OR_BIRTH_YEAR_REQUIRED:
    'Pages.Event.Entries.Form.Errors.RegistrationOrBirthYearRequired',
  REGISTRATION_INVALID: 'Pages.Event.Entries.Form.Errors.RegistrationInvalid',
  BIRTH_YEAR_INVALID: 'Pages.Event.Entries.Form.Errors.BirthYearInvalid',
  BIRTH_YEAR_NOT_ELIGIBLE:
    'Pages.Event.Entries.Form.Errors.BirthYearNotEligible',
  CARD_OR_RENTAL_REQUIRED:
    'Pages.Event.Entries.Form.Errors.CardOrRentalRequired',
  CARD_INVALID: 'Pages.Event.Entries.Form.Errors.CardInvalid',
  START_TIME_REQUIRED: 'Pages.Event.Entries.Form.Errors.StartTimeRequired',
} as const satisfies Record<EntryFormErrorCode, string>;

export function EntryFormDialog({
  open,
  onOpenChange,
  entryClass,
  availability,
  eventId,
  eventName,
  eventSportId,
}: EntryFormDialogProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const addCartItem = useAddCartItem();
  const [addedEntry, setAddedEntry] = useState<AddedEntrySummary | null>(null);
  const [hasClearedForm, setHasClearedForm] = useState(false);
  const [matchedRegistration, setMatchedRegistration] = useState<string | null>(
    null
  );

  const referenceYear = new Date().getFullYear();
  const cardRentalAction = availability.entryActions.find(
    action => action.key === 'CARD_RENTAL'
  );
  const cardRentalEnabled = cardRentalAction?.enabled ?? false;
  const currencyCode = availability.currency.code;
  const { data: prefillData } = useQuery<CurrentUserEntryPrefillData>(
    CURRENT_USER_ENTRY_PREFILL,
    {
      skip: !isAuthenticated || !open,
      fetchPolicy: 'cache-first',
    }
  );

  const form = useForm({
    defaultValues: EMPTY_ENTRY_FORM_VALUES,
    validators: {
      onChange: ({ value }) => {
        if (!entryClass) return undefined;
        const errors = validateEntryForm(value, entryClass, { referenceYear });
        return Object.keys(errors).length > 0 ? errors : undefined;
      },
    },
    onSubmit: ({ value }) => {
      if (!entryClass) return;

      const errors = validateEntryForm(value, entryClass, { referenceYear });
      if (Object.keys(errors).length > 0) {
        return;
      }

      const registration = value.registration.trim().toUpperCase();
      const birthYear = resolveFormBirthYear(value, referenceYear);
      const name = `${value.firstname.trim()} ${value.lastname.trim()}`;

      addCartItem({
        eventId,
        eventName,
        currencyCode,
        classId: entryClass.id,
        className: entryClass.name,
        firstname: value.firstname.trim(),
        lastname: value.lastname.trim(),
        ...(registration ? { registration } : {}),
        ...(birthYear !== null ? { birthYear } : {}),
        ...(value.organisation.trim()
          ? { organisation: value.organisation.trim() }
          : {}),
        ...(value.license.trim()
          ? { license: value.license.trim().toUpperCase() }
          : {}),
        ...(value.note.trim() ? { note: value.note.trim() } : {}),
        ...(value.card.trim()
          ? { card: Number.parseInt(value.card.trim(), 10) }
          : {}),
        cardRental: value.cardRental,
        ...(value.startTime ? { startTime: value.startTime } : {}),
        fee: entryClass.fee?.amount ?? 0,
        cardRentalFee: value.cardRental
          ? (cardRentalAction?.price ?? null)
          : null,
      });

      setAddedEntry({ name, className: entryClass.name });
      form.reset();
    },
  });

  // Registration codes are unique — once one resolves, fill the sibling
  // fields the user would otherwise type by hand. Gender is intentionally
  // not applied: neither the entry form nor Competitor/EntryItem stores it.
  const handleRegistrationMatch = (item: RegistrationLookupItem) => {
    setMatchedRegistration(item.registration);
    if (item.firstname) form.setFieldValue('firstname', item.firstname);
    if (item.lastname) form.setFieldValue('lastname', item.lastname);
    if (item.organisation)
      form.setFieldValue('organisation', item.organisation);
    if (item.license) form.setFieldValue('license', item.license);
    if (item.birthYear !== null) {
      form.setFieldValue('birthYear', String(item.birthYear));
    }
    // Only present for a registration-code lookup (never for a card-number
    // lookup) — see registrationLookupItemSchema. Don't overwrite a card the
    // user already typed in by hand, and skip it entirely when chip rental
    // is checked (the card field is cleared/disabled in that case).
    if (
      item.card !== null &&
      !form.state.values.cardRental &&
      !form.state.values.card
    ) {
      form.setFieldValue('card', String(item.card));
    }
  };

  const cardRentalChecked = useStore(
    form.store,
    state => state.values.cardRental
  );
  const registrationValue = useStore(
    form.store,
    state => state.values.registration
  );
  const cardValue = useStore(form.store, state => state.values.card);
  const [debouncedRegistration, setDebouncedRegistration] = useState('');
  const [debouncedCard, setDebouncedCard] = useState('');

  useEffect(() => {
    if (
      matchedRegistration &&
      registrationValue.trim().toUpperCase() !== matchedRegistration
    ) {
      setMatchedRegistration(null);
    }
  }, [matchedRegistration, registrationValue]);

  useEffect(() => {
    if (!open || !entryClass || addedEntry || hasClearedForm) return;

    const currentUser = prefillData?.currentUser ?? user;
    if (currentUser?.firstname && !form.state.values.firstname.trim()) {
      form.setFieldValue('firstname', currentUser.firstname);
    }
    if (currentUser?.lastname && !form.state.values.lastname.trim()) {
      form.setFieldValue('lastname', currentUser.lastname);
    }
    if (currentUser?.organisation && !form.state.values.organisation.trim()) {
      form.setFieldValue('organisation', currentUser.organisation);
    }

    if (form.state.values.cardRental || form.state.values.card.trim()) {
      return;
    }

    const matchingCards = (prefillData?.currentUserCards ?? []).filter(
      card =>
        card.sportId === eventSportId &&
        card.type === 'SPORTIDENT' &&
        /^\d+$/.test(card.cardNumber.trim())
    );
    const defaultCard =
      matchingCards.find(card => card.isDefault) ?? matchingCards[0];
    if (defaultCard) {
      form.setFieldValue('card', defaultCard.cardNumber.trim());
    }
  }, [
    addedEntry,
    entryClass,
    eventSportId,
    form,
    hasClearedForm,
    open,
    prefillData,
    user,
  ]);

  useEffect(() => {
    const normalizedRegistration = registrationValue.trim().toUpperCase();
    if (!registrationPattern.test(normalizedRegistration)) {
      setDebouncedRegistration('');
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setDebouncedRegistration(normalizedRegistration);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [registrationValue]);

  useEffect(() => {
    const trimmedCard = cardValue.trim();
    if (cardRentalChecked || !/^\d{1,9}$/.test(trimmedCard)) {
      setDebouncedCard('');
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setDebouncedCard(trimmedCard);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [cardRentalChecked, cardValue]);

  const cardNumber = debouncedCard ? Number.parseInt(debouncedCard, 10) : 0;
  const { data: competitorsByRegistrationData } = useQuery<{
    competitorsByRegistration: ExistingCompetitor[];
  }>(COMPETITORS_BY_REGISTRATION, {
    variables: { eventId, registration: debouncedRegistration },
    skip: !debouncedRegistration,
    fetchPolicy: 'cache-and-network',
  });
  const { data: competitorsByCardData } = useQuery<{
    competitorsByCard: ExistingCompetitor[];
  }>(COMPETITORS_BY_CARD, {
    variables: { eventId, card: cardNumber },
    skip: !debouncedCard,
    fetchPolicy: 'cache-and-network',
  });
  const competitorsWithSameRegistration = (
    competitorsByRegistrationData?.competitorsByRegistration ?? []
  ).filter(competitor => competitor.registration === debouncedRegistration);
  const duplicateRegistrationCompetitors = competitorsWithSameRegistration
    .map(formatExistingCompetitor)
    .join(', ');
  const competitorsWithSameCard = (
    competitorsByCardData?.competitorsByCard ?? []
  ).filter(competitor => competitor.card === cardNumber);
  const duplicateCardCompetitors = competitorsWithSameCard
    .map(formatExistingCompetitor)
    .join(', ');

  // Renting a chip and entering an own card number are mutually exclusive —
  // clear whatever the user had typed into Card number once rental is checked.
  useEffect(() => {
    if (cardRentalChecked) {
      form.setFieldValue('card', '');
    }
  }, [cardRentalChecked, form]);

  const formErrors = useStore(form.store, state => state.errors);
  const crossFieldCodes = new Set<EntryFormErrorCode>();
  formErrors.forEach(errorMap => {
    if (!errorMap || typeof errorMap !== 'object') return;
    Object.values(errorMap as Record<string, EntryFormErrorCode>).forEach(
      code => {
        if (
          code === 'REGISTRATION_OR_BIRTH_YEAR_REQUIRED' ||
          code === 'CARD_OR_RENTAL_REQUIRED' ||
          code === 'BIRTH_YEAR_NOT_ELIGIBLE'
        ) {
          crossFieldCodes.add(code);
        }
      }
    );
  });

  const canSubmit = useStore(form.store, state => state.canSubmit);
  const isDirty = useStore(form.store, state => state.isDirty);

  if (!entryClass) {
    return null;
  }

  const slotOptions = entryClass.slots.map(slot => {
    const startTime = new Date(slot.startTime);
    return {
      value: startTime.toISOString(),
      label: formatTimeToHms(startTime),
    };
  });

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setAddedEntry(null);
      setHasClearedForm(false);
      setMatchedRegistration(null);
      form.reset();
    }
    onOpenChange(nextOpen);
  };

  const handleClearForm = () => {
    setHasClearedForm(true);
    setMatchedRegistration(null);
    form.reset();
  };

  const handleContinueEntries = () => {
    handleOpenChange(false);
  };

  const handleGoToCheckout = () => {
    setAddedEntry(null);
    void navigate(PATHNAMES.checkout());
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {addedEntry ? (
          <>
            <DialogHeader>
              <div className="mb-2 flex justify-center">
                <CheckCircle2 className="h-10 w-10 text-green-600" />
              </div>
              <DialogTitle className="text-center">
                {t('Pages.Event.Entries.Form.AddedTitle')}
              </DialogTitle>
              <DialogDescription className="text-center">
                {t('Pages.Event.Entries.Form.AddedDescription', {
                  name: addedEntry.name,
                  className: addedEntry.className,
                })}
              </DialogDescription>
            </DialogHeader>

            <DialogFooter className="gap-2 sm:justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={handleContinueEntries}
              >
                {t('Pages.Event.Entries.Form.ContinueEntries')}
              </Button>
              <Button type="button" onClick={handleGoToCheckout}>
                <ShoppingCart className="h-4 w-4" />
                {t('Pages.Event.Entries.Form.GoToCheckout')}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {t('Pages.Event.Entries.Form.Title', {
                  className: entryClass.name,
                })}
              </DialogTitle>
              <DialogDescription>
                {entryClass.fee
                  ? t('Pages.Event.Entries.Form.Description', {
                      fee: formatEntryFee(
                        entryClass.fee.amount,
                        currencyCode,
                        i18n.language
                      ),
                    })
                  : t('Pages.Event.Entries.Form.DescriptionFree')}
              </DialogDescription>
            </DialogHeader>

            <form
              className="space-y-4"
              onSubmit={event => {
                event.preventDefault();
                event.stopPropagation();
                void form.handleSubmit();
              }}
            >
              <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
                <RegistrationAutocomplete
                  form={form}
                  label={t('Pages.Event.Entries.Form.Registration')}
                  placeholder="XXX9901"
                  helperText={t('Pages.Event.Entries.Form.RegistrationHelper')}
                  onMatch={handleRegistrationMatch}
                />
                {matchedRegistration ? (
                  <div className="mt-3 flex items-start gap-2 text-sm text-green-700 dark:text-green-400">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      {t('Pages.Event.Entries.Form.RegistrationStep.Found')}
                    </span>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    {t('Pages.Event.Entries.Form.RegistrationStep.Manual')}
                  </p>
                )}
              </div>

              <p className="text-sm font-medium text-muted-foreground">
                {t('Pages.Event.Entries.Form.RegistrationStep.ManualFields')}
              </p>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  form={form}
                  name="firstname"
                  label={t('Pages.Event.Entries.Form.Firstname')}
                  validate={value =>
                    value.trim()
                      ? undefined
                      : t(ERROR_MESSAGE_KEYS.FIRSTNAME_REQUIRED)
                  }
                />
                <Field
                  form={form}
                  name="lastname"
                  label={t('Pages.Event.Entries.Form.Lastname')}
                  validate={value =>
                    value.trim()
                      ? undefined
                      : t(ERROR_MESSAGE_KEYS.LASTNAME_REQUIRED)
                  }
                />
                <Field
                  form={form}
                  name="birthYear"
                  label={t('Pages.Event.Entries.Form.BirthYear')}
                  placeholder="1995"
                />
                <ClubAutocomplete
                  form={form}
                  label={t('Pages.Event.Entries.Form.Organisation')}
                />
                <Field
                  form={form}
                  name="license"
                  label={t('Pages.Event.Entries.Form.License')}
                  placeholder="A"
                  autoCapitalize="characters"
                />
                {debouncedRegistration &&
                  competitorsWithSameRegistration.length > 0 && (
                    <Alert className="border-amber-300 bg-amber-50 text-amber-950 sm:col-span-2 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        {t(
                          'Pages.Event.Entries.Form.Warnings.RegistrationAlreadyUsed',
                          {
                            competitors: duplicateRegistrationCompetitors,
                          }
                        )}
                      </AlertDescription>
                    </Alert>
                  )}
                <div className="space-y-2">
                  <Field
                    form={form}
                    name="card"
                    label={t('Pages.Event.Entries.Form.Card')}
                    placeholder="8123456"
                  />
                  {debouncedCard && competitorsWithSameCard.length > 0 && (
                    <Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        {t(
                          'Pages.Event.Entries.Form.Warnings.CardAlreadyUsed',
                          {
                            competitors: duplicateCardCompetitors,
                          }
                        )}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
                {entryClass.startMode !== 'FreeStart' && (
                  <Field
                    form={form}
                    {...{
                      name: 'startTime',
                      type: 'select' as const,
                      label: t('Pages.Event.Entries.Form.StartTime'),
                      placeholder: t(
                        'Pages.Event.Entries.Form.StartTimePlaceholder'
                      ),
                      options: slotOptions,
                    }}
                  />
                )}
              </div>

              {cardRentalEnabled && (
                <Field
                  form={form}
                  name="cardRental"
                  type="checkbox"
                  label={
                    cardRentalAction?.price != null
                      ? t('Pages.Event.Entries.Form.CardRentalWithPrice', {
                          price: formatEntryFee(
                            cardRentalAction.price,
                            currencyCode,
                            i18n.language
                          ),
                        })
                      : t('Pages.Event.Entries.Form.CardRentalFree')
                  }
                />
              )}

              <form.Field name="note">
                {field => (
                  <div className="space-y-2">
                    <Label htmlFor="entry-note">
                      {t('Pages.Event.Entries.Form.Note')}
                    </Label>
                    <Textarea
                      id="entry-note"
                      name="note"
                      value={field.state.value}
                      maxLength={191}
                      placeholder={t(
                        'Pages.Event.Entries.Form.NotePlaceholder'
                      )}
                      onChange={event => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                    />
                  </div>
                )}
              </form.Field>

              {crossFieldCodes.size > 0 && isDirty && (
                <ul className="space-y-1 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {[...crossFieldCodes].map(code => (
                    <li key={code}>{t(ERROR_MESSAGE_KEYS[code])}</li>
                  ))}
                </ul>
              )}

              <DialogFooter className="gap-2 sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!isDirty}
                  onClick={handleClearForm}
                >
                  <Trash2 className="h-4 w-4" />
                  {t('Pages.Event.Entries.Form.ClearForm')}
                </Button>
                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleOpenChange(false)}
                  >
                    {t('Operations.Cancel', { ns: 'common' })}
                  </Button>
                  <Button type="submit" disabled={!canSubmit || !isDirty}>
                    {t('Pages.Event.Entries.Form.AddToCart')}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
