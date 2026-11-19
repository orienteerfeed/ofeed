import { describe, expect, it } from 'vitest';
import { allocateEntryReportPrices } from '../entry-report-pricing.js';
describe('entry report line prices', () => {
  it('distributes rounding remainders without losing a cent', () => {
    const items = Array.from({ length: 3 }, () => ({
      fee: 1,
      cardRentalFee: null,
      allowPromoCode: true,
    }));
    expect(allocateEntryReportPrices(items, 0.01)).toEqual([0.99, 1, 1]);
  });
  it('discounts eligible entry and rental amounts only', () => {
    expect(
      allocateEntryReportPrices(
        [
          { fee: 75, cardRentalFee: 25, allowPromoCode: false },
          { fee: 100, cardRentalFee: 50, allowPromoCode: true },
        ],
        30,
      ),
    ).toEqual([100, 120]);
  });
  it('supports no discount, zero cost and 100% discounts', () => {
    expect(
      allocateEntryReportPrices([{ fee: 0, cardRentalFee: 0, allowPromoCode: true }], 0),
    ).toEqual([0]);
    expect(
      allocateEntryReportPrices([{ fee: 100, cardRentalFee: 50, allowPromoCode: true }], 150),
    ).toEqual([0]);
  });
});
