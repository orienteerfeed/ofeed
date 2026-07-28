import { z } from 'zod';

export const PAYMENT_METHOD_TYPES = [
  'OFEED_PAYMENT',
  'CUSTOM_PAYMENT_LINK',
  'QR_PAYMENT',
  'CASH',
] as const;

export const PAYMENT_LINK_VARIABLES = [
  '#amount#',
  '#currency#',
  '#paymentreference#',
  '#email#',
  '#language#',
] as const;

export const paymentMethodTypeSchema = z.enum(PAYMENT_METHOD_TYPES);

export const paymentMethodConfigurationStatusSchema = z.enum([
  'DISABLED',
  'CONFIGURATION_REQUIRED',
  'READY',
  'UNAVAILABLE',
]);

const paymentLinkVariablePattern = /#[A-Za-z][A-Za-z0-9_]*#/g;
const supportedPaymentLinkVariables = new Set<string>(PAYMENT_LINK_VARIABLES);
const hostnameLabelPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

function isValidHostname(hostname: string): boolean {
  return (
    hostname.length <= 253 &&
    hostname.includes('.') &&
    hostname.split('.').every(label => hostnameLabelPattern.test(label))
  );
}

export function findUnknownPaymentLinkVariables(template: string): string[] {
  return [
    ...new Set(
      (template.match(paymentLinkVariablePattern) ?? []).filter(
        variable => !supportedPaymentLinkVariables.has(variable)
      )
    ),
  ];
}

export const paymentLinkTemplateSchema = z
  .string()
  .transform(value => value.trim())
  .superRefine((value, context) => {
    if (!value) {
      context.addIssue({ code: 'custom', message: 'Payment link is required.' });
      return;
    }

    if (/\s/.test(value)) {
      context.addIssue({ code: 'custom', message: 'Payment link must not contain spaces.' });
    }

    let url: URL;
    try {
      url = new URL(value);
    } catch {
      context.addIssue({ code: 'custom', message: 'Payment link must be an absolute URL.' });
      return;
    }

    if (url.protocol !== 'https:') {
      context.addIssue({ code: 'custom', message: 'Payment link must use HTTPS.' });
    }

    if (!isValidHostname(url.hostname)) {
      context.addIssue({ code: 'custom', message: 'Payment link must contain a valid hostname.' });
    }

    const unknownVariables = findUnknownPaymentLinkVariables(value);
    if (unknownVariables.length > 0) {
      context.addIssue({
        code: 'custom',
        message: `Unsupported payment link variable: ${unknownVariables.join(', ')}.`,
      });
    }
  });

export const eventPaymentMethodConfigurationSchema = z.object({
  type: paymentMethodTypeSchema,
  enabled: z.boolean(),
  position: z.number().int().min(0).max(255),
  displayName: z.string().max(128).nullable().optional(),
  paymentLinkTemplate: z.string().nullable().optional(),
});

export const updateEventPaymentMethodsInputSchema = z
  .object({
    paymentMethods: z.array(eventPaymentMethodConfigurationSchema).min(1).max(4),
    bankAccount: z
      .object({
        bankAccountName: z.string().trim().max(191).nullable().optional(),
        bankAccountIban: z.string().trim().max(34).nullable().optional(),
      })
      .optional(),
  })
  .superRefine((input, context) => {
    const types = new Set<string>();
    const positions = new Set<number>();

    input.paymentMethods.forEach((method, index) => {
      if (types.has(method.type)) {
        context.addIssue({
          code: 'custom',
          path: ['paymentMethods', index, 'type'],
          message: 'Payment method types must be unique.',
        });
      }
      types.add(method.type);

      if (positions.has(method.position)) {
        context.addIssue({
          code: 'custom',
          path: ['paymentMethods', index, 'position'],
          message: 'Payment method positions must be unique.',
        });
      }
      positions.add(method.position);

      if (method.type !== 'CUSTOM_PAYMENT_LINK' || !method.enabled) return;

      if (!method.displayName?.trim()) {
        context.addIssue({
          code: 'custom',
          path: ['paymentMethods', index, 'displayName'],
          message: 'Payment method name is required.',
        });
      }

      const paymentLinkResult = paymentLinkTemplateSchema.safeParse(
        method.paymentLinkTemplate ?? ''
      );
      if (!paymentLinkResult.success) {
        paymentLinkResult.error.issues.forEach(issue => {
          context.addIssue({
            code: 'custom',
            path: ['paymentMethods', index, 'paymentLinkTemplate'],
            message: issue.message,
          });
        });
      }
    });

    if (!input.paymentMethods.some(method => method.enabled)) {
      context.addIssue({
        code: 'custom',
        path: ['paymentMethods'],
        message: 'At least one payment method must be enabled.',
      });
    }
  });

export const paymentLinkVariablesSchema = z.object({
  amount: z.string(),
  currency: z.string(),
  paymentReference: z.string(),
  email: z.string().nullable().optional(),
  language: z.string(),
});

