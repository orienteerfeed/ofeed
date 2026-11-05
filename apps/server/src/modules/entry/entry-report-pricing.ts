/** Allocate a saved order promo discount without losing a cent to rounding. */
export function allocateEntryReportPrices(
  items: readonly { fee: number; cardRentalFee: number | null; allowPromoCode: boolean }[],
  discountAmount: number,
): number[] {
  const amounts = items.map((item) => Math.round((item.fee + (item.cardRentalFee ?? 0)) * 100));
  const eligible = amounts.reduce(
    (sum, amount, index) => sum + (items[index]!.allowPromoCode ? amount : 0),
    0,
  );
  const discount = Math.min(eligible, Math.max(0, Math.round(discountAmount * 100)));
  if (!eligible || !discount) return amounts.map((amount) => amount / 100);
  const shares = amounts.map((amount, index) =>
    items[index]!.allowPromoCode ? (amount * discount) / eligible : 0,
  );
  const allocated = shares.map(Math.floor);
  let remaining = discount - allocated.reduce((sum, amount) => sum + amount, 0);
  const ranked = shares
    .map((share, index) => ({ index, remainder: share - allocated[index]! }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of ranked) {
    if (remaining-- <= 0) break;
    allocated[index]!++;
  }
  return amounts.map((amount, index) => (amount - allocated[index]!) / 100);
}
