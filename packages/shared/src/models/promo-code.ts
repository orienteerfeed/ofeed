import { z } from 'zod';

export const promoCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(3)
  .max(40)
  .regex(/^[A-Z0-9_-]+$/);
export const createPromoCodeSchema = z.object({
  code: promoCodeSchema,
  discountPercent: z.number().positive().max(100).multipleOf(0.01),
});
export function computePromoDiscount(
  items: readonly { fee: number; cardRentalFee: number | null; allowPromoCode?: boolean }[],
  percent: number
) {
  const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  const subtotal = round(
    items.reduce((sum, item) => sum + item.fee + (item.cardRentalFee ?? 0), 0)
  );
  const eligibleAmount = round(
    items.reduce(
      (sum, item) =>
        sum + (item.allowPromoCode === false ? 0 : item.fee + (item.cardRentalFee ?? 0)),
      0
    )
  );
  const discountAmount = round((eligibleAmount * percent) / 100);
  return {
    subtotal,
    eligibleAmount,
    discountAmount,
    totalAmount: round(subtotal - discountAmount),
    excludedItems: items.filter(item => item.allowPromoCode === false).length,
  };
}
