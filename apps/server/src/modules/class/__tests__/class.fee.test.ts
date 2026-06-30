import { describe, expect, it } from 'vitest';

import { computeClassFee } from '../class.fee.js';

const BEFORE = new Date('2026-05-01T10:00:00.000Z');
const DEADLINE = new Date('2026-05-08T23:59:59.000Z');
const AFTER = new Date('2026-05-10T10:00:00.000Z');

describe('computeClassFee', () => {
  it('returns all-null when base fee is null', () => {
    expect(
      computeClassFee({
        baseFee: null,
        now: AFTER,
        entriesCloseAt: DEADLINE,
        lateEntryFeePercent: 50,
        vatPayer: true,
        vatRate: 21,
      }),
    ).toEqual({ currentFee: null, feeNet: null, feeVat: null });
  });

  it('keeps the base fee before the deadline (no surcharge)', () => {
    const result = computeClassFee({
      baseFee: 200,
      now: BEFORE,
      entriesCloseAt: DEADLINE,
      lateEntryFeePercent: 50,
      vatPayer: false,
      vatRate: null,
    });
    expect(result.currentFee).toBe(200);
  });

  it('applies the late-entry surcharge after the deadline', () => {
    const result = computeClassFee({
      baseFee: 200,
      now: AFTER,
      entriesCloseAt: DEADLINE,
      lateEntryFeePercent: 50,
      vatPayer: false,
      vatRate: null,
    });
    expect(result.currentFee).toBe(300);
  });

  it('keeps the base fee after the deadline when late-entry fee is disabled', () => {
    const result = computeClassFee({
      baseFee: 200,
      now: AFTER,
      entriesCloseAt: DEADLINE,
      lateEntryFeePercent: 50,
      lateEntryFeeDisabled: true,
      vatPayer: false,
      vatRate: null,
    });
    expect(result.currentFee).toBe(200);
  });

  it('does not apply a surcharge when no deadline is set', () => {
    const result = computeClassFee({
      baseFee: 200,
      now: AFTER,
      entriesCloseAt: null,
      lateEntryFeePercent: 50,
      vatPayer: false,
      vatRate: null,
    });
    expect(result.currentFee).toBe(200);
  });

  it('does not apply a surcharge when percent is null', () => {
    const result = computeClassFee({
      baseFee: 200,
      now: AFTER,
      entriesCloseAt: DEADLINE,
      lateEntryFeePercent: null,
      vatPayer: false,
      vatRate: null,
    });
    expect(result.currentFee).toBe(200);
  });

  it('splits VAT out of the gross price for a VAT payer', () => {
    const result = computeClassFee({
      baseFee: 242,
      now: BEFORE,
      entriesCloseAt: DEADLINE,
      lateEntryFeePercent: null,
      vatPayer: true,
      vatRate: 21,
    });
    // 242 gross @ 21 % → net 200.00, VAT 42.00
    expect(result).toEqual({ currentFee: 242, feeNet: 200, feeVat: 42 });
  });

  it('computes VAT on the surcharged price after the deadline', () => {
    const result = computeClassFee({
      baseFee: 242,
      now: AFTER,
      entriesCloseAt: DEADLINE,
      lateEntryFeePercent: 50,
      vatPayer: true,
      vatRate: 21,
    });
    // 242 × 1.5 = 363 gross @ 21 % → net 300.00, VAT 63.00
    expect(result).toEqual({ currentFee: 363, feeNet: 300, feeVat: 63 });
  });

  it('treats a non-payer as net = gross and zero VAT even if a rate is present', () => {
    const result = computeClassFee({
      baseFee: 150,
      now: BEFORE,
      entriesCloseAt: DEADLINE,
      lateEntryFeePercent: null,
      vatPayer: false,
      vatRate: 21,
    });
    expect(result).toEqual({ currentFee: 150, feeNet: 150, feeVat: 0 });
  });

  it('rounds money values to two decimals', () => {
    const result = computeClassFee({
      baseFee: 100,
      now: BEFORE,
      entriesCloseAt: DEADLINE,
      lateEntryFeePercent: null,
      vatPayer: true,
      vatRate: 21,
    });
    // 100 / 1.21 = 82.6446… → 82.64; VAT = 17.36
    expect(result).toEqual({ currentFee: 100, feeNet: 82.64, feeVat: 17.36 });
  });
});
