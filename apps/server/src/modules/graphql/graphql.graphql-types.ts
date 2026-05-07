import type { outputShapeKey } from '@pothos/core';

import { builder } from '../../graphql/builder.js';
import { UserRef } from '../user/user.graphql-types.js';

type OutputShapeOf<Ref> = Ref extends { [outputShapeKey]: infer Shape } ? Shape : never;
type UserGraphQLShape = OutputShapeOf<typeof UserRef>;

export const ResponseMessageRef = builder
  .objectRef<{
    message: string;
    token?: string | null;
    user?: unknown;
  }>('ResponseMessage')
  .implement({
    fields: (t) => ({
      message: t.exposeString('message'),
      token: t.string({
        resolve: (response) => response.token as string,
      }),
      user: t.field({
        type: UserRef,
        resolve: (response) => response.user as UserGraphQLShape,
      }),
    }),
  });
