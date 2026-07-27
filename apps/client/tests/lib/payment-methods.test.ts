import {
  createQrPaymentInstruction,
  getPaymentMethodConfigurationStatus,
  paymentLinkTemplateSchema,
  replacePaymentLinkVariables,
  type EventPaymentMethodConfiguration,
} from '@repo/shared';
import { describe, expect, it } from 'vitest';

describe('payment link templates', () => {
  it('accepts a valid HTTPS payment link and trims it', () => {
    expect(
      paymentLinkTemplateSchema.parse(
        '  https://payment-provider.example/pay/#amount#/#paymentreference#  '
      )
    ).toBe('https://payment-provider.example/pay/#amount#/#paymentreference#');
  });

  it.each([
    'http://payment-provider.example/pay/#amount#',
    '/pay/#amount#',
    'https://payment..example/pay/#amount#',
    'https://payment-provider.example/pay/#unknownvariable#',
  ])('rejects invalid template %s', template => {
    expect(paymentLinkTemplateSchema.safeParse(template).success).toBe(false);
  });

  it('replaces and URL-encodes all supported variables', () => {
    const result = replacePaymentLinkVariables(
      'https://payment-provider.example/#amount#/#currency#/#paymentreference#/#email#/#language#',
      {
        amount: '650.50',
        currency: 'CZK',
        paymentReference: 'order / 123',
        email: 'runner+test@example.com',
        language: 'cs CZ',
      }
    );

    expect(result).toBe(
      'https://payment-provider.example/650.50/CZK/order%20%2F%20123/runner%2Btest%40example.com/cs%20CZ'
    );
  });

  it('replaces an empty optional email with an empty string', () => {
    expect(
      replacePaymentLinkVariables(
        'https://payment-provider.example/?email=#email#',
        {
          amount: '650',
          currency: 'CZK',
          paymentReference: '2026000123',
          email: null,
          language: 'cs',
        }
      )
    ).toBe('https://payment-provider.example/?email=');
  });

  it('normalizes a decimal comma in the payment amount', () => {
    expect(
      replacePaymentLinkVariables('https://payment-provider.example/#amount#', {
        amount: '650,50',
        currency: 'CZK',
        paymentReference: '2026000123',
        language: 'cs',
      })
    ).toBe('https://payment-provider.example/650.50');
  });
});

describe('QR Platba instructions', () => {
  it('creates a normalized SPAYD payload with the payment reference', () => {
    expect(
      createQrPaymentInstruction({
        bankAccountIban: 'cz65 0800 0000 1920 0014 5399',
        bankAccountName: '  OK Chrudim  ',
        amount: 250.5,
        currency: 'czk',
        paymentReference: '2612345678',
        message: 'OFeed QR payment - Novak Jan',
      })
    ).toEqual({
      payload:
        'SPD*1.0*ACC:CZ6508000000192000145399*AM:250.50*CC:CZK*X-VS:2612345678*X-KS:0308*MSG:OFeed QR payment - Novak Jan',
      bankAccountIban: 'CZ6508000000192000145399',
      bankAccountName: 'OK Chrudim',
      amount: 250.5,
      currency: 'CZK',
      paymentReference: '2612345678',
      constantSymbol: '0308',
      recipientMessage: 'OFeed QR payment - Novak Jan',
    });
  });
});

describe('payment method configuration status', () => {
  const capabilities = {
    ofeedPaymentAvailable: true,
    qrPaymentAvailable: true,
  };
  const method = (
    patch: Partial<EventPaymentMethodConfiguration>
  ): EventPaymentMethodConfiguration => ({
    type: 'CASH',
    enabled: true,
    position: 0,
    displayName: null,
    paymentLinkTemplate: null,
    ...patch,
  });

  it('returns every supported status according to configuration and capabilities', () => {
    expect(
      getPaymentMethodConfigurationStatus(
        method({ enabled: false }),
        capabilities
      )
    ).toBe('DISABLED');
    expect(
      getPaymentMethodConfigurationStatus(
        method({
          type: 'CUSTOM_PAYMENT_LINK',
          displayName: '',
          paymentLinkTemplate: '',
        }),
        capabilities
      )
    ).toBe('CONFIGURATION_REQUIRED');
    expect(getPaymentMethodConfigurationStatus(method({}), capabilities)).toBe(
      'READY'
    );
    expect(
      getPaymentMethodConfigurationStatus(method({ type: 'OFEED_PAYMENT' }), {
        ...capabilities,
        ofeedPaymentAvailable: false,
      })
    ).toBe('UNAVAILABLE');
    expect(
      getPaymentMethodConfigurationStatus(method({ type: 'QR_PAYMENT' }), {
        ...capabilities,
        qrPaymentAvailable: false,
      })
    ).toBe('CONFIGURATION_REQUIRED');
  });
});
