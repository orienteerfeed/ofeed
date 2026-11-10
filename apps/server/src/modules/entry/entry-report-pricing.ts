/** Split `cents` (>= 0) proportionally to `weights` using largest-remainder rounding. */
function splitCents(weights: readonly number[], cents: number): number[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  // A free order still needs a positive adjustment shown somewhere: split it evenly.
  const effective = total ? weights : weights.map(() => 1);
  const effectiveTotal = total || weights.length;
  const shares = effective.map((weight) => (weight * cents) / effectiveTotal);
  const allocated = shares.map(Math.floor);
  let remaining = cents - allocated.reduce((sum, amount) => sum + amount, 0);
  const ranked = shares
    .map((share, index) => ({ index, remainder: share - allocated[index]! }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of ranked) {
    if (remaining-- <= 0) break;
    allocated[index]!++;
  }
  return allocated;
}

/**
 * Allocate a saved order promo discount and manual price adjustment to line prices
 * without losing a cent to rounding, so the lines always sum to the order total.
 */
export function allocateEntryReportPrices(
  items: readonly { fee: number; cardRentalFee: number | null; allowPromoCode: boolean }[],
  discountAmount: number,
  priceAdjustment = 0,
): number[] {
  const amounts = items.map((item) => Math.round((item.fee + (item.cardRentalFee ?? 0)) * 100));
  const eligibleWeights = amounts.map((amount, index) =>
    items[index]!.allowPromoCode ? amount : 0,
  );
  const eligible = eligibleWeights.reduce((sum, amount) => sum + amount, 0);
  const discount = Math.min(eligible, Math.max(0, Math.round(discountAmount * 100)));
  const promoted = discount
    ? splitCents(eligibleWeights, discount).map((share, index) => amounts[index]! - share)
    : amounts;
  const adjustment = Math.round(priceAdjustment * 100);
  if (!adjustment || !promoted.length) return promoted.map((amount) => amount / 100);
  // Lines may be a subset of the order (NEW_ENTRY only): never price a line below zero.
  const sign = Math.sign(adjustment);
  const lineTotal = promoted.reduce((sum, amount) => sum + amount, 0);
  const magnitude = sign < 0 ? Math.min(-adjustment, lineTotal) : adjustment;
  const shares = splitCents(promoted, magnitude);
  return promoted.map((amount, index) => (amount + sign * shares[index]!) / 100);
}
