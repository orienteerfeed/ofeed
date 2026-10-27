import { describe, expect, it } from 'vitest';
import {
  bankAccountIbanSchema,
  createQrPaymentInstruction,
  normalizeBankAccountIban,
  updateEventPaymentMethodsInputSchema,
} from '@repo/shared';

describe('bank account normalization (#601)', () => {
  it.each([
    ['2201340123/2010', 'CZ8020100000002201340123'],
    ['000000-2201340123/2010', 'CZ8020100000002201340123'],
    ['19-2000145399/0800', 'CZ6508000000192000145399'],
    ['000019-2000145399/0800', 'CZ6508000000192000145399'],
    ['19/0800', 'CZ3308000000000000000019'],
    ['000000-0000000019/0800', 'CZ3308000000000000000019'],
    [' 19 - 2000145399 / 0800 ', 'CZ6508000000192000145399'],
    ['\tcz80 2010 0000 0022 0134 0123\n', 'CZ8020100000002201340123'],
    ['gb82 west 1234 5698 7654 32', 'GB82WEST12345698765432'],
    ['DE89 3704 0044 0532 0130 00', 'DE89370400440532013000'],
  ])('normalizes %j to %s', (input, iban) => {
    expect(normalizeBankAccountIban(input)).toBe(iban);
    expect(bankAccountIbanSchema.parse(input)).toBe(iban);
    expect(normalizeBankAccountIban(iban)).toBe(iban);
  });

  it.each([
    '',
    ' ',
    '2201340123',
    '2201340123/201',
    '2201340123/20100',
    '22013401230/2010',
    '1000019-2000145399/0800',
    '19--2000145399/0800',
    '20-2000145399/0800',
    '2201340124/2010',
    '0/2010',
    '000000-0000000000/2010',
    '2201340123/0000',
    'abc/2010',
    'CZ8120100000002201340123',
    'CZ802010000000220134012',
    'GB83WEST12345698765432',
    'CZ5320100000002201340124',
  ])('rejects invalid account %j', input => {
    expect(normalizeBankAccountIban(input)).toBeNull();
    expect(bankAccountIbanSchema.safeParse(input).success).toBe(false);
  });

  it.each([null, '', '   ', undefined])(
    'keeps empty settings input %j supported',
    value => {
      expect(
        updateEventPaymentMethodsInputSchema.safeParse({
          paymentMethods: [{ type: 'CASH', enabled: true, position: 0 }],
          bankAccount: { bankAccountIban: value },
        }).success
      ).toBe(true);
    }
  );

  it('normalizes domestic settings input at the shared validation boundary', () => {
    const input = updateEventPaymentMethodsInputSchema.parse({
      paymentMethods: [{ type: 'QR_PAYMENT', enabled: true, position: 0 }],
      bankAccount: { bankAccountIban: '2201340123/2010' },
    });
    expect(input.bankAccount?.bankAccountIban).toBe('CZ8020100000002201340123');
  });

  it('builds QR ACC as Czech IBAN even for an existing domestic account', () => {
    const result = createQrPaymentInstruction({
      bankAccountIban: '2201340123/2010',
      amount: 250,
      currency: 'CZK',
      paymentReference: '1234',
      message: 'Test payment',
    });
    expect(result.bankAccountIban).toBe('CZ8020100000002201340123');
    expect(result.payload).toContain('*ACC:CZ8020100000002201340123*');
    expect(result.payload).not.toContain('/2010');
  });
});
