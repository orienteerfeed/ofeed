import { z } from "zod";

export const splitSchema = z.object({
  id: z.number().int(),
  competitorId: z.number().int(),
  controlCode: z.number().int(),
  time: z.number().int().nullable().optional(),
});

export type Split = z.infer<typeof splitSchema>;
