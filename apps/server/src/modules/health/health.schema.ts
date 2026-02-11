import { z } from "@hono/zod-openapi";

export const checkStatusSchema = z.enum(["UP", "DOWN", "SKIP"]);
export const healthStatusSchema = z.enum(["UP", "DEGRADED", "DOWN"]);

export const checkResultSchema = z.object({
  name: z.string(),
  status: checkStatusSchema,
  responseTimeMs: z.number().optional(),
  message: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const liveResponseSchema = z.object({
  status: z.literal("alive"),
  timestamp: z.string().datetime(),
});

export const readyResponseSchema = z.object({
  status: z.enum(["ready", "not_ready"]),
  checks: z.array(checkResultSchema),
});

export const healthResponseSchema = z.object({
  status: healthStatusSchema,
  version: z.string(),
  uptime: z.number(),
  checks: z.array(checkResultSchema),
});

export type CheckResult = z.infer<typeof checkResultSchema>;
export type LiveResponse = z.infer<typeof liveResponseSchema>;
export type ReadyResponse = z.infer<typeof readyResponseSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
