import { z } from 'zod';

import { dateLikeSchema } from './common.js';

export const organisationSchema = z.object({
  id: z.number().int(),
  eventId: z.string(),
  externalId: z.string().nullable().optional(),
  name: z.string(),
  nationality: z.string().nullable().optional(),
  shortName: z.string().nullable().optional(),
  createdAt: dateLikeSchema.optional(),
  updatedAt: dateLikeSchema.optional(),
});

export type Organisation = z.infer<typeof organisationSchema>;
