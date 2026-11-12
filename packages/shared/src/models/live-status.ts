import { z } from 'zod';

export const liveSourceSchema = z.enum([
  'yaroc',
  'meshtastic',
  'quickevent',
  'ochecklist',
  'meos',
  'uploader',
]);
export const liveMetricsSchema = z.object({
  uploadState: z.enum(['processing', 'completed', 'skipped', 'failed']).optional(),
  uploadCompletedAt: z.string().datetime({ offset: true }).optional(),
  uploadDurationMs: z.number().nonnegative().optional(),
  lastPunchAt: z.string().datetime({ offset: true }).optional(),
  batteryPercent: z.number().min(0).max(100).optional(),
  gsmRsrpDbm: z.number().min(-200).max(0).optional(),
  gsmRssiDbm: z.number().min(-200).max(0).optional(),
  gsmSnrDb: z.number().min(-100).max(100).optional(),
  loraRssiDbm: z.number().min(-200).max(0).optional(),
  loraSnrDb: z.number().min(-100).max(100).optional(),
  hopCount: z.number().int().nonnegative().optional(),
  signalBars: z.number().int().min(0).max(4).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  positionAt: z.string().datetime({ offset: true }).optional(),
  accuracyMeters: z.number().nonnegative().optional(),
  queueSize: z.number().int().nonnegative().optional(),
  uploadBytes: z.number().nonnegative().optional(),
  uploadTotalBytes: z.number().nonnegative().optional(),
  uploadRateBytesPerSecond: z.number().nonnegative().optional(),
  appVersion: z.string().max(100).optional(),
  errorCode: z.string().max(100).optional(),
  errorMessage: z.string().max(500).optional(),
});
export const heartbeatSchema = z.object({
  version: z.literal(1),
  messageId: z.string().uuid(),
  measuredAt: z.string().datetime({ offset: true }),
  metrics: liveMetricsSchema,
});
export const liveIntervalSchema = z.number().int().min(5).max(3600);
export const registerLiveDeviceSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    sourceType: liveSourceSchema,
    macAddress: z
      .string()
      .regex(/^(?:[a-fA-F0-9]{8}|[a-fA-F0-9]{12})$/)
      .transform(v => v.toLowerCase())
      .optional(),
    intervalSeconds: liveIntervalSchema.default(10),
  })
  .superRefine((v, ctx) => {
    const length = v.sourceType === 'yaroc' ? 12 : v.sourceType === 'meshtastic' ? 8 : null;
    if (length && v.macAddress?.length !== length)
      ctx.addIssue({
        code: 'custom',
        path: ['macAddress'],
        message: `Expected ${length} hex characters`,
      });
  });
export const monitoringSchema = z.object({ hours: z.number().int().min(1).max(72).default(24) });
export const yarocSettingsSchema = z
  .object({
    brokerProfile: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,50}$/)
      .default('default'),
    hours: z.number().int().min(1).max(72).default(24),
    checkCode: z.number().int().positive().max(65535),
    startCode: z.number().int().positive().max(65535),
    finishCode: z.number().int().positive().max(65535),
    meshtasticChannel: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,100}$/)
      .optional(),
  })
  .refine(
    v => new Set([v.checkCode, v.startCode, v.finishCode]).size === 3,
    'Special codes must differ'
  );
export type LiveMetrics = z.infer<typeof liveMetricsSchema>;
export type Heartbeat = z.infer<typeof heartbeatSchema>;
export type LiveDeviceInput = z.infer<typeof registerLiveDeviceSchema>;
export type LiveConnectionStatus = 'waiting' | 'online' | 'delayed' | 'offline' | 'stopped';
export function liveConnectionStatus(
  lastSeenAt: Date | null,
  intervalSeconds: number,
  until: Date | null,
  now = new Date()
): LiveConnectionStatus {
  if (!until || now >= until) return 'stopped';
  if (!lastSeenAt) return 'waiting';
  const age = now.getTime() - lastSeenAt.getTime();
  return age <= intervalSeconds * 2000
    ? 'online'
    : age <= intervalSeconds * 4000
      ? 'delayed'
      : 'offline';
}

/** Stable application identity for event-password-authenticated producers. */
export const externalLiveDeviceSchema = z.object({
  sourceType: z.enum(['quickevent', 'ochecklist', 'meos', 'uploader']),
  sourceId: z
    .string()
    .uuid()
    .transform(value => value.toLowerCase()),
  name: z.string().trim().min(1).max(60).optional(),
});
/** Extra fields are optional so existing bearer-token producers remain compatible. */
export const eventHeartbeatSchema = heartbeatSchema.extend({
  sourceType: externalLiveDeviceSchema.shape.sourceType.optional(),
  sourceId: externalLiveDeviceSchema.shape.sourceId.optional(),
  name: externalLiveDeviceSchema.shape.name,
});

export type YarocSettings = z.infer<typeof yarocSettingsSchema>;

/** YAROC 0.1.x accepts a fixed UTC offset rather than an IANA zone. */
export function yarocTimezoneOffset(timezone: string, instant: Date): string {
  return (
    new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' })
      .formatToParts(instant)
      .find(part => part.type === 'timeZoneName')
      ?.value.replace('GMT', '') || '+00:00'
  );
}
export function yarocWindowProblem(
  timezone: string,
  startedAt: Date,
  hours: number
): 'INVALID_TIMEZONE' | 'TIMEZONE_TRANSITION' | null {
  try {
    return yarocTimezoneOffset(timezone, startedAt) ===
      yarocTimezoneOffset(timezone, new Date(+startedAt + hours * 3600_000))
      ? null
      : 'TIMEZONE_TRANSITION';
  } catch {
    return 'INVALID_TIMEZONE';
  }
}
