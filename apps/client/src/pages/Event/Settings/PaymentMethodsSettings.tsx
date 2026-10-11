import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import {
  PAYMENT_LINK_VARIABLES,
  findUnknownPaymentLinkVariables,
  getPaymentMethodConfigurationStatus,
  paymentLinkTemplateSchema,
  type EventPaymentMethodConfiguration,
  type PaymentMethodConfigurationStatus,
  type PaymentMethodType,
} from '@repo/shared';
import { useBlocker } from '@tanstack/react-router';
import { TFunction } from 'i18next';
import { ArrowDown, ArrowUp, Info, Loader2, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button, Input, ToggleSwitch } from '@/components/atoms';
import { ConfirmDialog } from '@/components/molecules';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from '@/utils';

export const EVENT_PAYMENT_METHODS = gql`
  query EventPaymentMethods($eventId: String!) {
    eventPaymentMethods(eventId: $eventId) {
      eventId
      paymentMethods {
        type
        enabled
        position
        displayName
        paymentLinkTemplate
        status
      }
      paymentCapabilities {
        ofeedPaymentAvailable
        qrPaymentAvailable
        bankAccountDisplay
        bankAccountIban
        bankAccountName
      }
    }
  }
`;

export const UPDATE_EVENT_PAYMENT_METHODS = gql`
  mutation UpdateEventPaymentMethods(
    $eventId: String!
    $input: UpdateEventPaymentMethodsInput!
  ) {
    updateEventPaymentMethods(eventId: $eventId, input: $input) {
      eventId
      paymentMethods {
        type
        enabled
        position
        displayName
        paymentLinkTemplate
        status
      }
      paymentCapabilities {
        ofeedPaymentAvailable
        qrPaymentAvailable
        bankAccountDisplay
        bankAccountIban
        bankAccountName
      }
    }
  }
`;

type PaymentCapabilities = {
  ofeedPaymentAvailable: boolean;
  qrPaymentAvailable: boolean;
  bankAccountDisplay: string | null;
  bankAccountIban: string | null;
  bankAccountName: string | null;
};

type PaymentMethodsPayload = {
  eventId: string;
  paymentMethods: Array<
    EventPaymentMethodConfiguration & {
      status: PaymentMethodConfigurationStatus;
    }
  >;
  paymentCapabilities: PaymentCapabilities;
};

type EventPaymentMethodsData = { eventPaymentMethods: PaymentMethodsPayload };
type UpdateEventPaymentMethodsData = {
  updateEventPaymentMethods: PaymentMethodsPayload;
};

type BankAccountForm = {
  bankAccountName: string;
  bankAccountIban: string;
};

function toPaymentMethodConfiguration(
  method: PaymentMethodsPayload['paymentMethods'][number]
): EventPaymentMethodConfiguration {
  return {
    type: method.type,
    enabled: method.enabled,
    position: method.position,
    displayName: method.displayName,
    paymentLinkTemplate: method.paymentLinkTemplate,
  };
}

type MethodErrors = Partial<
  Record<'displayName' | 'paymentLinkTemplate' | 'method', string>
>;
type ValidationErrors = {
  global?: string;
  methods: Partial<Record<PaymentMethodType, MethodErrors>>;
};

type PaymentMethodsSettingsProps = {
  eventId: string;
  t: TFunction;
};

const METHOD_I18N_KEYS = {
  OFEED_PAYMENT: {
    title:
      'Pages.Event.Settings.Services.PaymentMethods.Methods.OFeedPayment.Title',
    description:
      'Pages.Event.Settings.Services.PaymentMethods.Methods.OFeedPayment.Description',
  },
  CUSTOM_PAYMENT_LINK: {
    title:
      'Pages.Event.Settings.Services.PaymentMethods.Methods.CustomPaymentLink.Title',
    description:
      'Pages.Event.Settings.Services.PaymentMethods.Methods.CustomPaymentLink.Description',
  },
  QR_PAYMENT: {
    title:
      'Pages.Event.Settings.Services.PaymentMethods.Methods.QRPayment.Title',
    description:
      'Pages.Event.Settings.Services.PaymentMethods.Methods.QRPayment.Description',
  },
  CASH: {
    title: 'Pages.Event.Settings.Services.PaymentMethods.Methods.Cash.Title',
    description:
      'Pages.Event.Settings.Services.PaymentMethods.Methods.Cash.Description',
  },
} as const satisfies Record<
  PaymentMethodType,
  { title: string; description: string }
