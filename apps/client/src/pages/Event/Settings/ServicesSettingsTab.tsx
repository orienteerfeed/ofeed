import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { TFunction } from 'i18next';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button, Experimental, Input, ToggleSwitch } from '@/components/atoms';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useRequest } from '@/hooks/useRequest';
import { formatDateTimeForInput } from '@/lib/date';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { formatDateForInput } from '@/lib/utils';
import { Event } from '@/types';
import { toast } from '@/utils';

const EVENT_SERVICE_SETTINGS = gql`
  query EventServiceSettings($eventId: String!) {
    eventServiceSettings(eventId: $eventId) {
      eventId
      lateEntryFeePercent
      services {
        id
        systemKey
        active
        name
        description
        price
        maxQuantity
        custom
      }
    }
  }
`;

const UPDATE_LATE_ENTRY_FEE_PERCENT = gql`
  mutation UpdateLateEntryFeePercent(
    $eventId: String!
    $lateEntryFeePercent: Float
  ) {
    updateLateEntryFeePercent(
      eventId: $eventId
      lateEntryFeePercent: $lateEntryFeePercent
    ) {
      message
    }
  }
`;

const UPDATE_SYSTEM_EVENT_SERVICE = gql`
  mutation UpdateSystemEventService($input: UpdateSystemEventServiceInput!) {
    updateSystemEventService(input: $input) {
      message
    }
  }
`;

const SAVE_CUSTOM_EVENT_SERVICE = gql`
  mutation SaveCustomEventService($input: SaveCustomEventServiceInput!) {
    saveCustomEventService(input: $input) {
      id
      systemKey
      active
      name
      description
      price
      maxQuantity
      custom
    }
  }
`;

const DELETE_CUSTOM_EVENT_SERVICE = gql`
  mutation DeleteCustomEventService($eventId: String!, $id: Int!) {
    deleteCustomEventService(eventId: $eventId, id: $id) {
      message
    }
  }
`;

type EventServiceRow = {
  id: number | null;
  systemKey: string | null;
  active: boolean;
  name: string;
  description: string | null;
  price: number | null;
  maxQuantity: number | null;
  custom: boolean;
};

type EventServiceSettingsData = {
  eventServiceSettings: {
    eventId: string;
    lateEntryFeePercent: number | null;
    services: EventServiceRow[];
  };
};

type ServicesSettingsTabProps = {
  t: TFunction;
  eventId: string;
  event: Event;
  onUpdated?: () => void | Promise<void>;
};

type CustomDraft = {
  id: number | null;
  active: boolean;
  name: string;
  description: string;
  price: number | null;
  maxQuantity: number | null;
};

function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number.parseFloat(trimmed.replace(',', '.'));
  return Number.isNaN(parsed) ? null : parsed;
}

function isValidPercentage(value: number | null): boolean {
  return value === null || (Number.isFinite(value) && value >= 0);
}

const toDateTimeLocalValue = (value?: string | null): string => {
  if (!value) return '';
  return formatDateTimeForInput(value);
};

const toApiDateTime = (value: string): string | null => {
  if (!value) return null;
  return new Date(value).toISOString();
};

function toIntOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function serviceLabel(t: TFunction, service: EventServiceRow): string {
  if (!service.systemKey) return service.name;
  return t(`Pages.Event.Settings.Services.System.${service.systemKey}.Name`, {
    defaultValue: service.name,
  });
}

function serviceDescription(t: TFunction, service: EventServiceRow): string {
  if (!service.systemKey) return service.description ?? '';
  return t(
    `Pages.Event.Settings.Services.System.${service.systemKey}.Description`,
    {
      defaultValue: service.description ?? '',
    }
  );
}

function toDraft(service?: EventServiceRow): CustomDraft {
  return {
    id: service?.id ?? null,
    active: service?.active ?? true,
    name: service?.name ?? '',
    description: service?.description ?? '',
    price: service?.price ?? null,
    maxQuantity: service?.maxQuantity ?? null,
  };
}

