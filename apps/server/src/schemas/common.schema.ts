import { z } from "@hono/zod-openapi";

export const standardErrorResponseSchema = z.object({
  message: z.string(),
  code: z.number(),
  error: z.literal(true),
});
