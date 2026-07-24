import type { EntryAvailabilityClass } from '@repo/shared';
import { ClipboardList, ListChecks, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CountdownTimer } from '@/components/organisms';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { Event } from '@/types/event';

import { EntryClassCard } from './EntryClassCard';
import { EntryFormDialog } from './EntryFormDialog';
import { useEventEntryAvailability, useEventEntryStats } from './entries.hooks';

interface EventEntriesViewProps {
  event: Event;
}

type EntriesPhase = 'BEFORE_OPEN' | 'OPEN' | 'CLOSED';

function resolvePhase(
  entriesOpenAt: string | Date | null,
  entriesCloseAt: string | Date | null,
  now: number
): EntriesPhase {
  if (entriesOpenAt && new Date(entriesOpenAt).getTime() > now) {
    return 'BEFORE_OPEN';
  }
  if (entriesCloseAt && new Date(entriesCloseAt).getTime() < now) {
    return 'CLOSED';
  }
  return 'OPEN';
}

/** Re-render when an open/close boundary passes so the phase switches live. */
function useEntriesPhase(
  entriesOpenAt: string | Date | null | undefined,
  entriesCloseAt: string | Date | null | undefined
): EntriesPhase {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const boundaries = [entriesOpenAt, entriesCloseAt]
      .map(value => (value ? new Date(value).getTime() : null))
      .filter((value): value is number => value !== null && value > Date.now());
    if (boundaries.length === 0) return undefined;

    const next = Math.min(...boundaries);
    const timeout = setTimeout(
      () => setNow(Date.now()),
      Math.min(next - Date.now() + 1000, 2 ** 31 - 1)
    );
    return () => clearTimeout(timeout);
  }, [entriesOpenAt, entriesCloseAt, now]);

  return resolvePhase(entriesOpenAt ?? null, entriesCloseAt ?? null, now);
}

function EntriesClosedSummary({ eventId }: { eventId: string }) {
  const { t } = useTranslation();
  const { data: stats, isLoading } = useEventEntryStats(eventId);

  return (
    <div className="space-y-4">
      <p className="text-center text-muted-foreground">
        {t('Pages.Event.Entries.ClosedDescription')}
      </p>
      <div className="mx-auto grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <Users className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">
                {isLoading ? '…' : (stats?.entriesCount ?? 0)}
              </p>
              <p className="text-sm text-muted-foreground">
                {t('Pages.Event.Entries.EntriesCount')}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <ListChecks className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">
                {isLoading ? '…' : (stats?.changesCount ?? 0)}
              </p>
              <p className="text-sm text-muted-foreground">
                {t('Pages.Event.Entries.ChangesCount')}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function EventEntriesView({ event }: EventEntriesViewProps) {
  const { t } = useTranslation();
  const [selectedClass, setSelectedClass] =
    useState<EntryAvailabilityClass | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const {
    data: availability,
    isLoading,
    isError,
  } = useEventEntryAvailability(event.id);

  const phase = useEntriesPhase(
    availability?.entriesOpenAt ?? event.entriesOpenAt,
    availability?.entriesCloseAt ?? event.entriesCloseAt
  );

  const openClasses = useMemo(
    () => (availability?.classes ?? []).filter(cls => !cls.isFull),
    [availability]
  );

  const handleSelectClass = (entryClass: EntryAvailabilityClass) => {
    setSelectedClass(entryClass);
    setDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (isError || !availability) {
    return (
      <p className="text-center text-muted-foreground">
        {t('Pages.Event.Entries.LoadError')}
      </p>
    );
  }

  if (phase === 'BEFORE_OPEN' && availability.entriesOpenAt) {
    return (
      <div className="flex flex-col items-center gap-6 py-8">
        <ClipboardList className="h-10 w-10 text-muted-foreground" />
        <p className="text-lg font-medium">
          {t('Pages.Event.Entries.OpensIn')}
        </p>
        <div className="max-w-sm">
          <CountdownTimer expiryDate={new Date(availability.entriesOpenAt)} />
        </div>
      </div>
    );
  }

  if (phase === 'CLOSED') {
    return <EntriesClosedSummary eventId={event.id} />;
  }

  return (
    <div className="space-y-6">
      {availability.entriesCloseAt && (
        <p className="text-center text-sm text-muted-foreground">
          {t('Pages.Event.Entries.ClosesAt', {
            date: new Date(availability.entriesCloseAt).toLocaleString(),
          })}
        </p>
      )}

      {openClasses.length === 0 ? (
        <p className="text-center text-muted-foreground">
          {t('Pages.Event.Entries.AllClassesFull')}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {openClasses.map(entryClass => (
            <EntryClassCard
              key={entryClass.id}
              entryClass={entryClass}
              currencyCode={availability.currency.code}
              onSelect={handleSelectClass}
            />
          ))}
        </div>
      )}

      <EntryFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        entryClass={selectedClass}
        availability={availability}
        eventId={event.id}
        eventName={event.name}
        eventSportId={event.sportId}
      />
    </div>
  );
}
