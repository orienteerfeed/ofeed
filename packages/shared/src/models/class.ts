import { z } from "zod";

import { classStatusSchema, sexSchema } from "./common";

export const classSchema = z.object({
  id: z.number().int(),
  eventId: z.string(),
  externalId: z.string().nullable().optional(),
  name: z.string(),
  startName: z.string().nullable().optional(),
  length: z.number().int().nullable().optional(),
  climb: z.number().int().nullable().optional(),
  controlsCount: z.number().int().nullable().optional(),
  competitorsCount: z.number().int().nullable().optional(),
  printedMaps: z.number().int().nullable().optional(),
  minAge: z.number().int().nullable().optional(),
  maxAge: z.number().int().nullable().optional(),
  minTeamMembers: z.number().int().nullable().optional(),
  maxTeamMembers: z.number().int().nullable().optional(),
  sex: sexSchema.optional(),
  status: classStatusSchema.optional(),
});

export type Class = z.infer<typeof classSchema>;
