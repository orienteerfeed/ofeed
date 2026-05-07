export const systemMessageSeverityValues = ['INFO', 'WARNING', 'ERROR', 'SUCCESS'] as const;

export type SystemMessageSeverityValue = (typeof systemMessageSeverityValues)[number];
