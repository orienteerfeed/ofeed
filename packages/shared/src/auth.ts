import { z } from 'zod';

export const deviceMetadataSchema = z.object({
  deviceId: z.uuid(),
  deviceName: z.string().trim().min(1).max(100),
});
export const sessionSigninSchema = deviceMetadataSchema.extend({
  username: z.email().max(255),
  password: z.string().min(1).max(255),
});
export const sessionCredentialSchema = z.object({
  deviceId: z.uuid(),
  refreshToken: z
    .string()
    .regex(/^[A-Za-z0-9_-]{43}$/)
    .optional(),
});
export const accessTokenPairSchema = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.literal(900),
  refreshToken: z.string().optional(),
});
export type DeviceMetadata = z.infer<typeof deviceMetadataSchema>;
export type SessionSignin = z.infer<typeof sessionSigninSchema>;
