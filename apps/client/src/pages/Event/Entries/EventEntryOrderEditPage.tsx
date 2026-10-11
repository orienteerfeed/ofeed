import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { useNavigate, useParams } from '@tanstack/react-router';
import type { PaymentMethodType } from '@repo/shared';
import { AlertCircle, Loader2, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/atoms';
import { BackLink, ButtonWithSpinner } from '@/components/molecules';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { formatTimeToHms } from '@/lib/date';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { MainPageLayout } from '@/templates/MainPageLayout';
import { toast } from '@/utils';

import {
  useEventEntryAvailability,
  useEventEntryPaymentMethods,
} from './entries.hooks';
import {
  ENTRY_ORDER_BY_ID,
  type EntryOrderByIdData,
  type EntryOrderByIdVariables,
} from './entryOrders.gql';
import { formatEntryFee } from './EntryClassCard';
import {
  EMPTY_ENTRY_FORM_VALUES,
  type EntryFormErrorCode,
  type EntryFormErrors,
  type EntryFormValues,
  validateEntryForm,
} from './entry-form.validation';

const ENTRY_ORDER_UPDATE = gql`
  mutation EntryOrderUpdate($entryId: String!, $input: EntryOrderUpdateInput!) {
    entryOrderUpdate(entryId: $entryId, input: $input) {
      id
    }
  }
`;

type EditableItem = EntryFormValues & { id: string; classId: number };
const ITEM_FIELDS = [
  ['firstname', 'Pages.Event.Entries.Form.Firstname'],
  ['lastname', 'Pages.Event.Entries.Form.Lastname'],
  ['registration', 'Pages.Event.Entries.Form.Registration'],
  ['birthYear', 'Pages.Event.Entries.Form.BirthYear'],
  ['organisation', 'Pages.Event.Entries.Form.Organisation'],
  ['license', 'Pages.Event.Entries.Form.License'],
  ['card', 'Pages.Event.Entries.Form.Card'],
] as const;
const ITEM_ERROR_KEYS = {
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

type ContactField = 'email' | 'firstname' | 'lastname';
type ContactErrors = Partial<Record<ContactField, string>>;

const toEditable = (
  item: NonNullable<EntryOrderByIdData['entryOrderById']>['items'][number]
): EditableItem => ({
  id: String(item.id),
  classId: item.classId,
  firstname: item.firstname,
  lastname: item.lastname,
  registration: item.registration ?? '',
  birthYear: item.birthYear?.toString() ?? '',
  organisation: item.organisation ?? '',
  license: item.license ?? '',
  note: item.note ?? '',
  card: item.card?.toString() ?? '',
  cardRental: item.cardRental,
  startTime: item.startTime ? new Date(item.startTime).toISOString() : '',
});

export function EventEntryOrderEditPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { eventId, entryId } = useParams({
    from: '/events/$eventId/entries_/$entryId_/edit',
  });
  const {
    data,
    loading,
    error: entryError,
  } = useQuery<EntryOrderByIdData, EntryOrderByIdVariables>(ENTRY_ORDER_BY_ID, {
    variables: { entryId },
  });
  const {
    data: availability,
    isLoading: availabilityLoading,
    error: availabilityError,
  } = useEventEntryAvailability(eventId);
  const { data: paymentMethods } = useEventEntryPaymentMethods(eventId);
  const [update, { loading: saving }] = useMutation(ENTRY_ORDER_UPDATE);
  const entry = data?.entryOrderById;
  const [contact, setContact] = useState({
    email: '',
    firstname: '',
    lastname: '',
    paymentMethod: '' as PaymentMethodType | '',
  });
  const [items, setItems] = useState<EditableItem[]>([]);
  useEffect(() => {
    if (entry) {
      setContact({
        email: entry.contactEmail,
        firstname: entry.contactFirstname,
        lastname: entry.contactLastname,
        paymentMethod: entry.paymentMethod ?? '',
      });
      setItems(entry.items.map(toEditable));
    }
  }, [entry]);

  // Older orders can have no saved payment method, and an organizer may have
  // disabled the method that was originally selected. In both cases a Select
  // value without a matching option looks empty, so choose the saved method
  // only when it is still selectable and otherwise fall back to the first
  // currently available method.
  useEffect(() => {
    const fallbackMethod = paymentMethods?.[0];
    if (!fallbackMethod) return;

    setContact(current => {
      const savedMethod = current.paymentMethod || entry?.paymentMethod;
      const paymentMethod = paymentMethods.some(
        method => method.type === savedMethod
      )
        ? (savedMethod as PaymentMethodType)
        : fallbackMethod.type;

      return current.paymentMethod === paymentMethod
        ? current
        : { ...current, paymentMethod };
    });
  }, [entry?.paymentMethod, paymentMethods]);

  const patchItem = (id: string, patch: Partial<EditableItem>) =>
    setItems(current =>
      current.map(item => (item.id === id ? { ...item, ...patch } : item))
    );

  const contactErrors: ContactErrors = {};
  if (!contact.email.trim()) {
    contactErrors.email = t('Pages.Checkout.Form.Errors.EmailRequired');
  } else if (!/^\S+@\S+\.\S+$/.test(contact.email.trim())) {
    contactErrors.email = t('Pages.Checkout.Form.Errors.EmailInvalid');
  }
  if (!contact.firstname.trim()) {
    contactErrors.firstname = t('Pages.Checkout.Form.Errors.FirstnameRequired');
  }
  if (!contact.lastname.trim()) {
    contactErrors.lastname = t('Pages.Checkout.Form.Errors.LastnameRequired');
  }

  const paymentMethodName = (
    type: PaymentMethodType,
    displayName: string | null
  ) =>
    type === 'CUSTOM_PAYMENT_LINK' && displayName
      ? displayName
      : t(`Pages.Checkout.PaymentMethods.Methods.${type}`);

  if (loading || availabilityLoading)
    return (
      <MainPageLayout t={t} pageName={t('Loading', { ns: 'common' })}>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainPageLayout>
    );

  if (entryError || availabilityError || !entry || !availability) {
    return (
      <MainPageLayout t={t} pageName={t('Pages.Event.EntriesManage.Title')}>
        <section className="container mx-auto px-4 py-6">
          <BackLink to={`/events/${eventId}/entries`} className="mb-4" />
          {entryError || availabilityError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{t('Error', { ns: 'common' })}</AlertTitle>
              <AlertDescription>
                {t('ErrorMessage', { ns: 'common' })}
              </AlertDescription>
            </Alert>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t('Pages.Event.EntriesManage.Detail.NotFound')}
            </p>
          )}
        </section>
      </MainPageLayout>
    );
  }

  const itemErrors = new Map<string, EntryFormErrors>();
  items.forEach(item => {
    const entryClass = availability.classes.find(
      value => value.id === item.classId
    );
    if (!entryClass) return;
    itemErrors.set(
      item.id,
      validateEntryForm(item, entryClass, {
        referenceYear: new Date().getFullYear(),
      })
    );
  });

  const addItem = () => {
    const cls = availability.classes.find(item => !item.isFull);
    if (cls)
      setItems(current => [
        ...current,
        {
          ...EMPTY_ENTRY_FORM_VALUES,
          id: crypto.randomUUID(),
          classId: cls.id,
        },
      ]);
  };
  const submit = async () => {
    const invalid = items.some(item => {
      const entryClass = availability.classes.find(
        value => value.id === item.classId
      );
      return (
        !entryClass || Object.keys(itemErrors.get(item.id) ?? {}).length > 0
      );
    });
    if (
      Object.keys(contactErrors).length > 0 ||
      !contact.paymentMethod ||
      items.length === 0 ||
      invalid
    ) {
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        variant: 'error',
      });
      return;
    }
    try {
      await update({
        variables: {
          entryId,
          input: {
            contactEmail: contact.email.trim(),
            contactFirstname: contact.firstname.trim(),
            contactLastname: contact.lastname.trim(),
            paymentMethod: contact.paymentMethod,
            items: items.map(item => ({
              classId: item.classId,
              firstname: item.firstname.trim(),
              lastname: item.lastname.trim(),
              registration: item.registration.trim() || undefined,
              birthYear: item.birthYear ? Number(item.birthYear) : undefined,
              organisation: item.organisation.trim() || undefined,
              license: item.license.trim() || undefined,
              note: item.note.trim() || undefined,
              card: item.card ? Number(item.card) : undefined,
              cardRental: item.cardRental,
              startTime: item.startTime || undefined,
            })),
          },
        },
      });
      await navigate({
        to: '/events/$eventId/entries/$entryId',
        params: { eventId, entryId },
      });
    } catch (error) {
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        ...(error instanceof Error ? { description: error.message } : {}),
        variant: 'error',
      });
    }
  };
  return (
    <MainPageLayout
      t={t}
      pageName={t('Pages.Event.EntriesManage.Actions.Edit')}
    >
      <section className="container mx-auto max-w-4xl px-4 py-6">
        <BackLink to={`/events/${eventId}/entries/${entryId}`} />
        <form
          className="mt-6 space-y-6"
          onSubmit={event => {
            event.preventDefault();
            void submit();
          }}
          noValidate
        >
          <Card>
            <CardHeader>
              <CardTitle>{t('Pages.Checkout.ContactTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              {(['email', 'firstname', 'lastname'] as const).map(key => {
                const error = contactErrors[key];
                const label = t(
                  `Pages.Checkout.Form.${key === 'email' ? 'Email' : key === 'firstname' ? 'Firstname' : 'Lastname'}`
                );
                const inputId = `contact-${key}`;
                return (
                  <div key={key} className="space-y-2">
                    <Label htmlFor={inputId}>{label}</Label>
                    <Input
                      id={inputId}
                      name={key === 'email' ? 'email' : `contact-${key}`}
                      type={key === 'email' ? 'email' : 'text'}
                      autoComplete={
                        key === 'email'
                          ? 'email'
                          : key === 'firstname'
                            ? 'given-name'
                            : 'family-name'
                      }
                      value={contact[key]}
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? `${inputId}-error` : undefined}
                      onChange={event =>
                        setContact(current => ({
                          ...current,
                          [key]: event.target.value,
                        }))
                      }
                    />
                    {error && (
                      <p
                        id={`${inputId}-error`}
                        className="text-sm text-destructive"
                      >
                        {error}
                      </p>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('Pages.Checkout.PaymentMethods.Label')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                value={contact.paymentMethod}
                onValueChange={paymentMethod =>
                  setContact(current => ({
                    ...current,
                    paymentMethod: paymentMethod as PaymentMethodType,
                  }))
                }
              >
                <SelectTrigger
                  id="payment-method"
                  aria-invalid={!contact.paymentMethod}
                >
                  <SelectValue
                    placeholder={t('Pages.Checkout.PaymentMethods.Placeholder')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods?.map(method => (
                    <SelectItem key={method.type} value={method.type}>
                      {paymentMethodName(method.type, method.displayName)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!contact.paymentMethod && (
                <p className="mt-2 text-sm text-destructive">
                  {t('Validations.SelectRequired')}
                </p>
              )}
              {paymentMethods?.length === 0 && (
                <p className="mt-2 text-sm text-destructive">
                  {t('Pages.Checkout.PaymentMethods.NoneAvailable')}
                </p>
              )}
            </CardContent>
          </Card>
          <div className="space-y-4">
            {items.map((item, index) => {
              const cls = availability.classes.find(
                value => value.id === item.classId
              );
              const errors = itemErrors.get(item.id) ?? {};
              const cardRentalAction = availability.entryActions.find(
                action => action.key === 'CARD_RENTAL'
              );
              const cardRentalEnabled = cardRentalAction?.enabled ?? false;
              return (
                <Card key={item.id}>
                  <CardHeader className="flex-row items-center justify-between">
                    <CardTitle>
                      {t('Pages.Event.EntriesManage.Detail.Items.Title')}{' '}
                      {index + 1}
                    </CardTitle>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={items.length === 1}
                      onClick={() =>
                        setItems(current =>
                          current.filter(value => value.id !== item.id)
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">
                        {t('Pages.Checkout.RemoveItem')}
                      </span>
                    </Button>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor={`class-${item.id}`}>
                        {t(
                          'Pages.Event.EntriesManage.ItemsTable.Columns.Class'
                        )}
                      </Label>
                      <Select
                        value={String(item.classId)}
                        onValueChange={value =>
                          patchItem(item.id, {
                            classId: Number(value),
                            startTime: '',
                          })
                        }
                      >
                        <SelectTrigger id={`class-${item.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {availability.classes.map(value => (
                            <SelectItem
                              key={value.id}
                              value={String(value.id)}
                              disabled={
                                value.isFull && value.id !== item.classId
                              }
                            >
                              {value.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {ITEM_FIELDS.map(([key, label]) => {
                      const error = errors[key];
                      const inputId = `${key}-${item.id}`;
                      return (
                        <div key={key} className="space-y-2">
                          <Label htmlFor={inputId}>{t(label)}</Label>
                          <Input
                            id={inputId}
                            name={`${key}-${item.id}`}
                            value={item[key]}
                            type="text"
                            inputMode={
                              key === 'birthYear' || key === 'card'
                                ? 'numeric'
                                : undefined
                            }
                            autoCapitalize={
                              key === 'registration' || key === 'license'
                                ? 'characters'
                                : undefined
                            }
                            disabled={key === 'card' && item.cardRental}
                            aria-invalid={Boolean(error)}
                            aria-describedby={
                              error ? `${inputId}-error` : undefined
                            }
                            onChange={event =>
                              patchItem(item.id, { [key]: event.target.value })
                            }
                          />
                          {error && (
                            <p
                              id={`${inputId}-error`}
                              className="text-sm text-destructive"
                            >
                              {t(ITEM_ERROR_KEYS[error])}
                            </p>
                          )}
                        </div>
                      );
                    })}
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor={`note-${item.id}`}>
                        {t('Pages.Event.Entries.Form.Note')}
                      </Label>
                      <Textarea
                        id={`note-${item.id}`}
                        name={`note-${item.id}`}
                        value={item.note}
                        maxLength={191}
                        placeholder={t(
                          'Pages.Event.Entries.Form.NotePlaceholder'
                        )}
                        onChange={event =>
                          patchItem(item.id, { note: event.target.value })
                        }
                      />
                    </div>
                    {cardRentalEnabled && (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`rental-${item.id}`}
                          checked={item.cardRental}
                          onCheckedChange={checked =>
                            patchItem(item.id, {
                              cardRental: checked === true,
                              ...(checked === true ? { card: '' } : {}),
                            })
                          }
                        />
                        <Label htmlFor={`rental-${item.id}`}>
                          {cardRentalAction?.price != null
                            ? t(
                                'Pages.Event.Entries.Form.CardRentalWithPrice',
                                {
                                  price: formatEntryFee(
                                    cardRentalAction.price,
                                    availability.currency.code,
                                    i18n.language
                                  ),
                                }
                              )
                            : t('Pages.Event.Entries.Form.CardRentalFree')}
                        </Label>
                      </div>
                    )}
                    {cls && cls.startMode !== 'FreeStart' && (
                      <div className="space-y-2">
                        <Label htmlFor={`start-time-${item.id}`}>
                          {t('Pages.Event.Entries.Form.StartTime')}
                        </Label>
                        <Select
                          value={item.startTime}
                          onValueChange={startTime =>
                            patchItem(item.id, { startTime })
                          }
                        >
                          <SelectTrigger
                            id={`start-time-${item.id}`}
                            aria-invalid={Boolean(errors.startTime)}
                          >
                            <SelectValue
                              placeholder={t(
                                'Pages.Event.Entries.Form.StartTimePlaceholder'
                              )}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {cls.slots.map(slot => (
                              <SelectItem
                                key={slot.id}
                                value={new Date(slot.startTime).toISOString()}
                              >
                                {formatTimeToHms(slot.startTime)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {errors.startTime && (
                          <p className="text-sm text-destructive">
                            {t(ITEM_ERROR_KEYS[errors.startTime])}
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={addItem}
            disabled={!availability.classes.some(item => !item.isFull)}
          >
            <Plus className="h-4 w-4" />
            {t('Pages.Event.Entries.Form.AddToCart')}
          </Button>
          <div className="flex flex-wrap justify-end gap-3 border-t pt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                void navigate({
                  to: '/events/$eventId/entries/$entryId',
                  params: { eventId, entryId },
                })
              }
            >
              {t('Operations.Cancel', { ns: 'common' })}
            </Button>
            <ButtonWithSpinner type="submit" isSubmitting={saving}>
              {t('Operations.Save', { ns: 'common' })}
            </ButtonWithSpinner>
          </div>
        </form>
      </section>
    </MainPageLayout>
  );
}
