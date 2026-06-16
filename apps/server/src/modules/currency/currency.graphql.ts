import { builder } from '../../graphql/builder.js';

import { findCurrencies } from './currency.service.js';

export const CurrencyRef = builder.prismaObject('Currency', {
  fields: (t) => ({
    iso4217Alpha3: t.exposeString('iso4217Alpha3'),
    name: t.exposeString('name'),
  }),
});

builder.queryFields((t) => ({
  currencies: t.prismaField({
    type: [CurrencyRef],
    resolve: (query, _root, _args, context) => findCurrencies(context.prisma, query),
  }),
}));
