import type { TFunction } from 'i18next';
import { z } from 'zod';
import { countBibLabels, MAX_QR_CODES } from './qrCodeGenerator.utils';

export const QR_SIZES_MM = [40, 45, 50] as const;

export const createQrCodeFormSchema = (t: TFunction) =>
  z
    .object({
      teamFrom: z.number().int().min(1).max(9999),
      teamTo: z.number().int().min(1).max(9999),
      legFrom: z.number().int().min(1).max(99),
      legTo: z.number().int().min(1).max(99),
      sizeMm: z.union([z.literal(40), z.literal(45), z.literal(50)]),
    })
    .refine(value => value.teamFrom <= value.teamTo, {
      message: t('Pages.Utils.QrCodes.Validation.TeamRangeOrder'),
      path: ['teamTo'],
    })
    .refine(value => value.legFrom <= value.legTo, {
      message: t('Pages.Utils.QrCodes.Validation.LegRangeOrder'),
      path: ['legTo'],
    })
    .refine(value => countBibLabels(value) <= MAX_QR_CODES, {
      message: t('Pages.Utils.QrCodes.Validation.TooManyCodes', {
        max: MAX_QR_CODES,
      }),
      path: ['teamTo'],
    });

export type QrCodeFormValues = z.infer<ReturnType<typeof createQrCodeFormSchema>>;
