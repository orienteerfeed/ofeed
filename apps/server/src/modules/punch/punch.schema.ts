import { z } from '@hono/zod-openapi';

const uint = z.number().int().positive().max(4_294_967_295);
// Milliseconds are the physical identity precision; reject silently lossy inputs.
const timestamp = z
  .string()
  .datetime({ offset: true })
  .refine(
    (value) => !/\.\d{4,}/.test(value) && Number.isFinite(Date.parse(value)),
    'Use an offset-aware timestamp with at most millisecond precision',
  );

export const punchBatchSchema = z.object({
  source: z.enum(['SRR', 'READOUT']),
  deviceId: z.string().trim().min(1).max(128),
  punches: z
    .array(
      z.object({
        clientPunchId: z
          .string()
          .uuid()
          .transform((value) => value.toLowerCase()),
        card: uint,
        controlCode: z.number().int().min(-2).max(2_147_483_647),
        punchTime: timestamp,
        stationSerial: uint.optional(),
        receivedAt: timestamp,
      }),
    )
    .min(1)
    .max(200),
});

export const punchResultSchema = z.object({
  clientPunchId: z.string().uuid(),
  status: z.enum(['STORED', 'DUPLICATE', 'UNKNOWN_CARD']),
  competitorId: z.number().int().positive().optional(),
});

export type PunchBatch = z.infer<typeof punchBatchSchema>;
export type PunchResult = z.infer<typeof punchResultSchema>;
