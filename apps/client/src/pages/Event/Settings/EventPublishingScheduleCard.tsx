import { Experimental, Input, Select, ToggleSwitch } from '@/components/atoms';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { formatDateTimeForInput } from '@/lib/date';
import { formatDateForInput } from '@/lib/utils';
import { TFunction } from 'i18next';
import { Loader2 } from 'lucide-react';
import React from 'react';
import { useRequest } from '../../../hooks/useRequest';
import { ENDPOINTS } from '../../../lib/api/endpoints';
import { Event } from '../../../types';
import { toast } from '../../../utils/toast';
import type { SplitPublicationMode } from '../../../types/event';

interface EventPublishingScheduleCardProps {
  t: TFunction;
  eventId: string;
  eventData: Event;
  onUpdated?: () => void | Promise<void>;
}

const toDateTimeLocalValue = (value?: string | null): string => {
  if (!value) return '';
  return formatDateTimeForInput(value);
};

const toApiDateTime = (value: string): string | null => {
  if (!value) return null;
  return new Date(value).toISOString();
};

export const EventPublishingScheduleCard: React.FC<
  EventPublishingScheduleCardProps
> = ({ t, eventId, eventData, onUpdated }) => {
  const request = useRequest();
  const [splitPublicationMode, setSplitPublicationMode] =
    React.useState<SplitPublicationMode>(
      eventData.splitPublicationMode ?? 'UNRESTRICTED'
    );
  const [splitPublicationAt, setSplitPublicationAt] = React.useState(
    toDateTimeLocalValue(eventData.splitPublicationAt)
  );
  const [entriesOpenAt, setEntriesOpenAt] = React.useState(
    toDateTimeLocalValue(eventData.entriesOpenAt)
  );
  const [entriesCloseAt, setEntriesCloseAt] = React.useState(
    toDateTimeLocalValue(eventData.entriesCloseAt)
  );
  const [resultsOfficial, setResultsOfficial] = React.useState(
    Boolean(
      eventData.resultsOfficialAt || eventData.resultsOfficialManuallySetAt
    )
  );
  const [isSaving, setIsSaving] = React.useState(false);

  const hasExternalLink = Boolean(
    eventData.externalSource && eventData.externalEventId
  );
  const initialSplitPublicationMode =
    eventData.splitPublicationMode ?? 'UNRESTRICTED';
  const initialSplitPublicationAt = toDateTimeLocalValue(
    eventData.splitPublicationAt
  );
  const initialEntriesOpenAt = toDateTimeLocalValue(eventData.entriesOpenAt);
  const initialEntriesCloseAt = toDateTimeLocalValue(eventData.entriesCloseAt);
  const initialResultsOfficial = Boolean(
    eventData.resultsOfficialAt || eventData.resultsOfficialManuallySetAt
  );

  React.useEffect(() => {
    setSplitPublicationMode(initialSplitPublicationMode);
    setSplitPublicationAt(initialSplitPublicationAt);
    setEntriesOpenAt(initialEntriesOpenAt);
    setEntriesCloseAt(initialEntriesCloseAt);
    setResultsOfficial(initialResultsOfficial);
  }, [
    initialSplitPublicationMode,
    initialSplitPublicationAt,
    initialEntriesCloseAt,
    initialEntriesOpenAt,
    initialResultsOfficial,
    eventData.id,
  ]);

  const entriesValidationError =
    entriesOpenAt &&
    entriesCloseAt &&
    new Date(entriesOpenAt).getTime() > new Date(entriesCloseAt).getTime()
      ? t(
          'Pages.Event.Form.Validation.EntriesCloseAtAfterOpen',
          'Entries close must be after entries open.'
        )
      : null;
  const splitPublicationValidationError =
    splitPublicationMode === 'SCHEDULED' && !splitPublicationAt
      ? t(
          'Pages.Event.Form.Validation.SplitPublicationAtRequired',
          'Publication time is required for scheduled split publication.'
        )
      : null;

  const isDirty =
    splitPublicationMode !== initialSplitPublicationMode ||
    splitPublicationAt !== initialSplitPublicationAt ||
    entriesOpenAt !== initialEntriesOpenAt ||
    entriesCloseAt !== initialEntriesCloseAt ||
    resultsOfficial !== initialResultsOfficial;

  const handleSave = async () => {
    if (entriesValidationError || splitPublicationValidationError) {
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description:
          entriesValidationError ?? splitPublicationValidationError ?? '',
        variant: 'error',
      });
      return;
    }

    if (
      !eventData.name ||
      !eventData.sportId ||
      !eventData.date ||
      !eventData.timezone ||
      !eventData.organizer ||
      !eventData.location
    ) {
      toast({
        title: t('Operations.Error', { ns: 'common' }),
        description: t('Errors.Generic', 'Something went wrong'),
        variant: 'error',
      });
      return;
    }

    setIsSaving(true);

    try {
      await request.request(ENDPOINTS.eventDetail(eventId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: eventData.name,
          sportId: eventData.sportId,
          date: formatDateForInput(eventData.date),
          timezone: eventData.timezone,
          organizer: eventData.organizer,
          location: eventData.location,
          latitude: eventData.latitude,
          longitude: eventData.longitude,
          countryCode: eventData.country?.countryCode || undefined,
          zeroTime: new Date(eventData.date).toISOString().slice(11, 19),
          discipline: eventData.discipline,
          ranking: eventData.ranking,
          coefRanking: eventData.coefRanking,
          relay: eventData.relay,
          published: eventData.published,
          hundredthPrecision: eventData.hundredthPrecision ?? false,
          externalSource: eventData.externalSource ?? undefined,
          externalEventId: eventData.externalEventId ?? undefined,
          entriesOpenAt: toApiDateTime(entriesOpenAt),
          entriesCloseAt: toApiDateTime(entriesCloseAt),
          splitPublicationMode,
          splitPublicationAt:
            splitPublicationMode === 'SCHEDULED'
              ? toApiDateTime(splitPublicationAt)
              : null,
          resultsOfficialManuallySetAt: hasExternalLink
            ? null
            : resultsOfficial
              ? (eventData.resultsOfficialManuallySetAt ??
                new Date().toISOString())
              : null,
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
      setIsSaving(false);
    }
  };

  return (
    <Card className="w-full h-fit">
      <CardHeader className="pb-4 space-y-2">
        <CardTitle className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <span>
            {t('Pages.Event.EntriesResults.Card.Title', 'Entries and results')}
          </span>
          <Experimental />
        </CardTitle>
        <CardDescription className="text-sm leading-relaxed text-muted-foreground">
          {t(
            'Pages.Event.EntriesResults.Card.Description',
            'Manage the entries window and confirm final results for local events.'
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-2 space-y-6">
        <div className="space-y-4 rounded-lg border p-4">
          <div className="space-y-2">
            <Label
              htmlFor="split-publication-mode"
              className="text-sm font-medium"
            >
              {t(
                'Pages.Event.EntriesResults.SplitPublication.Label',
                'Split publication'
              )}
            </Label>
            <Select
              value={splitPublicationMode}
              onValueChange={value =>
                setSplitPublicationMode(value as SplitPublicationMode)
              }
              disabled={isSaving}
              options={[
                {
                  value: 'UNRESTRICTED',
                  label: t(
                    'Pages.Event.EntriesResults.SplitPublication.Options.UNRESTRICTED',
                    'Publish without restriction'
                  ),
                },
                {
                  value: 'LAST_START',
                  label: t(
                    'Pages.Event.EntriesResults.SplitPublication.Options.LAST_START',
                    'Publish at the start of the last starter in the class'
                  ),
                },
                {
                  value: 'SCHEDULED',
                  label: t(
                    'Pages.Event.EntriesResults.SplitPublication.Options.SCHEDULED',
                    'Publish at a different time'
                  ),
                },
                {
                  value: 'DISABLED',
                  label: t(
                    'Pages.Event.EntriesResults.SplitPublication.Options.DISABLED',
                    'Disable split publication'
                  ),
                },
              ]}
            />
            <p className="text-xs text-muted-foreground">
              {t(
                'Pages.Event.EntriesResults.SplitPublication.Helper',
                'The event owner can always view split times without restrictions.'
              )}
            </p>
          </div>

          {splitPublicationMode === 'SCHEDULED' && (
            <div className="space-y-2">
              <Label
                htmlFor="split-publication-at"
                className="text-sm font-medium"
              >
                {t(
                  'Pages.Event.EntriesResults.SplitPublication.At',
                  'Split publication time'
                )}
              </Label>
              <Input
                id="split-publication-at"
                type="datetime-local"
                value={splitPublicationAt}
                onChange={e => setSplitPublicationAt(e.target.value)}
                disabled={isSaving}
              />
              {splitPublicationValidationError && (
                <p className="text-xs text-destructive">
                  {splitPublicationValidationError}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="entries-open-at" className="text-sm font-medium">
              {t('Pages.Event.Form.EntriesOpenAt', 'Entries open at')}
            </Label>
            <Input
              id="entries-open-at"
              type="datetime-local"
              value={entriesOpenAt}
              onChange={e => setEntriesOpenAt(e.target.value)}
              disabled={isSaving}
            />
            <p className="text-xs text-muted-foreground">
              {t(
                'Pages.Event.Form.EntriesOpenAtHelper',
                'Leave empty to keep entries closed until you decide otherwise.'
              )}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="entries-close-at" className="text-sm font-medium">
              {t('Pages.Event.Form.EntriesCloseAt', 'Entries close at')}
            </Label>
            <Input
              id="entries-close-at"
              type="datetime-local"
              value={entriesCloseAt}
              onChange={e => setEntriesCloseAt(e.target.value)}
              disabled={isSaving}
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

        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="results-official" className="text-sm font-medium">
                {t(
                  'Pages.Event.EntriesResults.ResultsOfficial',
                  'Results are official'
                )}
              </Label>
              <p className="text-xs text-muted-foreground">
                {hasExternalLink
                  ? t(
                      'Pages.Event.EntriesResults.ResultsOfficialManagedExternally',
                      'Official result confirmation is managed by the linked external system.'
                    )
                  : t(
                      'Pages.Event.EntriesResults.ResultsOfficialHelper',
                      'Use this switch for local events once the results are final.'
                    )}
              </p>
            </div>

            <ToggleSwitch
              id="results-official"
              checked={resultsOfficial}
              onCheckedChange={setResultsOfficial}
              disabled={isSaving || hasExternalLink}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            disabled={
              isSaving ||
              !isDirty ||
              Boolean(entriesValidationError) ||
              Boolean(splitPublicationValidationError)
            }
            onClick={handleSave}
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('Loading', { ns: 'common' })}
              </>
            ) : (
              t('Operations.Update', { ns: 'common' })
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
