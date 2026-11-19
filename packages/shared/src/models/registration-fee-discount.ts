import { z } from 'zod';

export const registrationFeeDiscountSchema = z.object({
  pattern: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[\p{L}\p{N}*? _-]+$/u),
  allowPromoCode: z.boolean().optional(),
  discountPercent: z.number().min(0).max(100).multipleOf(0.01),
});

export const registrationFeeDiscountsSchema = z.array(registrationFeeDiscountSchema).max(30);
export type RegistrationFeeDiscount = z.infer<typeof registrationFeeDiscountSchema>;

/** Whole-string wildcard matching, with bounded input and no user-authored regex. */
export function matchesRegistrationPattern(registration: string, pattern: string): boolean {
  const value = registration.trim().toUpperCase();
  if (!value) return false;
  const glob = pattern.trim().toUpperCase();
  // Dynamic programming avoids backtracking even for patterns with many stars.
  let previous = Array<boolean>(value.length + 1).fill(false);
  previous[0] = true;
  for (const char of glob) {
    const current = Array<boolean>(value.length + 1).fill(false);
    current[0] = char === '*' && previous[0]!;
    for (let i = 1; i <= value.length; i++) {
      current[i] =
        char === '*'
          ? previous[i]! || current[i - 1]!
          : previous[i - 1]! && (char === '?' || char === value[i - 1]);
    }
    previous = current;
  }
  return previous[value.length]!;
}

export function applyRegistrationFeeDiscount(
  fee: number,
  registration: string | null | undefined,
  rules: readonly RegistrationFeeDiscount[] = []
): number {
  if (!registration) return fee;
  const discount = rules.reduce(
    (best, rule) =>
      matchesRegistrationPattern(registration, rule.pattern)
        ? Math.max(best, rule.discountPercent)
        : best,
    0
  );
  return Math.round((fee * (1 - discount / 100) + Number.EPSILON) * 100) / 100;
}

/** Resolve the winning rules; absent/zero discounts do not exclude an item. */
export function resolveRegistrationDiscount(
  registration: string | null | undefined,
  rules: readonly RegistrationFeeDiscount[] = []
) {
  const matches = registration
    ? rules.filter(rule => matchesRegistrationPattern(registration, rule.pattern))
    : [];
  const discountPercent = Math.max(0, ...matches.map(rule => rule.discountPercent));
  return {
    discountPercent,
    allowPromoCode:
      discountPercent === 0 ||
      matches
        .filter(rule => rule.discountPercent === discountPercent)
        .every(rule => rule.allowPromoCode === true),
  };
}
