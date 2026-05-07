import { builder } from '../../graphql/builder.js';

import { systemMessageSeverityValues } from './system-message.schema.js';

export const SystemMessageSeverityRef = builder.enumType('SystemMessageSeverity', {
  values: systemMessageSeverityValues,
});

export const SystemMessageRef = builder.prismaObject('SystemMessage', {
  fields: (t) => ({
    id: t.exposeInt('id'),
    title: t.exposeString('title', { nullable: true }),
    message: t.exposeString('message'),
    severity: t.field({
      type: SystemMessageSeverityRef,
      select: { severity: true },
      resolve: (systemMessage) => systemMessage.severity,
    }),
    publishedAt: t.field({
      type: 'DateTime',
      select: { publishedAt: true },
      resolve: (systemMessage) => systemMessage.publishedAt as Date,
    }),
    expiresAt: t.expose('expiresAt', { type: 'DateTime', nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
  }),
});
