import type { EntryOrder, PaymentMethodType } from '@repo/shared';
import { useForm, useStore } from '@tanstack/react-form';
import { Link } from '@tanstack/react-router';
import {
  CheckCircle2,
  ExternalLink,
  Smartphone,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';

import { Button } from '@/components/atoms';
import { ButtonWithSpinner } from '@/components/molecules';
import { Field } from '@/components/organisms';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import PATHNAMES from '@/lib/paths/pathnames';
import { useCartItems, useRemoveCartItem } from '@/stores/cart';
import type { CartEntryItem } from '@/stores/cart';
import { MainPageLayout } from '@/templates/MainPageLayout';
import { toast } from '@/utils';

import { formatEntryFee } from '../Event/Entries/EntryClassCard';
import {
  useCreateEntryOrder,
  useEventEntryPaymentMethods,
} from '../Event/Entries/entries.hooks';

interface EventCartGroup {
  eventId: string;
  eventName: string;
  currencyCode: string;
  items: CartEntryItem[];
  total: number;
}

interface CompletedOrder {
  eventName: string;
  order: EntryOrder;
}

function QrPaymentInstructions({
  payment,
}: {
  payment: NonNullable<EntryOrder['qrPayment']>;
}) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const accountDisplay = [payment.bankAccountName, payment.bankAccountIban]
    .filter(Boolean)
    .join(' · ');

  return (
    <section
      className="space-y-4 border-t pt-4 text-center"
      aria-labelledby="qr-payment-title"
    >
      <div className="space-y-1">
        <h3 id="qr-payment-title" className="font-semibold">
          {t('Pages.Checkout.QrPayment.Title')}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t('Pages.Checkout.QrPayment.Description')}
        </p>
      </div>
      <div className="inline-flex rounded-lg border bg-white p-3">
        <QRCodeSVG
          value={payment.payload}
          size={208}
          level="M"
          aria-label={t('Pages.Checkout.QrPayment.QrCodeAriaLabel')}
        />
      </div>
      {accountDisplay ? (
        <p className="text-sm text-muted-foreground">{accountDisplay}</p>
      ) : null}
      {isMobile ? (
        <Button asChild className="w-full sm:w-auto">
          <a href={`spayd://${payment.payload}`}>
            <Smartphone className="h-4 w-4" />
            {t('Pages.Checkout.QrPayment.OpenInBankApp')}
          </a>
        </Button>
      ) : null}
    </section>
  );
}

function CashPaymentInstructions({
  order,
  detailAccessToken,
}: {
  order: EntryOrder;
  detailAccessToken: string;
}) {
  const { t } = useTranslation();
  const titleId = `cash-payment-title-${order.id}`;
  const detailPath = PATHNAMES.eventEntryDetail(order.eventId, order.id).url;
  const detailSearch = new URLSearchParams({
    access: detailAccessToken,
  }).toString();
  const detailUrl =
    typeof window === 'undefined'
      ? `${detailPath}?${detailSearch}`
      : new URL(
          `${detailPath}?${detailSearch}`,
          window.location.origin
        ).toString();

  return (
    <section
      className="space-y-4 border-t pt-4 text-center"
      aria-labelledby={titleId}
    >
      <div className="space-y-1">
        <h3 id={titleId} className="font-semibold">
          {t('Pages.Checkout.CashPayment.Title')}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t('Pages.Checkout.CashPayment.Description')}
        </p>
      </div>
      <div className="inline-flex rounded-lg border bg-white p-3">
        <QRCodeSVG
          value={detailUrl}
          size={176}
          level="M"
          aria-label={t('Pages.Checkout.CashPayment.QrCodeAriaLabel')}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        {t('Pages.Checkout.CashPayment.QrCodeDescription')}
      </p>
    </section>
  );
}

