import { describe, expect, it } from 'vitest';

import {
  formatCsosUnifiedEntryExport,
  formatProcessedEntryItemsCsv,
} from '@/pages/Event/Entries/entries.utils';

describe('formatCsosUnifiedEntryExport', () => {
  it('uses the fixed-width ČSOS unified entry format and adds the rental-card note', () => {
    const result = formatCsosUnifiedEntryExport([
      {
        registration: 'xxx9999',
        className: 'D21C',
        card: 1234567,
        lastname: 'Novák',
        firstname: 'Jana',
        license: 'A',
        note: null,
        cardRental: true,
      },
    ]);

    expect(result).toBe(
      'XXX9999 D21C       1234567    Novák Jana                A zapůjčit čip'
    );
    expect(result.indexOf('D21C')).toBe(8);
    expect(result.indexOf('1234567')).toBe(19);
    expect(result.indexOf('Novák Jana')).toBe(30);
    expect(result.indexOf('A zapůjčit čip')).toBe(56);
  });

  it('preserves an existing rental-card note without appending it twice', () => {
    const result = formatCsosUnifiedEntryExport([
      {
        registration: 'ABC1234',
        className: 'H21',
        card: null,
        lastname: 'Novák',
        firstname: 'Jan',
        license: null,
        note: 'zapujcit cip',
        cardRental: true,
      },
    ]);

    expect(result).toContain(' zapujcit cip');
    expect(result).not.toContain('zapujcit cip; zapůjčit čip');
  });

  it('produces an item-level CSV with payment fields and prices', () => {
    const result = formatProcessedEntryItemsCsv([
      {
        entryId: 'entry-1',
        entryItemId: 42,
        actionKey: 'NEW_ENTRY',
        className: 'D21C',
        registration: 'ABC1234',
        lastname: 'Nováková',
        firstname: 'Jana',
        card: 1234567,
        fee: 154,
        cardRentalFee: 50,
        orderTotalAmount: 204,
        currency: 'CZK',
        paymentReference: '2612345678',
        paymentMethod: 'QR_PAYMENT',
        contactEmail: 'jana@example.test',
      },
    ]);

    expect(result).toBe(
      'entry_id;entry_item_id;item_type;category;registration;lastname;firstname;card_number;entry_fee;card_rental_fee;item_total;entry_total;currency;variable_symbol;constant_symbol;payment_method;contact_email\r\n' +
        'entry-1;42;NEW_ENTRY;D21C;ABC1234;Nováková;Jana;1234567;154.00;50.00;204.00;204.00;CZK;2612345678;0308;QR_PAYMENT;jana@example.test'
    );
  });
});
