/**
 * Pure entry-fee computation for a class. No DB access, no side effects —
 * directly unit-testable.
 *
 * The stored `Class.fee` is the gross price (incl. VAT) a competitor pays. After
 * the event's entry deadline (`entriesCloseAt`) an optional global percentage
 * surcharge (`lateEntryFeePercent`) is applied. The VAT breakdown is derived
 * from the gross price only when the event is a VAT payer; otherwise net equals
 * gross and VAT is zero.
 */

export interface ComputeClassFeeInput {
  /** Base gross fee stored on the class, or null when no fee is set. */
  baseFee: number | null;
  /** Current time, compared against the deadline. */
  now: Date;
  /** Event entry deadline; the surcharge applies only after it. */
  entriesCloseAt: Date | null;
  /** Global percentage surcharge after the deadline (e.g. 50 for +50 %). */
  lateEntryFeePercent: number | null;
  /** Whether the event organiser is a VAT payer. */
  vatPayer: boolean;
  /** VAT rate in percent (e.g. 21 for 21 %); only used when `vatPayer`. */
  vatRate: number | null;
}

export interface ComputedClassFee {
  /** Effective gross price after any late-entry surcharge. */
  currentFee: number | null;
  /** Net price (excl. VAT). Equals `currentFee` for non-payers. */
  feeNet: number | null;
  /** VAT amount. Zero for non-payers. */
  feeVat: number | null;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function computeClassFee(input: ComputeClassFeeInput): ComputedClassFee {
  const { baseFee, now, entriesCloseAt, lateEntryFeePercent, vatPayer, vatRate } = input;

  if (baseFee === null) {
    return { currentFee: null, feeNet: null, feeVat: null };
  }

  const afterDeadline = entriesCloseAt !== null && now.getTime() > entriesCloseAt.getTime();
  const surchargePercent = afterDeadline && lateEntryFeePercent ? lateEntryFeePercent : 0;
  const currentFee = round2(baseFee * (1 + surchargePercent / 100));

  if (vatPayer && vatRate) {
    const feeNet = round2(currentFee / (1 + vatRate / 100));
    const feeVat = round2(currentFee - feeNet);
    return { currentFee, feeNet, feeVat };
  }

  return { currentFee, feeNet: currentFee, feeVat: 0 };
}
