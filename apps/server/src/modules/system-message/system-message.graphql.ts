import { builder } from '../../graphql/builder.js';

import { SystemMessageRef } from './system-message.graphql-types.js';
import { findActiveSystemMessages } from './system-message.service.js';

builder.queryFields((t) => ({
  activeSystemMessages: t.prismaField({
    type: [SystemMessageRef],
    resolve: (query, _root, _args, context) => findActiveSystemMessages(context.prisma, query),
  }),
}));
