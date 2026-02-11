import { z } from "zod";

export const teamSchema = z.object({
  id: z.number().int(),
  classId: z.number().int(),
  name: z.string(),
  organisation: z.string().nullable().optional(),
  shortName: z.string().nullable().optional(),
  bibNumber: z.number().int(),
});

export type Team = z.infer<typeof teamSchema>;