>;

const VARIABLE_I18N_KEYS = {
  '#amount#':
    'Pages.Event.Settings.Services.PaymentMethods.CustomPaymentLink.Variables.amount',
  '#currency#':
    'Pages.Event.Settings.Services.PaymentMethods.CustomPaymentLink.Variables.currency',
  '#paymentreference#':
    'Pages.Event.Settings.Services.PaymentMethods.CustomPaymentLink.Variables.paymentreference',
  '#email#':
    'Pages.Event.Settings.Services.PaymentMethods.CustomPaymentLink.Variables.email',
  '#language#':
    'Pages.Event.Settings.Services.PaymentMethods.CustomPaymentLink.Variables.language',
} as const;

const STATUS_BADGE_VARIANTS: Record<
  PaymentMethodConfigurationStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  DISABLED: 'secondary',
  CONFIGURATION_REQUIRED: 'destructive',
  READY: 'default',
  UNAVAILABLE: 'outline',
};

function serialized(methods: EventPaymentMethodConfiguration[]): string {
  return JSON.stringify(methods);
}

function serializedBankAccount(bankAccount: BankAccountForm): string {
  return JSON.stringify({
    bankAccountName: bankAccount.bankAccountName.trim(),
    bankAccountIban: bankAccount.bankAccountIban.trim(),
  });
}

function validateMethods(
  methods: EventPaymentMethodConfiguration[],
  capabilities: PaymentCapabilities,
  t: TFunction
): ValidationErrors {
  const errors: ValidationErrors = { methods: {} };
  if (!methods.some(method => method.enabled)) {
    errors.global = t(
      'Pages.Event.Settings.Services.PaymentMethods.Validation.AtLeastOne'
    );
  }

  for (const method of methods) {
    const methodErrors: MethodErrors = {};
    if (
      method.type === 'OFEED_PAYMENT' &&
      method.enabled &&
      !capabilities.ofeedPaymentAvailable
    ) {
      methodErrors.method = t(
        'Pages.Event.Settings.Services.PaymentMethods.Validation.OFeedUnavailable'
      );
    }

    if (
      method.type === 'QR_PAYMENT' &&
      method.enabled &&
      !capabilities.qrPaymentAvailable
    ) {
      methodErrors.method = t(
        'Pages.Event.Settings.Services.PaymentMethods.Validation.BankAccountRequired'
      );
    }

    if (method.type === 'CUSTOM_PAYMENT_LINK' && method.enabled) {
      if (!method.displayName?.trim()) {
        methodErrors.displayName = t(
          'Pages.Event.Settings.Services.PaymentMethods.Validation.DisplayNameRequired'
        );
      }

      const template = method.paymentLinkTemplate?.trim() ?? '';
      if (!template) {
        methodErrors.paymentLinkTemplate = t(
          'Pages.Event.Settings.Services.PaymentMethods.Validation.PaymentLinkRequired'
        );
      } else {
        const unknownVariables = findUnknownPaymentLinkVariables(template);
        if (unknownVariables.length > 0) {
          methodErrors.paymentLinkTemplate = t(
            'Pages.Event.Settings.Services.PaymentMethods.Validation.UnknownVariables',
            { variables: unknownVariables.join(', ') }
          );
        } else if (!paymentLinkTemplateSchema.safeParse(template).success) {
          methodErrors.paymentLinkTemplate = t(
            'Pages.Event.Settings.Services.PaymentMethods.Validation.InvalidPaymentLink'
          );
        }
      }
    }

    if (Object.keys(methodErrors).length > 0)
      errors.methods[method.type] = methodErrors;
  }

  return errors;
}

