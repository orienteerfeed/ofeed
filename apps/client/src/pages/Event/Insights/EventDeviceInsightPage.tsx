import { yarocActionState } from './yaroc-actions';
import { useMutation, useQuery, useSubscription } from '@apollo/client/react';
import { Link, useParams } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  monitoringSchema,
  registerLiveDeviceSchema,
  liveIntervalSchema,
} from '@repo/shared';
import { RefreshCw, Radio, Settings2, Save, Play, Square } from 'lucide-react';

import PATHNAMES from '@/lib/paths/pathnames';
import { Button } from '@/components/atoms';
import { Input } from '@/components/ui/input';
import { MainPageLayout } from '@/templates/MainPageLayout';
import { useEvent } from '@/hooks/useEvent';
import { BackLink } from '@/components/molecules';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { DeviceTelemetryCharts } from './DeviceTelemetryCharts';
import { DeviceStatusTable } from './DeviceStatusTable';
import {
  LIVE_STATUS,
  UPDATES,
  HISTORY,
  REGISTER,
  MONITOR,
  START,
  SAVE_SETTINGS,
  STOP,
  REVOKE,
  INTERVAL,
  ROTATE,
  type Status,
  type History,
} from './event-device-api';

export { LIVE_STATUS } from './event-device-api';

