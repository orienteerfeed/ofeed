import { z } from '@hono/zod-openapi';

export const changelogByEventInputSchema = z.object({
  eventId: z.string().min(1),
  origin: z.string().nullable().optional(),
  classId: z.number().int().nullable().optional(),
  since: z.union([z.date(), z.string()]).nullable().optional(),
});

export const protocolProcessedByTypeSchema = z.enum(['USER', 'INTEGRATION', 'SYSTEM']);

export const markChangelogProcessedInputSchema = z
  .object({
    eventId: z.string().min(1),
    protocolId: z.number().int().positive(),
    processedByType: protocolProcessedByTypeSchema.default('INTEGRATION'),
    processedBySource: z.string().trim().min(1).max(128),
  })
  .refine((value) => value.processedByType !== 'USER', {
    message: 'Use the authenticated user endpoint for user processing.',
    path: ['processedByType'],
  });

export type ChangelogByEventInput = z.infer<typeof changelogByEventInputSchema>;
export type MarkChangelogProcessedInput = z.infer<typeof markChangelogProcessedInputSchema>;