export type PaymentMethodType = z.infer<typeof paymentMethodTypeSchema>;
export type PaymentMethodConfigurationStatus = z.infer<
  typeof paymentMethodConfigurationStatusSchema
>;
export type EventPaymentMethodConfiguration = z.infer<typeof eventPaymentMethodConfigurationSchema>;
export type UpdateEventPaymentMethodsInput = z.input<typeof updateEventPaymentMethodsInputSchema>;
export type PaymentLinkVariables = z.infer<typeof paymentLinkVariablesSchema>;

/**
 * Payment instructions encoded according to the Czech QR Platba / SPAYD
 * standard. The payload can be rendered as a QR code or passed to a banking
 * application through its `spayd://` URI handler.
 */
export const qrPaymentInstructionSchema = z.object({
  payload: z.string().min(1),
  bankAccountIban: z.string().min(1),
  bankAccountName: z.string().nullable(),
  amount: z.number().nonnegative(),
  currency: z.string().length(3),
  paymentReference: z.string().min(1),
  constantSymbol: z.string().min(1),
  recipientMessage: z.string(),
});

export type QrPaymentInstruction = z.infer<typeof qrPaymentInstructionSchema>;

export interface CreateQrPaymentInstructionInput {
  bankAccountIban: string;
  bankAccountName?: string | null;
  amount: number;
  currency: string;
  paymentReference: string;
  message: string;
  constantSymbol?: string;
}

function spaydValue(value: string): string {
  return value.replaceAll(/[\r\n*]/g, '').trim();
}

/** Build a QR Platba (SPAYD 1.0) payload from server-authoritative order data. */
export function createQrPaymentInstruction({
  bankAccountIban,
  bankAccountName,
  amount,
  currency,
  paymentReference,
  message,
  constantSymbol = '0308',
}: CreateQrPaymentInstructionInput): QrPaymentInstruction {
  const normalizedIban = bankAccountIban.replaceAll(/\s/g, '').toUpperCase();
  const normalizedCurrency = spaydValue(currency).toUpperCase();
  const normalizedReference = spaydValue(paymentReference);
  const normalizedMessage = spaydValue(message);
  const normalizedConstantSymbol = spaydValue(constantSymbol);

  return {
    payload: [
      'SPD',
      '1.0',
      `ACC:${normalizedIban}`,
      `AM:${amount.toFixed(2)}`,
      `CC:${normalizedCurrency}`,
      `X-VS:${normalizedReference}`,
      `X-KS:${normalizedConstantSymbol}`,
      `MSG:${normalizedMessage}`,
    ].join('*'),
    bankAccountIban: normalizedIban,
    bankAccountName: bankAccountName?.trim() || null,
    amount,
    currency: normalizedCurrency,
    paymentReference: normalizedReference,
    constantSymbol: normalizedConstantSymbol,
    recipientMessage: normalizedMessage,
  };
}

/** A payment method that can be presented to an entrant during checkout. */
export const availableEventPaymentMethodSchema = z.object({
  type: paymentMethodTypeSchema,
  /** Configured customer-facing name, used by custom payment links. */
  displayName: z.string().nullable(),
});

export type AvailableEventPaymentMethod = z.infer<typeof availableEventPaymentMethodSchema>;

export type PaymentMethodCapabilities = {
  ofeedPaymentAvailable: boolean;
  qrPaymentAvailable: boolean;
};

export function getPaymentMethodConfigurationStatus(
  method: EventPaymentMethodConfiguration,
  capabilities: PaymentMethodCapabilities
): PaymentMethodConfigurationStatus {
  if (method.type === 'OFEED_PAYMENT' && !capabilities.ofeedPaymentAvailable) {
    return 'UNAVAILABLE';
  }

  if (!method.enabled) return 'DISABLED';

  if (method.type === 'CUSTOM_PAYMENT_LINK') {
    if (!method.displayName?.trim()) return 'CONFIGURATION_REQUIRED';
    if (!paymentLinkTemplateSchema.safeParse(method.paymentLinkTemplate ?? '').success) {
      return 'CONFIGURATION_REQUIRED';
    }
  }

  if (method.type === 'QR_PAYMENT' && !capabilities.qrPaymentAvailable) {
    return 'CONFIGURATION_REQUIRED';
  }

  return 'READY';
}

export function replacePaymentLinkVariables(
  template: string,
  variables: PaymentLinkVariables
): string {
  const values: Record<(typeof PAYMENT_LINK_VARIABLES)[number], string> = {
    '#amount#': variables.amount.trim().replace(',', '.'),
    '#currency#': variables.currency,
    '#paymentreference#': variables.paymentReference,
    '#email#': variables.email ?? '',
    '#language#': variables.language,
  };

  return PAYMENT_LINK_VARIABLES.reduce(
    (result, variable) => result.replaceAll(variable, encodeURIComponent(values[variable])),
    template
  );
}
