import { z } from 'zod';
import { registerLiveDeviceSchema, yarocSettingsSchema } from './live-status.js';

export const systemRadioDeviceSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    sourceType: z.enum(['yaroc', 'meshtastic']),
    macAddress: z
      .string()
      .trim()
      .transform(value =>
        value
          .replace(/^!/, '')
          .replace(/[:\-\s]/g, '')
          .toLowerCase()
      ),
    intervalSeconds: z.number().int().min(5).max(3600).default(60),
    brokerProfile: yarocSettingsSchema.shape.brokerProfile,
    meshtasticChannel: yarocSettingsSchema.shape.meshtasticChannel.nullable().optional(),
  })
  .superRefine((value, context) => {
    const parsed = registerLiveDeviceSchema.safeParse(value);
    if (!parsed.success)
      for (const issue of parsed.error.issues)
        context.addIssue({ code: 'custom', path: issue.path, message: issue.message });
    if (value.sourceType !== 'meshtastic' && value.meshtasticChannel)
      context.addIssue({
        code: 'custom',
        path: ['meshtasticChannel'],
        message: 'Channel requires a Meshtastic unit',
      });
  });
export const systemRadioCollectionSchema = z
  .object({
    hours: yarocSettingsSchema.shape.hours,
    checkCode: yarocSettingsSchema.shape.checkCode,
    startCode: yarocSettingsSchema.shape.startCode,
    finishCode: yarocSettingsSchema.shape.finishCode,
  })
  .refine(
    value => new Set([value.checkCode, value.startCode, value.finishCode]).size === 3,
    'Special codes must differ'
  );
export type SystemRadioDeviceInput = z.infer<typeof systemRadioDeviceSchema>;
export type SystemRadioCollectionInput = z.infer<typeof systemRadioCollectionSchema>;
