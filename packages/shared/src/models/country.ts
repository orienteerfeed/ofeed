import { z } from "zod";

export const countrySchema = z.object({
  countryCode: z.string().length(2),
  countryName: z.string(),
});

export type Country = z.infer<typeof countrySchema>;
