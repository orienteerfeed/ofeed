import type { RegistrationFeeDiscount } from '@repo/shared';
import { builder } from '../../graphql/builder.js';
import { SYSTEM_EVENT_SERVICE_KEYS } from './event-services.service.js';

export const EventServiceSystemKeyRef = builder.enumType('EventServiceSystemKey', {
  values: SYSTEM_EVENT_SERVICE_KEYS,
});

export const RegistrationFeeDiscountRef = builder
  .objectRef<RegistrationFeeDiscount>('RegistrationFeeDiscount')
  .implement({
    fields: (t) => ({
      allowPromoCode: t.boolean({ resolve: (rule) => rule.allowPromoCode ?? false }),
      pattern: t.exposeString('pattern'),
      discountPercent: t.exposeFloat('discountPercent'),
    }),
  });

export const RegistrationFeeDiscountInputRef = builder.inputType('RegistrationFeeDiscountInput', {
  fields: (t) => ({
    allowPromoCode: t.boolean({ required: false }),
    pattern: t.string({ required: true }),
    discountPercent: t.float({ required: true }),
  }),
});
