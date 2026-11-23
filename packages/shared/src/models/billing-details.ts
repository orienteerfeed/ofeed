import { z } from 'zod';

export const billingDetailsSchema = z.object({
  name: z.string().trim().min(1).max(191),
  street: z.string().trim().min(1).max(191),
  city: z.string().trim().min(1).max(191),
  postalCode: z.string().trim().min(1).max(20),
  country: z.string().trim().min(1).max(100),
  companyId: z.string().trim().max(32).optional(),
  vatId: z.string().trim().max(32).optional(),
});
export const organizerDetailsSchema = billingDetailsSchema.extend({
  aresVerifiedAt: z.string().datetime().optional(),
  companyId: z.string().trim().min(1).max(32),
});
export const settlementSettingsSchema = z
  .object({
    enabled: z.boolean(),
    organizer: organizerDetailsSchema.nullable(),
  })
  .refine(value => !value.enabled || value.organizer !== null, {
    message: 'Organizer details are required to enable settlements.',
    path: ['organizer'],
  });
export type BillingDetails = z.infer<typeof billingDetailsSchema>;
export type OrganizerDetails = z.infer<typeof organizerDetailsSchema>;
export type SettlementSettings = z.infer<typeof settlementSettingsSchema>;