function CustomPaymentLinkInstructions({ paymentUrl }: { paymentUrl: string }) {
  const { t } = useTranslation();

  return (
    <section className="space-y-3 border-t pt-4 text-center">
      <div className="space-y-1">
        <h3 className="font-semibold">
          {t('Pages.Checkout.CustomPayment.Title')}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t('Pages.Checkout.CustomPayment.Description')}
        </p>
      </div>
      <Button asChild className="w-full sm:w-auto">
        <a href={paymentUrl} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="h-4 w-4" />
          {t('Pages.Checkout.CustomPayment.OpenPaymentLink')}
        </a>
      </Button>
    </section>
  );
}

function CompletedOrderCard({
  completedOrder,
}: {
  completedOrder: CompletedOrder;
}) {
  const { t, i18n } = useTranslation();
  const { eventName, order } = completedOrder;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{eventName}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">
            {t('Pages.Checkout.PaymentReference')}
          </span>
          <span className="font-mono font-semibold">
            {order.paymentReference}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">
            {t('Pages.Checkout.Total')}
          </span>
          <span className="font-semibold">
            {formatEntryFee(order.totalAmount, order.currency, i18n.language)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">
            {t('Pages.Checkout.EntriesInOrder')}
          </span>
          <span>{order.items.length}</span>
        </div>
        {order.qrPayment ? (
          <QrPaymentInstructions payment={order.qrPayment} />
        ) : null}
        {order.paymentMethod === 'CASH' && order.detailAccessToken ? (
          <CashPaymentInstructions
            order={order}
            detailAccessToken={order.detailAccessToken}
          />
        ) : null}
        {order.paymentMethod === 'CUSTOM_PAYMENT_LINK' && order.paymentUrl ? (
          <CustomPaymentLinkInstructions paymentUrl={order.paymentUrl} />
        ) : null}
      </CardContent>
    </Card>
  );
}

function groupItemsByEvent(items: CartEntryItem[]): EventCartGroup[] {
  const groups = new Map<string, EventCartGroup>();
  for (const item of items) {
    let group = groups.get(item.eventId);
    if (!group) {
      group = {
        eventId: item.eventId,
        eventName: item.eventName,
        currencyCode: item.currencyCode,
        items: [],
        total: 0,
      };
      groups.set(item.eventId, group);
    }
    group.items.push(item);
    group.total += item.fee + (item.cardRentalFee ?? 0);
  }
  return [...groups.values()];
}

function toOrderItem(item: CartEntryItem) {
  return {
    classId: item.classId,
    firstname: item.firstname,
    lastname: item.lastname,
    ...(item.registration ? { registration: item.registration } : {}),
    ...(item.birthYear !== undefined ? { birthYear: item.birthYear } : {}),
    ...(item.organisation ? { organisation: item.organisation } : {}),
    ...(item.license ? { license: item.license } : {}),
    ...(item.note ? { note: item.note } : {}),
    ...(item.card !== undefined ? { card: item.card } : {}),
    cardRental: item.cardRental,
    ...(item.startTime ? { startTime: item.startTime } : {}),
  };
}

