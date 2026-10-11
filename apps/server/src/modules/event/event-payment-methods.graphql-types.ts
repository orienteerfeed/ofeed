import { PAYMENT_METHOD_TYPES, paymentMethodConfigurationStatusSchema } from '@repo/shared';

import { builder } from '../../graphql/builder.js';

export const PaymentMethodTypeRef = builder.enumType('PaymentMethodType', {
  values: PAYMENT_METHOD_TYPES,
});

export const PaymentMethodConfigurationStatusRef = builder.enumType(
  'PaymentMethodConfigurationStatus',
  {
    values: paymentMethodConfigurationStatusSchema.options,
  },
);
