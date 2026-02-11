import { z } from "@hono/zod-openapi";

export const uploadEventIdSchema = z.object({
  eventId: z.string().min(1),
});

export const uploadIofQuerySchema = z.object({
  validateXml: z.boolean().optional(),
});

export const uploadFileSchema = z.object({
  file: z.unknown(),
});

export type UploadEventId = z.infer<typeof uploadEventIdSchema>;
export type UploadIofQuery = z.infer<typeof uploadIofQuerySchema>;
export type UploadFile = z.infer<typeof uploadFileSchema>;
