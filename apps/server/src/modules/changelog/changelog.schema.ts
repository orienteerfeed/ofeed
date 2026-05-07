import { z } from '@hono/zod-openapi';

export const changelogByEventInputSchema = z.object({
  eventId: z.string().min(1),
  origin: z.string().nullable().optional(),
  classId: z.number().int().nullable().optional(),
  since: z.union([z.date(), z.string()]).nullable().optional(),
});

export type ChangelogByEventInput = z.infer<typeof changelogByEventInputSchema>;
