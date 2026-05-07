import { builder } from '../../graphql/builder.js';

import { findCountries } from './country.service.js';

export const CountryRef = builder.prismaObject('Country', {
  fields: (t) => ({
    countryCode: t.exposeString('countryCode'),
    countryName: t.exposeString('countryName'),
    events: t.relation('events', { nullable: true }),
  }),
});

builder.queryFields((t) => ({
  countries: t.prismaField({
    type: [CountryRef],
    resolve: (query, _root, _args, context) => findCountries(context.prisma, query),
  }),
}));