function DeviceSelect({
  id,
  label,
  value,
  onChange,
  items,
  disabled = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map(item => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function EventDeviceInsightPage() {
  const { eventId } = useParams({ from: '/events/$eventId/insights/devices' });
  return <EventDevicePanel eventId={eventId} mode="monitor" />;
}
export function EventDeviceSettingsPanel({ eventId }: { eventId: string }) {
  return <EventDevicePanel eventId={eventId} mode="settings" />;
}
function EventDevicePanel({
  eventId,
  mode,
}: {
  eventId: string;
  mode: 'monitor' | 'settings';
}) {
  const { t, i18n } = useTranslation();
  const label = (key: string): string =>
    String(
      t(`Pages.Insights.Devices.${key}` as 'Pages.Insights.Devices.Title')
    );
  const { event } = useEvent(eventId);
  const timezone = event?.timezone ?? 'UTC';
  const time = (value: string | null | undefined) =>
    value
      ? new Date(value).toLocaleString(i18n.language, { timeZone: timezone })
      : '—';
  const query = useQuery<{ eventLiveStatus: Status }>(LIVE_STATUS, {
    variables: { eventId },
    pollInterval: 30_000,
    fetchPolicy: 'network-only',
  });
  const updates = useSubscription<{ eventLiveStatusChanged: Status }>(UPDATES, {
    variables: { eventId },
    skip: mode === 'settings',
    onData: ({ client, data }) => {
      if (data.data)
        client.cache.writeQuery({
          query: LIVE_STATUS,
          variables: { eventId },
          data: { eventLiveStatus: data.data.eventLiveStatusChanged },
        });
    },
  });
  const status = query.data?.eventLiveStatus;
  const [selected, setSelected] = useState('');
  const [range, setRange] = useState('hour');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const until = new Date().toISOString();
  const fromDate =
    range === 'run' && status?.monitoringStartedAt
      ? status.monitoringStartedAt
      : range === 'custom' && from
        ? new Date(from).toISOString()
        : new Date(
            Date.now() - (range === 'hour' ? 3600_000 : 72 * 3600_000)
          ).toISOString();
  const toDate = range === 'custom' && to ? new Date(to).toISOString() : until;
  // Stable minute boundaries avoid starting a new query on each render.
  const history = useQuery<{ eventDeviceHistory: History }>(HISTORY, {
    variables: {
      eventId,
      deviceId: selected,
      from: fromDate.slice(0, 16) + ':00.000Z',
      to: toDate.slice(0, 16) + ':59.999Z',
    },
    skip: !selected || mode === 'settings',
    pollInterval: 30_000,
    fetchPolicy: 'network-only',
  });
  const manage = mode === 'settings';
  const [name, setName] = useState('');
  const [sourceType, setSource] = useState('yaroc');
  const [macAddress, setMac] = useState('');
  const [interval, setInterval] = useState(60);
  const [hours, setHours] = useState(24);
  const [checkCode, setCheck] = useState(3);
  const [startCode, setStart] = useState(1);
  const [finishCode, setFinish] = useState(2);
  const [channel, setChannel] = useState('');
  const [brokerProfile, setBrokerProfile] = useState('default');
  const [secret, setSecret] = useState('');
  const [failure, setFailure] = useState('');
  const [pending, setPending] = useState(false);
  const actionInFlight = useRef(false);
  const [register] = useMutation<{ registerLiveDevice: { token: string } }>(
    REGISTER
  );
  const [rotate] = useMutation<{ rotateLiveDeviceToken: { token: string } }>(
    ROTATE
  );
  const [updateInterval] = useMutation(INTERVAL);
  const [monitor] = useMutation(MONITOR);
  const [saveSettings] = useMutation(SAVE_SETTINGS);
  const [start] = useMutation(START);
  const savedSettings = status?.yarocSettings
    ? JSON.stringify(status.yarocSettings)
    : undefined;
  useEffect(() => {
    if (!savedSettings) return;
    const config = JSON.parse(savedSettings) as Status['yarocSettings'];
    setHours(config.hours);
    setCheck(config.checkCode);
    setStart(config.startCode);
    setFinish(config.finishCode);
    setChannel(config.meshtasticChannel ?? '');
    setBrokerProfile(config.brokerProfile);
  }, [savedSettings]);
  const settingsVariables = {
    eventId,
    hours,
    checkCode,
    startCode,
    finishCode,
    brokerProfile,
    meshtasticChannel: channel || null,
  };
  const [stop] = useMutation(STOP);
  const [revoke] = useMutation(REVOKE);
  async function perform(action: () => Promise<unknown>) {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setFailure('');
    setPending(true);
    try {
      await action();
      await query.refetch();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : label('Error'));
      await query.refetch().catch(() => {});
    } finally {
      actionInFlight.current = false;
      setPending(false);
    }
  }
  const configuration = {
    hours,
    checkCode,
    startCode,
    finishCode,
    brokerProfile,
    meshtasticChannel: channel || undefined,
  };
  const actions = yarocActionState(
    query.error ? undefined : status,
    configuration,
    event?.timezone
  );
  const stateReady = !!status && !query.error;
  async function currentActions() {
    const fresh = await query.refetch();
    return yarocActionState(
      fresh.data?.eventLiveStatus,
      configuration,
      event?.timezone
    );
  }
  async function saveYaroc() {
    const current = await currentActions();
    if (current.active || current.configurationIssues.length)
      throw new Error(
        label(
          `Action_${current.active ? 'AlreadyRunning' : current.configurationIssues[0]}`
        )
      );
    if (!current.dirty) return;
    await saveSettings({ variables: settingsVariables });
  }
  async function startYaroc() {
    const current = await currentActions();
    if (!current.canStart)
      throw new Error(label(`Action_${current.startIssues[0]}`));
    if (current.dirty) await saveSettings({ variables: settingsVariables });
    return start({ variables: settingsVariables });
  }
  async function stopYaroc() {
    if (!(await currentActions()).canStop) return;
    return stop({ variables: { eventId } });
  }
  const chosen = status?.devices.find(d => d.id === selected);
  const samples = history.data?.eventDeviceHistory.samples ?? [];
  const content = (
    <section
      className={
        mode === 'settings'
          ? 'min-w-0 space-y-6'
          : 'container mx-auto min-w-0 space-y-6 px-4 py-6'
      }
    >
      {mode === 'monitor' && (
        <BackLink to={PATHNAMES.eventInsights(eventId).url}>
          {t('Pages.Insights.Title')}
        </BackLink>
      )}
      <header className="space-y-2">
        {mode === 'settings' ? (
          <h2 className="text-xl font-semibold tracking-tight">
            {label('SettingsTitle')}
          </h2>
        ) : (
          <h1 className="text-2xl font-bold tracking-tight">
            {label('Title')}
          </h1>
        )}
        <p className="text-sm text-muted-foreground">
          {event?.name} · {timezone}
        </p>
      </header>
      {(query.error || updates.error) && (
        <Alert variant="destructive">
          <AlertDescription>{label('Stale')}</AlertDescription>
        </Alert>
      )}
      {failure && (
        <Alert variant="destructive">
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      )}
      {query.loading && !status && (
        <p role="status" className="text-sm text-muted-foreground">
          {label('Loading')}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {mode === 'monitor' && (
          <Button variant="outline" className="gap-2" asChild>
            <Link
              to="/events/$eventId/settings"
              params={{ eventId }}
              search={{ tab: 'devices' }}
            >
              <Settings2 className="h-4 w-4" aria-hidden />
              {label('Manage')}
            </Link>
          </Button>
        )}
        {mode === 'settings' && (
          <Button variant="outline" className="gap-2" asChild>
            <Link
              to="/events/$eventId/settings"
              params={{ eventId }}
              search={{ tab: 'files' }}
            >
              <Radio className="h-4 w-4" aria-hidden />
              {label('RadioControls')}
            </Link>
          </Button>
        )}
        <Button
          variant="outline"
          className="gap-2"
          disabled={query.loading}
          onClick={() => void query.refetch().catch(() => {})}
        >
          <RefreshCw
            className={query.loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
            aria-hidden
          />
          {label('Refresh')}
        </Button>
      </div>
      <p>
        {label('MonitoringUntil')}: {time(status?.monitoringUntil)} · YAROC:{' '}
        {status ? label(`Session_${status.sessionState}`) : '—'}
      </p>
      {status?.sessionError && (
        <Alert variant="destructive">
          <AlertDescription>{status.sessionError}</AlertDescription>
        </Alert>
      )}
      {manage && (
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Radio className="h-5 w-5" aria-hidden />
                {label('RadioDevices')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-3 md:grid-cols-2"
                onSubmit={e => {
                  e.preventDefault();
                  void perform(async () => {
                    if (
                      !registerLiveDeviceSchema.safeParse({
                        name,
                        sourceType,
                        macAddress: macAddress || undefined,
                        intervalSeconds: interval,
                      }).success
                    )
                      throw new Error(label('InvalidDevice'));
                    const result = await register({
                      variables: {
                        eventId,
                        name,
                        sourceType,
                        macAddress: macAddress || null,
                        intervalSeconds: interval,
                      },
                    });
                    setSecret(result.data?.registerLiveDevice.token ?? '');
                    setName('');
                  });
                }}
              >
                <label className="block space-y-2 text-sm font-medium">
                  {label('Name')}
                  <Input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                    maxLength={100}
                  />
                </label>
                <DeviceSelect
                  id="device-source"
                  label={label('Source')}
                  value={sourceType}
                  onChange={value => {
                    setSource(value);
                    setInterval(60);
                  }}
                  items={[
                    { value: 'yaroc', label: 'YAROC' },
                    { value: 'meshtastic', label: 'Meshtastic' },
                  ]}
                />
                <label className="block space-y-2 text-sm font-medium">
                  MAC
                  <Input
                    value={macAddress}
                    onChange={e => setMac(e.target.value)}
                    required={['yaroc', 'meshtastic'].includes(sourceType)}
                  />
                </label>
                <label className="block space-y-2 text-sm font-medium">
                  {label('Interval')}
                  <Input
                    type="number"
                    min={5}
                    max={3600}
                    value={interval}
                    onChange={e => setInterval(Number(e.target.value))}
                  />
                </label>
                <Button disabled={pending} type="submit">
                  {label('Register')}
                </Button>
              </form>
            </CardContent>
          </Card>
          {secret && (
            <Alert role="status">
              <AlertDescription className="space-y-3">
                <p>{label('TokenOnce')}</p>
                <code className="break-all">{secret}</code>
                <Button variant="outline" onClick={() => setSecret('')}>
                  {label('Dismiss')}
                </Button>
              </AlertDescription>
            </Alert>
          )}
          <Card>
            <CardHeader>
              <CardTitle>{label('Monitoring')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-6 sm:flex-row sm:items-end">
              <div className="w-full space-y-2 sm:max-w-sm">
                <Label htmlFor="monitoring-hours">{label('Hours')}</Label>
                <Input
                  id="monitoring-hours"
                  disabled={pending || actions.active}
                  type="number"
                  min={1}
                  max={72}
                  value={hours}
                  onChange={e => setHours(Number(e.target.value))}
                />
              </div>
              <Button
                className="w-full shrink-0 sm:w-auto"
                disabled={pending}
                onClick={() =>
                  void perform(() => {
                    if (!monitoringSchema.safeParse({ hours }).success)
                      throw new Error(label('Action_InvalidSettings'));
                    return monitor({ variables: { eventId, hours } });
                  })
                }
              >
                {label('Monitor')}
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>YAROC</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  { title: 'Check', value: checkCode, set: setCheck },
                  { title: 'Start', value: startCode, set: setStart },
                  { title: 'Finish', value: finishCode, set: setFinish },
                ].map(field => (
                  <div key={field.title} className="grid gap-2">
                    <Label htmlFor={`yaroc-code-${field.title.toLowerCase()}`}>
                      {label(field.title)}
                    </Label>
                    <Input
                      id={`yaroc-code-${field.title.toLowerCase()}`}
                      disabled={pending || actions.active}
                      type="number"
                      min={1}
                      max={65535}
                      value={field.value}
                      onChange={e => field.set(Number(e.target.value))}
                    />
                  </div>
                ))}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="yaroc-meshtastic-channel">
                  {label('Channel')}
                </Label>
                <Input
                  id="yaroc-meshtastic-channel"
                  disabled={pending || actions.active}
                  value={channel}
                  onChange={e => setChannel(e.target.value)}
                />
              </div>
              <DeviceSelect
                id="yaroc-broker"
                disabled={pending || actions.active}
                label={label('Broker')}
                value={brokerProfile}
                onChange={setBrokerProfile}
                items={(status?.brokerProfiles ?? ['default']).map(value => ({
                  value,
                  label: value,
                }))}
              />
              <p className="text-sm text-muted-foreground">
                {label('PublicBroker')}
              </p>
              <div className="flex flex-wrap gap-3" aria-busy={pending}>
                <Button
                  variant="outline"
                  disabled={pending || !stateReady || !actions.canSave}
                  onClick={() => void perform(saveYaroc)}
                >
                  <Save className="mr-2 h-4 w-4" aria-hidden />
                  {label('SaveSettings')}
                </Button>
                <Button
                  disabled={pending || !stateReady || !actions.canStart}
                  onClick={() => void perform(startYaroc)}
                >
                  <Play className="mr-2 h-4 w-4" aria-hidden />
                  {label('StartReception')}
                </Button>
                <Button
                  variant="outline"
                  disabled={pending || !stateReady || !actions.canStop}
                  onClick={() => void perform(stopYaroc)}
                >
                  <Square className="mr-2 h-4 w-4" aria-hidden />
                  {label('StopReception')}
                </Button>
              </div>
              {actions.startIssues.length > 0 && (
                <ul
                  className="space-y-1 text-sm text-muted-foreground"
                  aria-live="polite"
                >
                  {actions.startIssues.map(issue => (
                    <li key={issue}>{label(`Action_${issue}`)}</li>
                  ))}
                </ul>
              )}
              {!actions.dirty && actions.configurationIssues.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {label('ConfigurationUnchanged')}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
      {status?.devices.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {label('Empty')}
          </CardContent>
        </Card>
      )}
      <DeviceStatusTable
        devices={status?.devices ?? []}
        selected={selected}
        onSelect={setSelected}
        label={label}
        time={time}
        locale={i18n.language}
      />
      {chosen && (
        <Card>
          <CardHeader>
            <CardTitle className="break-words">{chosen.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {mode === 'settings' && (
              <>
                <label className="block space-y-2 text-sm font-medium">
                  {label('Interval')}
                  <Input
                    key={chosen.id}
                    type="number"
                    min={5}
                    max={3600}
                    defaultValue={chosen.intervalSeconds}
                    disabled={pending}
                    onBlur={e => {
                      const intervalSeconds = Number(e.currentTarget.value);
                      if (intervalSeconds !== chosen.intervalSeconds)
                        void perform(() => {
                          if (
                            !liveIntervalSchema.safeParse(intervalSeconds)
                              .success
                          )
                            throw new Error(label('InvalidInterval'));
                          return updateInterval({
                            variables: {
                              eventId,
                              deviceId: chosen.id,
                              intervalSeconds,
                            },
                          });
                        });
                    }}
                  />
                </label>
                <div className="flex flex-wrap gap-3">
                  {!['quickevent', 'ochecklist', 'meos', 'uploader'].includes(
                    chosen.sourceType
                  ) && (
                    <Button
                      disabled={pending}
                      onClick={() =>
                        void perform(async () => {
                          const result = await rotate({
                            variables: { eventId, deviceId: chosen.id },
                          });
                          setSecret(
                            result.data?.rotateLiveDeviceToken.token ?? ''
                          );
                        })
                      }
                    >
                      {label('Rotate')}
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    disabled={pending}
                    onClick={() =>
                      void perform(() =>
                        revoke({ variables: { eventId, deviceId: chosen.id } })
                      )
                    }
                  >
                    {label('Revoke')}
                  </Button>
                </div>
              </>
            )}
            {chosen.errorMessage && <p role="alert">{chosen.errorMessage}</p>}
            {chosen.latitude != null && chosen.longitude != null && (
              <p>
                {label('Position')}: {chosen.latitude}, {chosen.longitude} ·{' '}
                {time(chosen.positionAt)}
              </p>
            )}
            {mode === 'monitor' && (
              <>
                <div className="max-w-sm">
                  <DeviceSelect
                    id="history-range"
                    label={label('Range')}
                    value={range}
                    onChange={setRange}
                    items={[
                      { value: 'hour', label: label('Hour') },
                      { value: 'run', label: label('Run') },
                      { value: 'custom', label: label('Custom') },
                    ]}
                  />
                </div>
                {range === 'custom' && (
                  <div className="flex flex-wrap gap-3">
                    <label className="block space-y-2 text-sm font-medium">
                      {label('From')}
                      <Input
                        type="datetime-local"
                        value={from}
                        onChange={e => setFrom(e.target.value)}
                      />
                    </label>
                    <label className="block space-y-2 text-sm font-medium">
                      {label('To')}
                      <Input
                        type="datetime-local"
                        value={to}
                        onChange={e => setTo(e.target.value)}
                      />
                    </label>
                  </div>
                )}
                {history.error && (
                  <Alert variant="destructive">
                    <AlertDescription>{label('Error')}</AlertDescription>
                  </Alert>
                )}
                {!history.loading && !history.error && !samples.length && (
                  <p>{label('NoHistory')}</p>
                )}
                <DeviceTelemetryCharts
                  samples={samples}
                  locale={i18n.language}
                  timezone={timezone}
                  label={label}
                  time={time}
                />
                <h3 className="text-sm font-semibold">{label('Outages')}</h3>
                {!history.loading &&
                  !history.error &&
                  history.data?.eventDeviceHistory.outages.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      {label('NoOutages')}
                    </p>
                  )}
                <ul className="space-y-2 text-sm">
                  {history.data?.eventDeviceHistory.outages.map(o => (
                    <li key={o.startedAt}>
                      {o.kind === 'unknown'
                        ? label('Unknown')
                        : label('offline')}
                      : {time(o.startedAt)} — {time(o.endedAt)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </section>
  );
  return mode === 'settings' ? (
    content
  ) : (
    <MainPageLayout t={t}>{content}</MainPageLayout>
  );
}