export const ServicesSettingsTab = ({
  t,
  eventId,
  event,
  onUpdated,
}: ServicesSettingsTabProps) => {
  const request = useRequest();
  const { data, loading, error, refetch } = useQuery<EventServiceSettingsData>(
    EVENT_SERVICE_SETTINGS,
    { variables: { eventId } }
  );
  const [updateLateEntryFeePercent] = useMutation(
    UPDATE_LATE_ENTRY_FEE_PERCENT
  );
  const [updateSystemEventService] = useMutation(UPDATE_SYSTEM_EVENT_SERVICE);
  const [saveCustomEventService] = useMutation(SAVE_CUSTOM_EVENT_SERVICE);
  const [deleteCustomEventService] = useMutation(DELETE_CUSTOM_EVENT_SERVICE);

  const [lateEntryFeePercent, setLateEntryFeePercent] = useState<number | null>(
    null
  );
  const [systemServices, setSystemServices] = useState<EventServiceRow[]>([]);
  const [customServices, setCustomServices] = useState<EventServiceRow[]>([]);
  const [draft, setDraft] = useState<CustomDraft>(() => toDraft());
  const [entriesOpenAt, setEntriesOpenAt] = useState(
    toDateTimeLocalValue(event.entriesOpenAt)
  );
  const [entriesCloseAt, setEntriesCloseAt] = useState(
    toDateTimeLocalValue(event.entriesCloseAt)
  );
  const [entriesSaving, setEntriesSaving] = useState(false);
  const committedSystemsRef = useRef<EventServiceRow[]>([]);
  const committedLateEntryFeePercentRef = useRef<number | null>(null);

  const initialEntriesOpenAt = toDateTimeLocalValue(event.entriesOpenAt);
  const initialEntriesCloseAt = toDateTimeLocalValue(event.entriesCloseAt);

  useEffect(() => {
    setEntriesOpenAt(initialEntriesOpenAt);
    setEntriesCloseAt(initialEntriesCloseAt);
  }, [event.id, initialEntriesOpenAt, initialEntriesCloseAt]);

  useEffect(() => {
    const settings = data?.eventServiceSettings;
    if (!settings) return;
    setLateEntryFeePercent(settings.lateEntryFeePercent);
    committedLateEntryFeePercentRef.current = settings.lateEntryFeePercent;
    const systems = settings.services.filter(service => !service.custom);
    setSystemServices(systems);
    committedSystemsRef.current = systems;
    setCustomServices(settings.services.filter(service => service.custom));
  }, [data]);

  const restoreSystem = (systemKey: string) => {
    const committed = committedSystemsRef.current.find(
      service => service.systemKey === systemKey
    );
    if (!committed) return;
    setSystemServices(current =>
      current.map(service =>
        service.systemKey === systemKey ? committed : service
      )
    );
  };

  const commitLateEntryFeePercent = async (value: number | null) => {
    if (!isValidPercentage(value)) {
      setLateEntryFeePercent(committedLateEntryFeePercentRef.current);
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description: t('Pages.Event.Settings.Services.LateEntry.Invalid'),
        variant: 'error',
      });
      return;
    }

    try {
      await updateLateEntryFeePercent({
        variables: { eventId, lateEntryFeePercent: value },
      });
      committedLateEntryFeePercentRef.current = value;
    } catch (mutationError) {
      setLateEntryFeePercent(committedLateEntryFeePercentRef.current);
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description:
          mutationError instanceof Error
            ? mutationError.message
            : t('Pages.Event.Settings.Services.SaveError'),
        variant: 'error',
      });
    }
  };

  const commitSystem = async (service: EventServiceRow) => {
    if (!service.systemKey) return;
    try {
      await updateSystemEventService({
        variables: {
          input: {
            eventId,
            systemKey: service.systemKey,
            active: service.active,
            price: service.price,
          },
        },
      });
      committedSystemsRef.current = committedSystemsRef.current.map(current =>
        current.systemKey === service.systemKey ? service : current
      );
    } catch (mutationError) {
      restoreSystem(service.systemKey);
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description:
          mutationError instanceof Error
            ? mutationError.message
            : t('Pages.Event.Settings.Services.SaveError'),
        variant: 'error',
      });
    }
  };

  const updateSystemLocal = (
    systemKey: string,
    patch: Partial<EventServiceRow>
  ) => {
    setSystemServices(current =>
      current.map(service =>
        service.systemKey === systemKey ? { ...service, ...patch } : service
      )
    );
  };

  const saveDraft = async () => {
    try {
      await saveCustomEventService({
        variables: {
          input: {
            eventId,
            id: draft.id,
            active: draft.active,
            name: draft.name,
            description: draft.description || null,
            price: draft.price,
            maxQuantity: draft.maxQuantity,
          },
        },
      });
      setDraft(toDraft());
      await refetch();
    } catch (mutationError) {
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description:
          mutationError instanceof Error
            ? mutationError.message
            : t('Pages.Event.Settings.Services.SaveError'),
        variant: 'error',
      });
    }
  };

  const deleteCustom = async (service: EventServiceRow) => {
    if (!service.id) return;
    try {
      await deleteCustomEventService({
        variables: { eventId, id: service.id },
      });
      if (draft.id === service.id) setDraft(toDraft());
      await refetch();
    } catch (mutationError) {
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description:
          mutationError instanceof Error
            ? mutationError.message
            : t('Pages.Event.Settings.Services.DeleteError'),
        variant: 'error',
      });
    }
  };

  const entriesValidationError =
    entriesOpenAt &&
    entriesCloseAt &&
    new Date(entriesOpenAt).getTime() > new Date(entriesCloseAt).getTime()
      ? t(
          'Pages.Event.Form.Validation.EntriesCloseAtAfterOpen',
          'Entries close must be after entries open.'
        )
      : null;

  const entriesDirty =
    entriesOpenAt !== initialEntriesOpenAt ||
    entriesCloseAt !== initialEntriesCloseAt;

  const saveEntryWindow = async () => {
    if (!entriesDirty || entriesSaving) return;

    if (entriesValidationError) {
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description: entriesValidationError,
        variant: 'error',
      });
      return;
    }

    if (
      !event.name ||
      !event.sportId ||
      !event.date ||
      !event.timezone ||
      !event.organizer ||
      !event.location
    ) {
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description: t('Errors.Generic', 'Something went wrong'),
        variant: 'error',
      });
      return;
    }

    setEntriesSaving(true);

    try {
      await request.request(ENDPOINTS.eventDetail(eventId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: event.name,
          sportId: event.sportId,
          date: formatDateForInput(event.date),
          timezone: event.timezone,
          organizer: event.organizer,
          location: event.location,
          latitude: event.latitude,
          longitude: event.longitude,
          countryCode: event.country?.countryCode || undefined,
          zeroTime: new Date(event.date).toISOString().slice(11, 19),
          discipline: event.discipline,
          ranking: event.ranking,
          coefRanking: event.coefRanking,
          published: event.published,
          hundredthPrecision: event.hundredthPrecision ?? false,
          externalSource: event.externalSource ?? undefined,
          externalEventId: event.externalEventId ?? undefined,
          entriesOpenAt: toApiDateTime(entriesOpenAt),
          entriesCloseAt: toApiDateTime(entriesCloseAt),
          splitPublicationMode: event.splitPublicationMode ?? 'UNRESTRICTED',
          splitPublicationAt:
            event.splitPublicationMode === 'SCHEDULED'
              ? (event.splitPublicationAt ?? null)
              : null,
          resultsOfficialManuallySetAt:
            event.resultsOfficialManuallySetAt ?? null,
        }),
        onSuccess: () => {
          toast({
            title: t('Operations.Success', { ns: 'common' }),
            description: t(
              'Pages.Event.EntriesResults.Toast.UpdateSuccess',
              'Entries and results settings were updated.'
            ),
            variant: 'default',
          });
        },
        onError: err => {
          toast({
            title: t(
              'Pages.Event.EntriesResults.Toast.UpdateFail',
              "Couldn't update entries and results settings."
            ),
            description:
              typeof err === 'object' &&
              err !== null &&
              'message' in err &&
              typeof (err as { message?: unknown }).message === 'string'
                ? (err as { message: string }).message
                : t('Errors.Generic', 'Something went wrong'),
            variant: 'error',
          });
        },
      });

      if (onUpdated) {
        await onUpdated();
      }
    } finally {
      setEntriesSaving(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="py-8 text-sm text-muted-foreground">
        {t('Pages.Event.Settings.Loading')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-sm text-destructive">
        Error: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold tracking-tight">
            {t('Pages.Event.Settings.Services.Title')}
          </h2>
          <Experimental />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('Pages.Event.Settings.Services.Description')}
        </p>
      </div>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">
          {t('Pages.Event.Settings.Services.LateEntry.Title')}
        </h3>
        <div className="max-w-xs space-y-2">
          <div className="relative">
            <Input
              type="number"
              step="0.01"
              min={0}
              inputMode="decimal"
              className="pr-8"
              aria-label={t('Pages.Event.Settings.Services.LateEntry.Percent')}
              value={lateEntryFeePercent ?? ''}
              onChange={event =>
                setLateEntryFeePercent(toNumberOrNull(event.target.value))
              }
              onBlur={() => void commitLateEntryFeePercent(lateEntryFeePercent)}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground"
            >
              %
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('Pages.Event.Settings.Services.LateEntry.Helper')}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 pt-2 md:grid-cols-2">
          <div className="space-y-2">
            <Label
              htmlFor="services-entries-open-at"
              className="text-sm font-medium"
            >
              {t('Pages.Event.Form.EntriesOpenAt', 'Entries open at')}
            </Label>
            <Input
              id="services-entries-open-at"
              type="datetime-local"
              value={entriesOpenAt}
              onChange={e => setEntriesOpenAt(e.target.value)}
              onBlur={() => void saveEntryWindow()}
              disabled={entriesSaving}
            />
            <p className="text-xs text-muted-foreground">
              {t(
                'Pages.Event.Form.EntriesOpenAtHelper',
                'Leave empty to keep entries closed until you decide otherwise.'
              )}
            </p>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="services-entries-close-at"
              className="text-sm font-medium"
            >
              {t('Pages.Event.Form.EntriesCloseAt', 'Entries close at')}
            </Label>
            <Input
              id="services-entries-close-at"
              type="datetime-local"
              value={entriesCloseAt}
              onChange={e => setEntriesCloseAt(e.target.value)}
              onBlur={() => void saveEntryWindow()}
              disabled={entriesSaving}
            />
            <p className="text-xs text-muted-foreground">
              {t(
                'Pages.Event.Form.EntriesCloseAtHelper',
                'Leave empty to keep the entries window open without a fixed deadline.'
              )}
            </p>
            {entriesValidationError && (
              <p className="text-xs text-destructive">
                {entriesValidationError}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">
          {t('Pages.Event.Settings.Services.SystemTitle')}
        </h3>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  {t('Pages.Event.Settings.Services.Columns.Active')}
                </TableHead>
                <TableHead>
                  {t('Pages.Event.Settings.Services.Columns.Name')}
                </TableHead>
                <TableHead>
                  {t('Pages.Event.Settings.Services.Columns.Description')}
                </TableHead>
                <TableHead>
                  {t('Pages.Event.Settings.Services.Columns.Price')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {systemServices.map(service => (
                <TableRow key={service.systemKey}>
                  <TableCell>
                    <ToggleSwitch
                      aria-label={t(
                        'Pages.Event.Settings.Services.ActiveAria',
                        {
                          name: serviceLabel(t, service),
                        }
                      )}
                      checked={service.active}
                      onCheckedChange={value => {
                        const next = { ...service, active: value };
                        updateSystemLocal(service.systemKey ?? '', {
                          active: next.active,
                        });
                        void commitSystem(next);
                      }}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {serviceLabel(t, service)}
                  </TableCell>
                  <TableCell className="min-w-64 text-sm text-muted-foreground">
                    {serviceDescription(t, service)}
                  </TableCell>
                  <TableCell className="w-40">
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      aria-label={t('Pages.Event.Settings.Services.PriceAria', {
                        name: serviceLabel(t, service),
                      })}
                      value={service.price ?? ''}
                      onChange={event =>
                        updateSystemLocal(service.systemKey ?? '', {
                          price: toNumberOrNull(event.target.value),
                        })
                      }
                      onBlur={() => {
                        const current = systemServices.find(
                          item => item.systemKey === service.systemKey
                        );
                        if (current) void commitSystem(current);
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold">
            {t('Pages.Event.Settings.Services.CustomTitle')}
          </h3>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setDraft(toDraft())}
          >
            <Plus className="h-4 w-4" />
            {t('Pages.Event.Settings.Services.New')}
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_1.4fr_10rem_10rem_auto]">
          <Input
            placeholder={t('Pages.Event.Settings.Services.Placeholders.Name')}
            value={draft.name}
            onChange={event =>
              setDraft(current => ({ ...current, name: event.target.value }))
            }
          />
          <Textarea
            placeholder={t(
              'Pages.Event.Settings.Services.Placeholders.Description'
            )}
            value={draft.description}
            className="min-h-10"
            onChange={event =>
              setDraft(current => ({
                ...current,
                description: event.target.value,
              }))
            }
          />
          <Input
            type="number"
            step="0.01"
            min={0}
            placeholder={t('Pages.Event.Settings.Services.Placeholders.Price')}
            value={draft.price ?? ''}
            onChange={event =>
              setDraft(current => ({
                ...current,
                price: toNumberOrNull(event.target.value),
              }))
            }
          />
          <Input
            type="number"
            min={0}
            placeholder={t(
              'Pages.Event.Settings.Services.Placeholders.MaxQuantity'
            )}
            value={draft.maxQuantity ?? ''}
            onChange={event =>
              setDraft(current => ({
                ...current,
                maxQuantity: toIntOrNull(event.target.value),
              }))
            }
          />
          <Button
            className="whitespace-nowrap"
            onClick={() => void saveDraft()}
          >
            {draft.id
              ? t('Pages.Event.Settings.Services.Update')
              : t('Pages.Event.Settings.Services.Add')}
          </Button>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  {t('Pages.Event.Settings.Services.Columns.Name')}
                </TableHead>
                <TableHead>
                  {t('Pages.Event.Settings.Services.Columns.Description')}
                </TableHead>
                <TableHead>
                  {t('Pages.Event.Settings.Services.Columns.Price')}
                </TableHead>
                <TableHead>
                  {t('Pages.Event.Settings.Services.Columns.MaxQuantity')}
                </TableHead>
                <TableHead>
                  {t('Pages.Event.Settings.Services.Columns.Actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customServices.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    {t('Pages.Event.Settings.Services.EmptyCustom')}
                  </TableCell>
                </TableRow>
              ) : (
                customServices.map(service => (
                  <TableRow key={service.id}>
                    <TableCell className="font-medium">
                      {service.name}
                    </TableCell>
                    <TableCell className="min-w-64 text-sm text-muted-foreground">
                      {service.description}
                    </TableCell>
                    <TableCell>{service.price ?? '-'}</TableCell>
                    <TableCell>
                      {service.maxQuantity ??
                        t('Pages.Event.Settings.Services.Unlimited')}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDraft(toDraft(service))}
                        >
                          {t('Pages.Event.Settings.Services.Edit')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void deleteCustom(service)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
};
