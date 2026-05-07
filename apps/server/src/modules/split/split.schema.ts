import { z } from '@hono/zod-openapi';

export const competitorSplitsInputSchema = z.object({
  competitorId: z.number().int(),
});

export const splitPublicationStatusInputSchema = z.object({
  classId: z.number().int(),
});

export type CompetitorSplitsInput = z.infer<typeof competitorSplitsInputSchema>;
export type SplitPublicationStatusInput = z.infer<typeof splitPublicationStatusInputSchema>;
