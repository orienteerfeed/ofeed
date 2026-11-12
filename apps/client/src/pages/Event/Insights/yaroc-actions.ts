import {
  registerLiveDeviceSchema,
  yarocSettingsSchema,
  yarocWindowProblem,
} from '@repo/shared';
import type { Status } from './event-device-api';

export type YarocActionIssue =
  | 'StateUnavailable'
  | 'InvalidSettings'
  | 'InvalidBroker'
  | 'AlreadyRunning'
  | 'NativeUnavailable'
  | 'NoRadioDevices'
  | 'InvalidRadioDevice'
  | 'InvalidTimezone'
  | 'TimezoneTransition';
export function yarocActionState(
  status: Status | undefined,
  input: unknown,
  timezone: string | undefined,
  now = new Date()
) {
  const parsed = yarocSettingsSchema.safeParse(input);
  const active =
    !!status &&
    ['starting', 'running'].includes(status.sessionState) &&
    (!status.sessionUntil || Date.parse(status.sessionUntil) > +now);
  const configurationIssues: YarocActionIssue[] = [];
  if (!status) configurationIssues.push('StateUnavailable');
  if (!parsed.success) configurationIssues.push('InvalidSettings');
  if (
    status &&
    parsed.success &&
    !status.brokerProfiles.includes(parsed.data.brokerProfile)
  )
    configurationIssues.push('InvalidBroker');
  const startIssues = [...configurationIssues];
  if (active) startIssues.push('AlreadyRunning');
  if (status && !status.yarocAvailable) startIssues.push('NativeUnavailable');
  const radios =
    status?.devices.filter(
      device =>
        ['yaroc', 'meshtastic'].includes(device.sourceType) && !device.revoked
    ) ?? [];
  if (status && !radios.length) startIssues.push('NoRadioDevices');
  if (
    radios.some(device => !registerLiveDeviceSchema.safeParse(device).success)
  )
    startIssues.push('InvalidRadioDevice');
  if (!timezone) startIssues.push('InvalidTimezone');
  else if (parsed.success) {
    const problem = yarocWindowProblem(timezone, now, parsed.data.hours);
    if (problem)
      startIssues.push(
        problem === 'INVALID_TIMEZONE'
          ? 'InvalidTimezone'
          : 'TimezoneTransition'
      );
  }
  const saved = yarocSettingsSchema.safeParse(
    status?.yarocSettings
      ? {
          ...status.yarocSettings,
          meshtasticChannel:
            status.yarocSettings.meshtasticChannel ?? undefined,
        }
      : undefined
  );
  const dirty =
    parsed.success &&
    (!saved.success ||
      JSON.stringify(parsed.data) !== JSON.stringify(saved.data));
  return {
    active,
    dirty,
    configurationIssues,
    startIssues,
    canSave: !active && configurationIssues.length === 0 && dirty,
    canStart: startIssues.length === 0,
    canStop: !!status && active,
  };
}