function hasValidationErrors(errors: ValidationErrors): boolean {
  return Boolean(errors.global || Object.keys(errors.methods).length > 0);
}

export function PaymentMethodsSettings({
  eventId,
  t,
}: PaymentMethodsSettingsProps) {
  const { data, loading, error } = useQuery<EventPaymentMethodsData>(
    EVENT_PAYMENT_METHODS,
    {
      variables: { eventId },
    }
  );
  const [savePaymentMethods, { loading: saving }] =
    useMutation<UpdateEventPaymentMethodsData>(UPDATE_EVENT_PAYMENT_METHODS);
  const [methods, setMethods] = useState<EventPaymentMethodConfiguration[]>([]);
  const [bankAccount, setBankAccount] = useState<BankAccountForm>({
    bankAccountName: '',
    bankAccountIban: '',
  });
  const committedRef = useRef('');
  const committedBankAccountRef = useRef('');
  const paymentLinkInputRef = useRef<HTMLInputElement>(null);
  const navigationConfirmedRef = useRef(false);

  const capabilities = data?.eventPaymentMethods.paymentCapabilities ?? {
    ofeedPaymentAvailable: false,
    qrPaymentAvailable: false,
    bankAccountDisplay: null,
    bankAccountIban: null,
    bankAccountName: null,
  };
  const effectiveCapabilities = useMemo(
    () => ({
      ...capabilities,
      qrPaymentAvailable: Boolean(bankAccount.bankAccountIban.trim()),
      bankAccountDisplay:
        [bankAccount.bankAccountName.trim(), bankAccount.bankAccountIban.trim()]
          .filter(Boolean)
          .join(' - ') || null,
      bankAccountIban: bankAccount.bankAccountIban.trim() || null,
      bankAccountName: bankAccount.bankAccountName.trim() || null,
    }),
    [bankAccount.bankAccountIban, bankAccount.bankAccountName, capabilities]
  );

  useEffect(() => {
    const loaded = data?.eventPaymentMethods.paymentMethods;
    const loadedCapabilities = data?.eventPaymentMethods.paymentCapabilities;
    if (!loaded || !loadedCapabilities) return;
    const normalized = loaded.map(toPaymentMethodConfiguration);
    const loadedBankAccount = {
      bankAccountName: loadedCapabilities.bankAccountName ?? '',
      bankAccountIban: loadedCapabilities.bankAccountIban ?? '',
    };
    setMethods(normalized);
    setBankAccount(loadedBankAccount);
    committedRef.current = serialized(normalized);
    committedBankAccountRef.current = serializedBankAccount(loadedBankAccount);
  }, [data]);

  const dirty =
    methods.length > 0 &&
    (serialized(methods) !== committedRef.current ||
      serializedBankAccount(bankAccount) !== committedBankAccountRef.current);
  const validationErrors = useMemo(
    () => validateMethods(methods, effectiveCapabilities, t),
    [effectiveCapabilities, methods, t]
  );
  const valid = !hasValidationErrors(validationErrors);

  const blocker = useBlocker({
    shouldBlockFn: useCallback(() => dirty, [dirty]),
    enableBeforeUnload: dirty,
    disabled: !dirty,
    withResolver: true,
  });

  const updateMethod = (
    type: PaymentMethodType,
    patch: Partial<EventPaymentMethodConfiguration>
  ) => {
    setMethods(current =>
      current.map(method =>
        method.type === type ? { ...method, ...patch } : method
      )
    );
  };

  const toggleMethod = (
    method: EventPaymentMethodConfiguration,
    enabled: boolean
  ) => {
    const patch: Partial<EventPaymentMethodConfiguration> = { enabled };
    if (
      method.type === 'CUSTOM_PAYMENT_LINK' &&
      enabled &&
      !method.displayName?.trim()
    ) {
      patch.displayName = t(
        'Pages.Event.Settings.Services.PaymentMethods.CustomPaymentLink.DefaultDisplayName'
      );
    }
    updateMethod(method.type, patch);
  };

  const moveMethod = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= methods.length) return;
    setMethods(current => {
      const reordered = [...current];
      [reordered[index], reordered[targetIndex]] = [
        reordered[targetIndex]!,
        reordered[index]!,
      ];
      return reordered.map((method, position) => ({ ...method, position }));
    });
  };

  const insertVariable = (
    variable: (typeof PAYMENT_LINK_VARIABLES)[number]
  ) => {
    const customMethod = methods.find(
      method => method.type === 'CUSTOM_PAYMENT_LINK'
    );
    if (!customMethod) return;
    const input = paymentLinkInputRef.current;
    const currentValue = customMethod.paymentLinkTemplate ?? '';
    const start = input?.selectionStart ?? currentValue.length;
    const end = input?.selectionEnd ?? start;
    const nextValue = `${currentValue.slice(0, start)}${variable}${currentValue.slice(end)}`;
    updateMethod('CUSTOM_PAYMENT_LINK', { paymentLinkTemplate: nextValue });

    window.requestAnimationFrame(() => {
      paymentLinkInputRef.current?.focus();
      paymentLinkInputRef.current?.setSelectionRange(
        start + variable.length,
        start + variable.length
      );
    });
  };

  const save = async () => {
    if (!dirty || !valid || saving) return;
    try {
      const result = await savePaymentMethods({
        variables: {
          eventId,
          input: {
            paymentMethods: methods.map((method, position) => ({
              ...method,
              position,
              displayName: method.displayName?.trim() || null,
              paymentLinkTemplate: method.paymentLinkTemplate?.trim() || null,
            })),
            bankAccountName: bankAccount.bankAccountName.trim() || null,
            bankAccountIban: bankAccount.bankAccountIban.trim() || null,
          },
        },
      });
      const saved = result.data?.updateEventPaymentMethods.paymentMethods;
      const savedCapabilities =
        result.data?.updateEventPaymentMethods.paymentCapabilities;
      if (!saved || !savedCapabilities)
        throw new Error('Missing payment methods mutation result');
      const normalized = saved.map(toPaymentMethodConfiguration);
      const savedBankAccount = {
        bankAccountName: savedCapabilities.bankAccountName ?? '',
        bankAccountIban: savedCapabilities.bankAccountIban ?? '',
      };
      setMethods(normalized);
      setBankAccount(savedBankAccount);
      committedRef.current = serialized(normalized);
      committedBankAccountRef.current = serializedBankAccount(savedBankAccount);
      toast({
        title: t('Operations.Success', { ns: 'common' }),
        description: t(
          'Pages.Event.Settings.Services.PaymentMethods.Toast.Saved'
        ),
        variant: 'default',
      });
    } catch {
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description: t(
          'Pages.Event.Settings.Services.PaymentMethods.Toast.SaveError'
        ),
        variant: 'error',
      });
    }
  };

  return (
    <section className="space-y-4" aria-labelledby="payment-methods-title">
      <div>
        <h3 id="payment-methods-title" className="text-base font-semibold">
          {t('Pages.Event.Settings.Services.PaymentMethods.Title')}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('Pages.Event.Settings.Services.PaymentMethods.Description')}
        </p>
      </div>

      {loading && !data ? (
        <p className="text-sm text-muted-foreground">
          {t('Pages.Event.Settings.Services.PaymentMethods.Loading')}
        </p>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>
            {t('Pages.Event.Settings.Services.PaymentMethods.LoadError')}
          </AlertDescription>
        </Alert>
      ) : (
        <TooltipProvider>
          <div className="space-y-3">
            {methods.map((method, index) => {
              const keys = METHOD_I18N_KEYS[method.type];
              const status = getPaymentMethodConfigurationStatus(
                method,
                effectiveCapabilities
              );
              const methodErrors = validationErrors.methods[method.type];
              const switchDisabled =
                saving ||
                (method.type === 'OFEED_PAYMENT' &&
                  !capabilities.ofeedPaymentAvailable);
              const switchId = `payment-method-${method.type.toLowerCase()}`;

              return (
                <Card key={method.type} className="rounded-md shadow-sm">
                  <CardHeader className="gap-3 p-4 sm:flex-row sm:items-start sm:space-y-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Label
                          htmlFor={switchId}
                          className="text-sm font-semibold"
                        >
                          {t(keys.title)}
                        </Label>
                        <Badge variant={STATUS_BADGE_VARIANTS[status]}>
                          {t(
                            `Pages.Event.Settings.Services.PaymentMethods.Status.${status}`
                          )}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t(keys.description)}
                      </p>
                    </div>
                    <div className="flex min-h-9 shrink-0 items-center gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 sm:h-9 sm:w-9"
                            disabled={saving || index === 0}
                            aria-label={t(
                              'Pages.Event.Settings.Services.PaymentMethods.Actions.MoveUp'
                            )}
                            onClick={() => moveMethod(index, -1)}
                          >
                            <ArrowUp />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {t(
                            'Pages.Event.Settings.Services.PaymentMethods.Actions.MoveUp'
                          )}
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 sm:h-9 sm:w-9"
                            disabled={saving || index === methods.length - 1}
                            aria-label={t(
                              'Pages.Event.Settings.Services.PaymentMethods.Actions.MoveDown'
                            )}
                            onClick={() => moveMethod(index, 1)}
                          >
                            <ArrowDown />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {t(
                            'Pages.Event.Settings.Services.PaymentMethods.Actions.MoveDown'
                          )}
                        </TooltipContent>
                      </Tooltip>
                      <ToggleSwitch
                        id={switchId}
                        checked={method.enabled}
                        disabled={switchDisabled}
                        aria-label={t(
                          'Pages.Event.Settings.Services.PaymentMethods.Actions.Toggle',
                          {
                            name: t(keys.title),
                          }
                        )}
                        onCheckedChange={enabled =>
                          toggleMethod(method, enabled)
                        }
                      />
                    </div>
                  </CardHeader>

                  {(method.enabled || method.type === 'OFEED_PAYMENT') && (
                    <CardContent className="space-y-4 px-4 pb-4 pt-0">
                      {method.type === 'OFEED_PAYMENT' && (
                        <div className="space-y-3 border-t pt-4">
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="text-muted-foreground">
                              {t(
                                'Pages.Event.Settings.Services.PaymentMethods.Methods.OFeedPayment.Availability.Label'
                              )}
                            </span>
                            <Badge variant="outline">
                              {capabilities.ofeedPaymentAvailable
                                ? t(
                                    'Pages.Event.Settings.Services.PaymentMethods.Methods.OFeedPayment.Availability.Available'
                                  )
                                : t(
                                    'Pages.Event.Settings.Services.PaymentMethods.Methods.OFeedPayment.Availability.NotAvailable'
                                  )}
                            </Badge>
                          </div>
                          {!capabilities.ofeedPaymentAvailable && (
                            <Alert className="flex items-center gap-2 [&>svg]:static [&>svg+div]:translate-y-0 [&>svg~*]:pl-0">
                              <Info className="h-4 w-4 shrink-0" />
                              <AlertDescription className="leading-5">
                                {t(
                                  'Pages.Event.Settings.Services.PaymentMethods.Methods.OFeedPayment.Unavailable'
                                )}
                              </AlertDescription>
                            </Alert>
                          )}
                        </div>
                      )}

                      {method.type === 'CUSTOM_PAYMENT_LINK' &&
                        method.enabled && (
                          <div className="space-y-4 border-t pt-4">
                            <div className="space-y-2">
                              <Label htmlFor="custom-payment-display-name">
                                {t(
                                  'Pages.Event.Settings.Services.PaymentMethods.CustomPaymentLink.Fields.DisplayName'
                                )}
                              </Label>
                              <Input
                                id="custom-payment-display-name"
                                value={method.displayName ?? ''}
                                disabled={saving}
                                aria-invalid={Boolean(
                                  methodErrors?.displayName
                                )}
                                aria-describedby={
                                  methodErrors?.displayName
                                    ? 'custom-payment-display-name-error'
                                    : undefined
                                }
                                placeholder={t(
                                  'Pages.Event.Settings.Services.PaymentMethods.CustomPaymentLink.Fields.DisplayNamePlaceholder'
                                )}
                                onChange={event =>
                                  updateMethod('CUSTOM_PAYMENT_LINK', {
                                    displayName: event.target.value,
                                  })
                                }
                              />
                              <p className="text-xs text-muted-foreground">
                                {t(
                                  'Pages.Event.Settings.Services.PaymentMethods.CustomPaymentLink.Fields.DisplayNameHelper'
                                )}
                              </p>
                              {methodErrors?.displayName && (
                                <p
                                  id="custom-payment-display-name-error"
                                  className="text-xs text-destructive"
                                >
                                  {methodErrors.displayName}
                                </p>
                              )}
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="custom-payment-link">
                                {t(
                                  'Pages.Event.Settings.Services.PaymentMethods.CustomPaymentLink.Fields.PaymentLink'
                                )}
                              </Label>
                              <Input
                                ref={paymentLinkInputRef}
                                id="custom-payment-link"
                                type="url"
                                inputMode="url"
                                value={method.paymentLinkTemplate ?? ''}
                                disabled={saving}
                                aria-invalid={Boolean(
                                  methodErrors?.paymentLinkTemplate
                                )}
                                aria-describedby="custom-payment-link-help custom-payment-link-error"
                                placeholder="https://payment-provider.example/pay/#amount#/#paymentreference#"
                                onChange={event =>
                                  updateMethod('CUSTOM_PAYMENT_LINK', {
                                    paymentLinkTemplate: event.target.value,
                                  })
                                }
                              />
                              {methodErrors?.paymentLinkTemplate && (
                                <p
                                  id="custom-payment-link-error"
                                  className="text-xs text-destructive"
                                >
                                  {methodErrors.paymentLinkTemplate}
                                </p>
                              )}
                              <div
                                id="custom-payment-link-help"
                                className="space-y-3 text-xs text-muted-foreground"
                              >
                                <p className="whitespace-pre-line">
                                  {t(
                                    'Pages.Event.Settings.Services.PaymentMethods.CustomPaymentLink.Variables.Help'
                                  )}
                                </p>
                                <div className="grid gap-2 sm:grid-cols-2">
                                  {PAYMENT_LINK_VARIABLES.map(variable => {
                                    return (
                                      <div
                                        key={variable}
                                        className="flex items-start gap-2"
                                      >
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="h-7 shrink-0 px-2 font-mono text-xs"
                                          onClick={() =>
                                            insertVariable(variable)
                                          }
                                        >
                                          {variable}
                                        </Button>
                                        <span>
                                          {t(VARIABLE_I18N_KEYS[variable])}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                                <p>
                                  {t(
                                    'Pages.Event.Settings.Services.PaymentMethods.CustomPaymentLink.Variables.Example'
                                  )}{' '}
                                  <code className="break-all rounded bg-muted px-1 py-0.5 text-foreground">
                                    https://payment-provider.example/pay/#amount#/#paymentreference#
                                  </code>
                                </p>
                              </div>
                            </div>

                            <Alert className="border-amber-500/50 bg-amber-500/10">
                              <TriangleAlert className="text-amber-700 dark:text-amber-300" />
                              <AlertDescription>
                                {t(
                                  'Pages.Event.Settings.Services.PaymentMethods.CustomPaymentLink.Warning'
                                )}
                              </AlertDescription>
                            </Alert>
                          </div>
                        )}

                      {method.type === 'QR_PAYMENT' && method.enabled && (
                        <div className="space-y-4 border-t pt-4">
                          {!effectiveCapabilities.bankAccountDisplay && (
                            <Alert
                              variant="destructive"
                              className="flex items-center gap-2 [&>svg]:static [&>svg+div]:translate-y-0 [&>svg~*]:pl-0"
                            >
                              <TriangleAlert className="h-4 w-4 shrink-0" />
                              <AlertDescription>
                                {t(
                                  'Pages.Event.Settings.Services.PaymentMethods.Methods.QRPayment.BankAccountMissing'
                                )}
                              </AlertDescription>
                            </Alert>
                          )}
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor="qr-bank-account-name">
                                {t(
                                  'Pages.Event.Settings.Services.PaymentMethods.Methods.QRPayment.BankAccountName'
                                )}
                              </Label>
                              <Input
                                id="qr-bank-account-name"
                                value={bankAccount.bankAccountName}
                                disabled={saving}
                                placeholder={t(
                                  'Pages.Event.Settings.Services.PaymentMethods.Methods.QRPayment.BankAccountNamePlaceholder'
                                )}
                                onChange={event =>
                                  setBankAccount(current => ({
                                    ...current,
                                    bankAccountName: event.target.value,
                                  }))
                                }
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="qr-bank-account-iban">
                                {t(
                                  'Pages.Event.Settings.Services.PaymentMethods.Methods.QRPayment.BankAccountIban'
                                )}
                              </Label>
                              <Input
                                id="qr-bank-account-iban"
                                value={bankAccount.bankAccountIban}
                                disabled={saving}
                                aria-invalid={Boolean(methodErrors?.method)}
                                placeholder={t(
                                  'Pages.Event.Settings.Services.PaymentMethods.Methods.QRPayment.BankAccountIbanPlaceholder'
                                )}
                                onChange={event =>
                                  setBankAccount(current => ({
                                    ...current,
                                    bankAccountIban: event.target.value,
                                  }))
                                }
                              />
                            </div>
                          </div>
                          {effectiveCapabilities.bankAccountDisplay && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground">
                                {t(
                                  'Pages.Event.Settings.Services.PaymentMethods.Methods.QRPayment.BankAccount'
                                )}
                              </p>
                              <p className="mt-1 break-all text-sm font-medium">
                                {effectiveCapabilities.bankAccountDisplay}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {methodErrors?.method && (
                        <p className="text-xs text-destructive">
                          {methodErrors.method}
                        </p>
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        </TooltipProvider>
      )}

      {validationErrors.global && (
        <p className="text-sm text-destructive">{validationErrors.global}</p>
      )}

      <div className="flex justify-end">
        <Button
          type="button"
          disabled={!dirty || !valid || saving}
          onClick={() => void save()}
        >
          {saving && <Loader2 className="animate-spin" />}
          {saving
            ? t('Pages.Event.Settings.Services.PaymentMethods.Saving')
            : t('Pages.Event.Settings.Services.PaymentMethods.Save')}
        </Button>
      </div>

      <ConfirmDialog
        open={blocker.status === 'blocked'}
        onOpenChange={open => {
          if (!open && blocker.status === 'blocked') {
            if (navigationConfirmedRef.current) {
              navigationConfirmedRef.current = false;
            } else {
              blocker.reset();
            }
          }
        }}
        title={t('Pages.Event.Settings.Services.PaymentMethods.Unsaved.Title')}
        description={t(
          'Pages.Event.Settings.Services.PaymentMethods.Unsaved.Description'
        )}
        confirmText={t(
          'Pages.Event.Settings.Services.PaymentMethods.Unsaved.Confirm'
        )}
        cancelText={t(
          'Pages.Event.Settings.Services.PaymentMethods.Unsaved.Cancel'
        )}
        variant="destructive"
        onConfirm={() => {
          if (blocker.status === 'blocked') {
            navigationConfirmedRef.current = true;
            blocker.proceed();
          }
        }}
      />
    </section>
  );
}
