import { z } from '@hono/zod-openapi';

export const registerPushTokenSchema = z.strictObject({
  // Expo push token, e.g. ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx].
  expoPushToken: z.string().regex(/^Expo(?:nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$/),
  platform: z.enum(['ios', 'android']),
  deviceId: z.uuid(),
});

export const notificationSettingsSchema = z.strictObject({
  bankPayment: z.strictObject({
    MATCHED: z.boolean(),
    OVERPAID: z.boolean(),
    UNMATCHED: z.boolean(),
  }),
});

export const pushDeviceRecordSchema = z.object({
  deviceId: z.string(),
  platform: z.enum(['ios', 'android']),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
