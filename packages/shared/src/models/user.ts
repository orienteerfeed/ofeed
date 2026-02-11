import { z } from "zod";

export const userSchema = z.object({
  id: z.number().int(),
  email: z.string().email(),
  firstname: z.string(),
  lastname: z.string(),
  organisation: z.string().nullable().optional(),
  password: z.string().optional(),
  active: z.boolean().optional(),
  createdAt: z.union([z.string(), z.date()]).optional(),
  updatedAt: z.union([z.string(), z.date()]).optional(),
});

export type User = z.infer<typeof userSchema>;
