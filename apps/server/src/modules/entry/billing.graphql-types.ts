import type { BillingDetails, OrganizerDetails } from '@repo/shared';
import { builder } from '../../graphql/builder.js';

export const BillingDetailsRef = builder.objectRef<BillingDetails>('BillingDetails').implement({
  fields: (t) => ({
    name: t.exposeString('name'),
    street: t.exposeString('street'),
    city: t.exposeString('city'),
    postalCode: t.exposeString('postalCode'),
    country: t.exposeString('country'),
    companyId: t.exposeString('companyId', { nullable: true }),
    vatId: t.exposeString('vatId', { nullable: true }),
  }),
});
export const OrganizerDetailsRef = builder
  .objectRef<OrganizerDetails>('OrganizerDetails')
  .implement({
    fields: (t) => ({
      name: t.exposeString('name'),
      street: t.exposeString('street'),
      city: t.exposeString('city'),
      postalCode: t.exposeString('postalCode'),
      country: t.exposeString('country'),
      companyId: t.exposeString('companyId'),
      aresVerifiedAt: t.exposeString('aresVerifiedAt', { nullable: true }),
      vatId: t.exposeString('vatId', { nullable: true }),
    }),
  });
export const BillingDetailsInputRef = builder.inputType('BillingDetailsInput', {
  fields: (t) => ({
    name: t.string({ required: true }),
    street: t.string({ required: true }),
    city: t.string({ required: true }),
    postalCode: t.string({ required: true }),
    country: t.string({ required: true }),
    companyId: t.string(),
    vatId: t.string(),
  }),
});
export const OrganizerDetailsInputRef = builder.inputType('OrganizerDetailsInput', {
  fields: (t) => ({
    name: t.string({ required: true }),
    street: t.string({ required: true }),
    city: t.string({ required: true }),
    postalCode: t.string({ required: true }),
    country: t.string({ required: true }),
    companyId: t.string({ required: true }),
    vatId: t.string(),
  }),
});
