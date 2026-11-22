import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  systemRadioDeviceSchema,
  systemRadioCollectionSchema,
  type SystemRadioDeviceInput,
} from '@repo/shared';
import { Radio, Plus, RefreshCw } from 'lucide-react';
import { AdminPageLayout } from '@/templates/AdminPageLayout';
import { Button } from '@/components/atoms';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  DeviceSelect,
  DeviceNumberPreset,
} from '@/components/molecules/DeviceSettingsControls';
import {
  SYSTEM_RADIOS,
  RADIO_EVENTS,
  RADIO_COLLECTION,
  SAVE_RADIO,
  ASSIGN_RADIO,
  ARCHIVE_RADIO,
  SAVE_COLLECTION,
  START_COLLECTION,
  STOP_COLLECTION,
  type SystemRadio,
  type SystemCollection,
} from './system-radio-api';

const initialDevice: SystemRadioDeviceInput = {
  name: '',
  sourceType: 'yaroc',
  macAddress: '',
  intervalSeconds: 60,
  brokerProfile: 'default',
  meshtasticChannel: null,
};
const initialCollection = {
  hours: 24,
  checkCode: 3,
  startCode: 1,
  finishCode: 2,
};
export function AdminSystemDevicesPage() {
  const { t } = useTranslation();
  return (
    <AdminPageLayout
      activeItem="devices"
      breadcrumbs={[
        { label: t('Pages.Admin.Common.Zone'), to: '/admin' },
        { label: t('Pages.Admin.SystemDevices.Title') },
      ]}
    >
      <div className="mx-auto w-full max-w-6xl space-y-6 p-4 lg:p-6">
        <SystemDeviceManager />
      </div>
    </AdminPageLayout>
  );
}
export function SystemDeviceManager() {
  const { t, i18n } = useTranslation();
  const text = (key: string) =>
    String(t(`Pages.Admin.SystemDevices.${key}` as 'Pages.Admin.Common.Zone'));
  const deviceText = (key: string) =>
    String(
      t(`Pages.Insights.Devices.${key}` as 'Pages.Insights.Devices.Title')
    );
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [eventSearch, setEventSearch] = useState('');
  const [eventSearchQuery, setEventSearchQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setEventSearchQuery(eventSearch), 250);
    return () => clearTimeout(timer);
  }, [eventSearch]);
  const [selectedEvent, setSelectedEvent] = useState<{
    id: string;
    name: string;
    date: string;
  } | null>(null);
  const [editing, setEditing] = useState<SystemRadio | 'new' | null>(null);
  const [draft, setDraft] = useState(initialDevice);
  const [configuration, setConfiguration] = useState(initialCollection);
  const [failure, setFailure] = useState('');
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const inventory = useQuery<{
    adminSystemRadios: {
      devices: SystemRadio[];
      brokerProfiles: string[];
      available: boolean;
    };
  }>(SYSTEM_RADIOS, { fetchPolicy: 'network-only', pollInterval: 15_000 });
  const events = useQuery<{
    adminSystemRadioEvents: { id: string; name: string; date: string }[];
  }>(RADIO_EVENTS, { variables: { search: eventSearchQuery } });
  const collection = useQuery<{ adminSystemRadioCollection: SystemCollection }>(
    RADIO_COLLECTION,
    {
      variables: { eventId: selectedEvent?.id ?? '' },
      skip: !selectedEvent,
      fetchPolicy: 'network-only',
      pollInterval: 10_000,
    }
  );
  const [saveDevice] = useMutation(SAVE_RADIO);
  const [assignDevice] = useMutation(ASSIGN_RADIO);
  const [archiveDevice] = useMutation(ARCHIVE_RADIO);
  const [saveCollection] = useMutation(SAVE_COLLECTION);
  const [startCollection] = useMutation(START_COLLECTION);
  const [stopCollection] = useMutation(STOP_COLLECTION);
  const current = collection.data?.adminSystemRadioCollection;
  const settings = current ? JSON.stringify(current.settings) : '';
  useEffect(() => {
    if (settings) setConfiguration(JSON.parse(settings));
  }, [settings, selectedEvent?.id]);
  const active =
    !!current &&
    ['starting', 'running'].includes(current.state) &&
    (!current.until || Date.parse(current.until) > Date.now());
  const units = inventory.data?.adminSystemRadios.devices ?? [];
  const assigned = units.filter(
    unit => unit.eventId === selectedEvent?.id && !unit.archived
  );
  const available = !!inventory.data?.adminSystemRadios.available;
  const ready = !!inventory.data && !inventory.error;
  const eventReady =
    !!current && current.eventId === selectedEvent?.id && !collection.error;
  const valid = systemRadioCollectionSchema.safeParse(configuration).success;
  const normalized = systemRadioDeviceSchema.safeParse(draft);
  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString(i18n.language);
  const choices = [
    ...new Map(
      [
        ...(events.data?.adminSystemRadioEvents ?? []),
        ...(selectedEvent ? [selectedEvent] : []),
      ].map(event => [event.id, event])
    ).values(),
  ];
  const presetProps = {
    locale: i18n.language,
    customLabel: deviceText('CustomValue'),
    recommendedLabel: deviceText('Recommended'),
  };
  async function perform(action: () => Promise<unknown>) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setFailure('');
    try {
      await action();
      await inventory.refetch();
      if (selectedEvent) await collection.refetch();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : text('Error'));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  function edit(unit: SystemRadio | 'new') {
    setFailure('');
    setEditing(unit);
    setDraft(
      unit === 'new'
        ? initialDevice
        : {
            name: unit.name,
            sourceType: unit.sourceType,
            macAddress: unit.macAddress,
            intervalSeconds: unit.intervalSeconds,
            brokerProfile: unit.brokerProfile,
            meshtasticChannel: unit.meshtasticChannel,
          }
    );
  }
  const visible = units.filter(
    unit =>
      (filter === 'all' ||
        (filter === 'archived'
          ? unit.archived
          : !unit.archived &&
            (filter === 'assigned' ? !!unit.eventId : !unit.eventId))) &&
      `${unit.name} ${unit.macAddress} ${unit.eventName ?? ''}`
        .toLowerCase()
        .includes(search.toLowerCase())
  );
  return (
    <section className="min-w-0 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">{text('Title')}</h1>
        <p className="text-sm text-muted-foreground">{text('Description')}</p>
      </header>
      {(failure || inventory.error || collection.error || events.error) && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {failure ||
              inventory.error?.message ||
              collection.error?.message ||
              events.error?.message}
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{text('EventCollection')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{text('Workflow')}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="system-event-search">
                {text('SearchEvents')}
              </Label>
              <Input
                id="system-event-search"
                value={eventSearch}
                onChange={e => setEventSearch(e.target.value)}
              />
            </div>
            <DeviceSelect
              id="system-event"
              label={text('Event')}
              value={selectedEvent?.id ?? 'none'}
              disabled={pending}
              onChange={id => {
                setSelectedEvent(
                  choices.find(event => event.id === id) ?? null
                );
                setConfiguration(initialCollection);
              }}
              items={[
                { value: 'none', label: text('SelectEvent') },
                ...choices.map(event => ({
                  value: event.id,
                  label: `${event.name} · ${formatDate(event.date)}`,
                })),
              ]}
            />
          </div>
          {selectedEvent && (
            <>
              <p className="text-sm">
                {text('AssignedCount')}: {assigned.length} ·{' '}
                {current?.timezone ?? '—'} ·{' '}
                {deviceText(`Session_${current?.state ?? 'stopped'}`)}
                {current?.until
                  ? ` · ${new Date(current.until).toLocaleString(i18n.language, { timeZone: current.timezone })}`
                  : ''}
              </p>
              {current?.error && (
                <Alert variant="destructive">
                  <AlertDescription>{current.error}</AlertDescription>
                </Alert>
              )}
              <DeviceNumberPreset
                {...presetProps}
                id="system-hours"
                label={deviceText('ReceptionHours')}
                value={configuration.hours}
                onChange={hours =>
                  setConfiguration({ ...configuration, hours })
                }
                presets={[6, 12, 24, 48, 72]}
                recommended={24}
                min={1}
                max={72}
                unit="hour"
                disabled={pending || active || !eventReady}
              />
              <p className="text-sm text-muted-foreground">
                {deviceText('CodesHelp')}
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                {(['checkCode', 'startCode', 'finishCode'] as const).map(
                  key => (
                    <div key={key} className="grid gap-2">
                      <Label htmlFor={`system-${key}`}>
                        {deviceText(
                          (
                            {
                              checkCode: 'Check',
                              startCode: 'Start',
                              finishCode: 'Finish',
                            } as const
                          )[key]
                        )}
                      </Label>
                      <Input
                        id={`system-${key}`}
                        type="number"
                        min={1}
                        max={65535}
                        value={configuration[key]}
                        disabled={pending || active || !eventReady}
                        onChange={e =>
                          setConfiguration({
                            ...configuration,
                            [key]: e.target.valueAsNumber,
                          })
                        }
                      />
                    </div>
                  )
                )}
              </div>
              {!available && (
                <p className="text-sm text-destructive">
                  {deviceText('Action_NativeUnavailable')}
                </p>
              )}
              <div className="flex flex-wrap gap-3" aria-busy={pending}>
                <Button
                  variant="outline"
                  disabled={pending || !eventReady || active || !valid}
                  onClick={() =>
                    void perform(() =>
                      saveCollection({
                        variables: {
                          eventId: selectedEvent.id,
                          input: configuration,
                        },
                      })
                    )
                  }
                >
                  {deviceText('SaveSettings')}
                </Button>
                <Button
                  disabled={
                    pending ||
                    !ready ||
                    !eventReady ||
                    active ||
                    !available ||
                    !valid ||
                    !assigned.length
                  }
                  onClick={() =>
                    void perform(() =>
                      startCollection({
                        variables: {
                          eventId: selectedEvent.id,
                          input: configuration,
                        },
                      })
                    )
                  }
                >
                  {text('StartCollection')}
                </Button>
                <Button
                  variant="outline"
                  disabled={pending || !eventReady || !active}
                  onClick={() =>
                    void perform(() =>
                      stopCollection({
                        variables: { eventId: selectedEvent.id },
                      })
                    )
                  }
                >
                  {text('StopCollection')}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-3">
        <Button disabled={pending || !ready} onClick={() => edit('new')}>
          <Plus className="mr-2 h-4 w-4" />
          {text('AddDevice')}
        </Button>
        <Button
          variant="outline"
          disabled={pending || inventory.loading}
          onClick={() => void perform(async () => {})}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          {deviceText('Refresh')}
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="system-device-search">{text('SearchDevices')}</Label>
          <Input
            id="system-device-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <DeviceSelect
          id="system-filter"
          label={text('Filter')}
          value={filter}
          onChange={setFilter}
          items={['all', 'assigned', 'unassigned', 'archived'].map(value => ({
            value,
            label: text(value),
          }))}
        />
      </div>
      {inventory.loading && !inventory.data && (
        <p role="status">{deviceText('Loading')}</p>
      )}
      {ready && !visible.length && (
        <p className="text-sm text-muted-foreground">{text('Empty')}</p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {visible.map(unit => (
          <Card key={unit.id}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                <Radio className="h-4 w-4" />
                <span className="break-all">{unit.name}</span>
                <Badge variant="outline">
                  {unit.archived
                    ? text('archived')
                    : unit.eventId
                      ? text('assigned')
                      : text('unassigned')}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="break-all text-sm text-muted-foreground">
                {unit.sourceType === 'yaroc' ? 'YAROC' : 'Meshtastic'} ·{' '}
                {unit.macAddress} · {unit.brokerProfile}
                {unit.meshtasticChannel ? ` · ${unit.meshtasticChannel}` : ''}
              </p>
              {unit.eventId && (
                <Button
                  variant="link"
                  className="h-auto max-w-full whitespace-normal p-0 text-left"
                  onClick={() =>
                    setSelectedEvent({
                      id: unit.eventId!,
                      name: unit.eventName ?? unit.eventId!,
                      date: unit.eventDate!,
                    })
                  }
                >
                  {unit.eventName} · {formatDate(unit.eventDate!)}
                </Button>
              )}
              <p className="text-sm">
                {deviceText(`Session_${unit.collectionState}`)}
              </p>
              {unit.collectionError && (
                <p className="text-sm text-destructive">
                  {unit.collectionError}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {deviceText('LastSeen')}:{' '}
                {unit.lastSeenAt
                  ? new Date(unit.lastSeenAt).toLocaleString(i18n.language)
                  : '—'}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={
                    pending ||
                    ['starting', 'running'].includes(unit.collectionState)
                  }
                  onClick={() => edit(unit)}
                >
                  {text('Edit')}
                </Button>
                {!unit.archived &&
                  selectedEvent &&
                  unit.eventId !== selectedEvent.id && (
                    <Button
                      disabled={
                        pending ||
                        !eventReady ||
                        active ||
                        ['starting', 'running'].includes(unit.collectionState)
                      }
                      onClick={() =>
                        void perform(() =>
                          assignDevice({
                            variables: {
                              id: unit.id,
                              eventId: selectedEvent.id,
                            },
                          })
                        )
                      }
                    >
                      {text('Assign')}
                    </Button>
                  )}
                {unit.eventId && (
                  <Button
                    variant="outline"
                    disabled={
                      pending ||
                      ['starting', 'running'].includes(unit.collectionState)
                    }
                    onClick={() =>
                      void perform(() =>
                        assignDevice({
                          variables: { id: unit.id, eventId: null },
                        })
                      )
                    }
                  >
                    {text('Unassign')}
                  </Button>
                )}
                {!unit.eventId && (
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      void perform(() =>
                        archiveDevice({
                          variables: { id: unit.id, archived: !unit.archived },
                        })
                      )
                    }
                  >
                    {unit.archived ? text('Restore') : text('Archive')}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Dialog
        open={editing !== null}
        onOpenChange={open => {
          if (!open && !pending) setEditing(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing === 'new' ? text('AddDevice') : text('Edit')}
            </DialogTitle>
            <DialogDescription>{text('DeviceHelp')}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={e => {
              e.preventDefault();
              if (!normalized.success) return;
              void perform(async () => {
                await saveDevice({
                  variables: {
                    id: editing && editing !== 'new' ? editing.id : null,
                    input: normalized.data,
                  },
                });
                setEditing(null);
              });
            }}
          >
            {failure && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{failure}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-2">
              <Label htmlFor="system-name">{deviceText('Name')}</Label>
              <Input
                id="system-name"
                maxLength={100}
                value={draft.name}
                disabled={pending}
                onChange={e => setDraft({ ...draft, name: e.target.value })}
                required
              />
            </div>
            <DeviceSelect
              id="system-source"
              label={deviceText('UnitType')}
              value={draft.sourceType}
              disabled={pending}
              onChange={sourceType =>
                setDraft({
                  ...draft,
                  sourceType: sourceType as 'yaroc' | 'meshtastic',
                  meshtasticChannel: null,
                })
              }
              items={[
                { value: 'yaroc', label: 'YAROC' },
                { value: 'meshtastic', label: 'Meshtastic' },
              ]}
            />
            <div className="grid gap-2">
              <Label htmlFor="system-mac">MAC / ID</Label>
              <Input
                id="system-mac"
                value={draft.macAddress}
                disabled={pending}
                autoCapitalize="none"
                spellCheck={false}
                onChange={e =>
                  setDraft({ ...draft, macAddress: e.target.value })
                }
                required
              />
              <p className="text-xs text-muted-foreground">
                {deviceText(
                  draft.sourceType === 'yaroc'
                    ? 'YarocMacHelp'
                    : 'MeshtasticMacHelp'
                )}
              </p>
            </div>
            <DeviceNumberPreset
              {...presetProps}
              id="system-interval"
              label={deviceText('Interval')}
              value={draft.intervalSeconds}
              onChange={intervalSeconds =>
                setDraft({ ...draft, intervalSeconds })
              }
              presets={[10, 30, 60, 120, 300]}
              recommended={60}
              min={5}
              max={3600}
              unit="second"
              disabled={pending}
            />
            <p className="text-xs text-muted-foreground">
              {deviceText('IntervalHelp')}
            </p>
            <DeviceSelect
              id="system-broker"
              label={deviceText('Broker')}
              value={draft.brokerProfile}
              disabled={pending}
              onChange={brokerProfile => setDraft({ ...draft, brokerProfile })}
              items={(
                inventory.data?.adminSystemRadios.brokerProfiles ?? ['default']
              ).map(value => ({
                value,
                label:
                  value === 'default' ? deviceText('DefaultBroker') : value,
              }))}
            />
            {draft.sourceType === 'meshtastic' && (
              <div className="grid gap-2">
                <Label htmlFor="system-channel">{deviceText('Channel')}</Label>
                <Input
                  id="system-channel"
                  value={draft.meshtasticChannel ?? ''}
                  disabled={pending}
                  maxLength={100}
                  onChange={e =>
                    setDraft({
                      ...draft,
                      meshtasticChannel: e.target.value || null,
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {deviceText('ChannelHelp')}
                </p>
              </div>
            )}
            <Button type="submit" disabled={pending || !normalized.success}>
              {text('SaveDevice')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
