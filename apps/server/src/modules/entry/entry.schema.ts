import { z } from '@hono/zod-openapi';
import { createEntryOrderInputSchema, entryStatusSchema } from '@repo/shared';

export const entryOrderParamsSchema = z.object({
  eventId: z.string().min(1),
  entryId: z.string().min(1),
});

export const createEntryOrderBodySchema = createEntryOrderInputSchema;

// PROCESSED is reachable only through the dedicated process endpoint, which
// also propagates the order into Competitor.
export const updateEntryOrderStatusBodySchema = z.object({
  status: entryStatusSchema.exclude(['PROCESSED']),
});

export type UpdateEntryOrderStatusBody = z.infer<typeof updateEntryOrderStatusBodySchema>;
