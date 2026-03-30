import { z } from 'zod';

import { dateLikeSchema } from './common.js';

export const systemMessageSeveritySchema = z.enum(['INFO', 'WARNING', 'ERROR', 'SUCCESS']);

export const systemMessageSchema = z.object({
  id: z.number().int(),
  title: z.string().nullable().optional(),
  message: z.string(),
  severity: systemMessageSeveritySchema,
  publishedAt: dateLikeSchema,
  expiresAt: dateLikeSchema.nullable().optional(),
  createdAt: dateLikeSchema,
  updatedAt: dateLikeSchema,
});

export type SystemMessageSeverity = z.infer<typeof systemMessageSeveritySchema>;
export type SystemMessage = z.infer<typeof systemMessageSchema>;