function CheckoutPaymentMethodField({
  eventId,
  value,
  onChange,
}: {
  eventId: string;
  value: PaymentMethodType | undefined;
  onChange: (value: PaymentMethodType | undefined) => void;
}) {
  const { t } = useTranslation();
  const {
    data: paymentMethods,
    isLoading,
    isError,
  } = useEventEntryPaymentMethods(eventId);

  useEffect(() => {
    if (!paymentMethods) return;
    if (paymentMethods.some(method => method.type === value)) return;
    onChange(paymentMethods[0]?.type);
  }, [onChange, paymentMethods, value]);

  const paymentMethodName = (
    type: PaymentMethodType,
    displayName: string | null
  ) => {
    if (type === 'CUSTOM_PAYMENT_LINK' && displayName) return displayName;
    return t(`Pages.Checkout.PaymentMethods.Methods.${type}`);
  };

  const id = `payment-method-${eventId}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{t('Pages.Checkout.PaymentMethods.Label')}</Label>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">
          {t('Pages.Checkout.PaymentMethods.Loading')}
        </p>
      ) : isError ? (
        <p className="text-sm text-destructive" role="alert">
          {t('Pages.Checkout.PaymentMethods.LoadError')}
        </p>
      ) : paymentMethods?.length ? (
        <Select
          {...(value ? { value } : {})}
          onValueChange={next => onChange(next as PaymentMethodType)}
        >
          <SelectTrigger
            id={id}
            aria-label={t('Pages.Checkout.PaymentMethods.Label')}
          >
            <SelectValue
              placeholder={t('Pages.Checkout.PaymentMethods.Placeholder')}
            />
          </SelectTrigger>
          <SelectContent>
            {paymentMethods.map(method => (
              <SelectItem key={method.type} value={method.type}>
                {paymentMethodName(method.type, method.displayName)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <p className="text-sm text-destructive" role="alert">
          {t('Pages.Checkout.PaymentMethods.NoneAvailable')}
        </p>
      )}
    </div>
  );
}

export const CheckoutPage = () => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const cartItems = useCartItems();
  const removeItem = useRemoveCartItem();
  const createOrder = useCreateEntryOrder();

  const [completedOrders, setCompletedOrders] = useState<CompletedOrder[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<
    Record<string, PaymentMethodType | undefined>
  >({});

  const groups = useMemo(() => groupItemsByEvent(cartItems), [cartItems]);

  const form = useForm({
    defaultValues: {
      email: user?.email ?? '',
      firstname: user?.firstname ?? '',
      lastname: user?.lastname ?? '',
    },
    onSubmit: async ({ value }) => {
      if (groups.length === 0 || isSubmitting) return;

      setIsSubmitting(true);
      try {
        for (const group of groups) {
          const paymentMethod = paymentMethods[group.eventId];
          if (!paymentMethod) {
            throw new Error(t('Pages.Checkout.PaymentMethods.NoneAvailable'));
          }
          const order = await createOrder.mutateAsync({
            eventId: group.eventId,
            paymentLinkLanguage: i18n.language,
            order: {
              contactEmail: value.email.trim(),
              contactFirstname: value.firstname.trim(),
              contactLastname: value.lastname.trim(),
              paymentMethod,
              items: group.items.map(toOrderItem),
            },
          });
          setCompletedOrders(current => [
            ...current,
            { eventName: group.eventName, order },
          ]);
          // Remove only the submitted items. If a later event fails, a retry
          // can submit just the remaining groups without duplicating this one.
          group.items.forEach(item => removeItem(item.id));
        }
        toast({
          title: t('Pages.Checkout.OrderSuccessToast'),
          variant: 'success',
        });
      } catch (error) {
        toast({
          title: t('Pages.Checkout.OrderErrorToast'),
          ...(error instanceof Error ? { description: error.message } : {}),
          variant: 'error',
        });
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  const canSubmit = useStore(form.store, state => state.canSubmit);
  const hasPaymentMethodForEveryEvent = groups.every(
    group => paymentMethods[group.eventId] !== undefined
  );

  const validateRequired = (message: string) => (value: string) =>
    value.trim() ? undefined : message;

  const validateEmail = (value: string): string | undefined => {
    if (!value.trim()) {
      return t('Pages.Checkout.Form.Errors.EmailRequired');
    }
    if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value.trim())) {
      return t('Pages.Checkout.Form.Errors.EmailInvalid');
    }
    return undefined;
  };

  if (completedOrders.length > 0 && cartItems.length === 0) {
    return (
      <MainPageLayout t={t} pageName={t('Pages.Checkout.Title')}>
        <div className="container mx-auto max-w-2xl space-y-6 px-4 py-10">
          <div className="flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <h1 className="text-2xl font-bold">
              {t('Pages.Checkout.SuccessTitle')}
            </h1>
            <p className="text-muted-foreground">
              {t('Pages.Checkout.SuccessDescription')}
            </p>
          </div>
          {completedOrders.map(completedOrder => (
            <CompletedOrderCard
              key={completedOrder.order.id}
              completedOrder={completedOrder}
            />
          ))}
          <div className="text-center">
            <Button asChild>
              <Link {...PATHNAMES.home()}>{t('Pages.Checkout.BackHome')}</Link>
            </Button>
          </div>
        </div>
      </MainPageLayout>
    );
  }

  return (
    <MainPageLayout t={t} pageName={t('Pages.Checkout.Title')}>
      <div className="container mx-auto max-w-3xl space-y-6 px-4 py-10">
        <h1 className="text-2xl font-bold">{t('Pages.Checkout.Title')}</h1>

        {cartItems.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <ShoppingCart className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">
              {t('Pages.Checkout.EmptyCart')}
            </p>
            <Button asChild variant="outline">
              <Link {...PATHNAMES.home()}>{t('Pages.Checkout.BackHome')}</Link>
            </Button>
          </div>
        ) : (
          <>
            {completedOrders.length > 0 && (
              <section className="space-y-3">
                <Alert>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertTitle>
                    {t('Pages.Checkout.PartialSuccessTitle')}
                  </AlertTitle>
                  <AlertDescription>
                    {t('Pages.Checkout.PartialSuccessDescription')}
                  </AlertDescription>
                </Alert>
                <div className="grid gap-4 sm:grid-cols-2">
                  {completedOrders.map(completedOrder => (
                    <CompletedOrderCard
                      key={completedOrder.order.id}
                      completedOrder={completedOrder}
                    />
                  ))}
                </div>
              </section>
            )}

            {groups.map(group => (
              <Card key={group.eventId}>
                <CardHeader>
                  <CardTitle className="text-lg">
                    <Link
                      {...PATHNAMES.eventDetail(group.eventId)}
                      className="hover:text-primary"
                    >
                      {group.eventName}
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {group.items.map(item => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {item.firstname} {item.lastname}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {item.className}
                          {item.registration ? ` · ${item.registration}` : ''}
                          {item.cardRental
                            ? ` · ${t('Pages.Checkout.CardRental')}`
                            : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-sm font-semibold">
                          {formatEntryFee(
                            item.fee + (item.cardRentalFee ?? 0),
                            item.currencyCode,
                            i18n.language
                          )}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={t('Pages.Checkout.RemoveItem')}
                          onClick={() => removeItem(item.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Separator />
                  <div className="flex justify-between font-semibold">
                    <span>{t('Pages.Checkout.Total')}</span>
                    <span>
                      {formatEntryFee(
                        group.total,
                        group.currencyCode,
                        i18n.language
                      )}
                    </span>
                  </div>
                  <CheckoutPaymentMethodField
                    eventId={group.eventId}
                    value={paymentMethods[group.eventId]}
                    onChange={paymentMethod =>
                      setPaymentMethods(current => ({
                        ...current,
                        [group.eventId]: paymentMethod,
                      }))
                    }
                  />
                </CardContent>
              </Card>
            ))}

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  {t('Pages.Checkout.ContactTitle')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  className="space-y-4"
                  onSubmit={event => {
                    event.preventDefault();
                    event.stopPropagation();
                    void form.handleSubmit();
                  }}
                >
                  <Field
                    form={form}
                    name="email"
                    type="email"
                    label={t('Pages.Checkout.Form.Email')}
                    validate={validateEmail}
                  />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field
                      form={form}
                      name="firstname"
                      label={t('Pages.Checkout.Form.Firstname')}
                      validate={validateRequired(
                        t('Pages.Checkout.Form.Errors.FirstnameRequired')
                      )}
                    />
                    <Field
                      form={form}
                      name="lastname"
                      label={t('Pages.Checkout.Form.Lastname')}
                      validate={validateRequired(
                        t('Pages.Checkout.Form.Errors.LastnameRequired')
                      )}
                    />
                  </div>
                  <ButtonWithSpinner
                    type="submit"
                    className="w-full"
                    isSubmitting={isSubmitting}
                    disabled={
                      !canSubmit ||
                      !hasPaymentMethodForEveryEvent ||
                      isSubmitting
                    }
                  >
                    {t('Pages.Checkout.SubmitOrder')}
                  </ButtonWithSpinner>
                </form>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </MainPageLayout>
  );
};
