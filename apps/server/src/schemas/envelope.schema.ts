import { z } from "@hono/zod-openapi";

export const responseMetaSchema = z.object({
  requestId: z.string(),
  timestamp: z.string().datetime(),
  traceId: z.string().optional(),
  spanId: z.string().optional(),
});

export function createSuccessEnvelopeSchema<T extends z.ZodTypeAny>(dataSchema: T, name: string) {
  return z.object({
    success: z.literal(true),
    data: dataSchema,
    error: z.null(),
    meta: responseMetaSchema,
  }).openapi(name);
}

export function createErrorEnvelopeSchema(name: string) {
  return z.object({
    success: z.literal(false),
    data: z.null(),
    error: z.object({
      type: z.string(),
      title: z.string(),
      status: z.number(),
      detail: z.string(),
      instance: z.string(),
      code: z.string(),
      errors: z.array(
        z.object({
          field: z.string().optional(),
          pointer: z.string().optional(),
          message: z.string(),
          code: z.string().optional(),
          reason: z.string().optional(),
        }),
      ),
    }),
    meta: responseMetaSchema,
  }).openapi(name);
}
