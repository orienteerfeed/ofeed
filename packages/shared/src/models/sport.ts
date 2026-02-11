import { z } from "zod";

export const sportSchema = z.object({
  id: z.number().int(),
  name: z.string(),
});

export type Sport = z.infer<typeof sportSchema>;
