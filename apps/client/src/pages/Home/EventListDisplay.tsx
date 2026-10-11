import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { TFunction } from 'i18next';
import { LayoutGrid, List, Loader2, Map } from 'lucide-react';
import { type Ref } from 'react';
import { Button } from '../../components/atoms';
import { EventCard } from './EventCard';
import { EventMapView } from './EventMapView';
import { EventTableRow } from './EventTableRow';
import type { EventListViewMode } from './eventListUtils';
import type { HomeEventListItem } from './types';

interface EventViewModeSwitcherProps {
  mapViewEnabled: boolean;
  onViewModeChange: (viewMode: EventListViewMode) => void;
  t: TFunction;
  viewMode: EventListViewMode;
}

export function EventViewModeSwitcher({
  mapViewEnabled,
  onViewModeChange,
  t,
  viewMode,
}: EventViewModeSwitcherProps) {
  return (
    <div className="flex gap-2">
      <Button
        variant={viewMode === 'card' ? 'default' : 'outline'}
        size="sm"
        onClick={() => onViewModeChange('card')}
        className="gap-2"
      >
        <LayoutGrid className="w-4 h-4" />
        <span className="hidden sm:inline">{t('Pages.Event.Tabs.Cards')}</span>
      </Button>
      <Button
        variant={viewMode === 'list' ? 'default' : 'outline'}
        size="sm"
        onClick={() => onViewModeChange('list')}
        className="gap-2"
      >
        <List className="w-4 h-4" />
        <span className="hidden sm:inline">{t('Pages.Event.Tabs.List')}</span>
      </Button>
      {mapViewEnabled ? (
        <Button
          variant={viewMode === 'map' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onViewModeChange('map')}
          className="gap-2"
        >
          <Map className="w-4 h-4" />
          <span className="hidden sm:inline">
            {t('Pages.Event.Tabs.Map', { defaultValue: 'Map' })}
          </span>
        </Button>
      ) : null}
    </div>
  );
}

interface EventCollectionProps {
  events: readonly HomeEventListItem[];
  mapViewEnabled: boolean;
  t: TFunction;
  viewMode: EventListViewMode;
}

export function EventCollection({
  events,
  mapViewEnabled,
  t,
  viewMode,
}: EventCollectionProps) {
  if (viewMode === 'card') {
    return <EventCardGrid events={events} />;
  }

  if (viewMode === 'list') {
    return <EventTable events={events} t={t} />;
  }

  return mapViewEnabled ? <EventMapView events={[...events]} t={t} /> : null;
}

function EventCardGrid({ events }: { events: readonly HomeEventListItem[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {events.map((event, index) => (
        <div
          key={event.id}
          data-event-id={event.id}
          className={cn(
            'animate-in fade-in-0',
            index >= events.length - 12 && 'duration-500'
          )}
          style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
        >
          <EventCard event={event} />
        </div>
      ))}
    </div>
  );
}

function EventTable({
  events,
  t,
}: {
  events: readonly HomeEventListItem[];
  t: TFunction;
}) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[300px]">
              {t('Pages.Event.Tables.Name')}
            </TableHead>
            <TableHead className="w-[120px]">
              {t('Pages.Event.Tables.Date')}
            </TableHead>
            <TableHead className="w-[100px]">
              {t('Pages.Event.Tables.ZeroTime')}
            </TableHead>
            <TableHead className="w-[150px]">
              {t('Pages.Event.Tables.Location')}
            </TableHead>
            <TableHead className="w-[100px]">
              {t('Pages.Event.Tables.Country')}
            </TableHead>
            <TableHead className="w-[100px]">
              {t('Pages.Event.Tables.Sport')}
            </TableHead>
            <TableHead className="w-[100px]">
              {t('Pages.Event.Tables.Status')}
            </TableHead>
            <TableHead className="w-[100px]">
              {t('Pages.Event.Tables.Entries')}
            </TableHead>
            <TableHead className="w-[120px] text-right">
              {t('Pages.Event.Tables.Actions')}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event, index) => (
            <EventTableRow
              key={event.id}
              t={t}
              event={event}
              className={cn(
                'animate-in fade-in-0',
                index >= events.length - 12 && 'duration-300'
              )}
              style={{ animationDelay: `${Math.min(index * 20, 200)}ms` }}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface EventListInitialLoadingStateProps {
  showLabel?: boolean;
  t: TFunction;
}

export function EventListInitialLoadingState({
  showLabel = false,
  t,
}: EventListInitialLoadingStateProps) {
  if (!showLabel) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-4">
      <Loader2 className="w-8 h-8 animate-spin" />
      <p className="text-muted-foreground">
        {t('Pages.Home.Infinite.LoadingInitial')}
      </p>
    </div>
  );
}

export function EventListErrorState({
  message,
  t,
}: {
  message: string;
  t: TFunction;
}) {
  return (
    <div className="flex justify-center py-8">
      <p className="text-destructive">
        {t('Pages.Home.Infinite.LoadError', { message })}
      </p>
    </div>
  );
}

interface EventListPaginationStateProps {
  isLoadingMore: boolean;
  sentinelRef: Ref<HTMLDivElement>;
  t: TFunction;
}

export function EventListPaginationState({
  isLoadingMore,
  sentinelRef,
  t,
}: EventListPaginationStateProps) {
  return (
    <div
      ref={sentinelRef}
      className="flex flex-col items-center justify-center py-10 text-muted-foreground"
    >
      {isLoadingMore ? (
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{t('Pages.Home.Infinite.LoadingMore')}</span>
        </div>
      ) : (
        <div className="text-center text-sm">
          <span>{t('Pages.Home.Infinite.ScrollMore')}</span>
        </div>
      )}
    </div>
  );
}

export function EventListEndState({
  count,
  t,
}: {
  count: number;
  t: TFunction;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
      <p className="text-sm font-mono font-medium">
        {t('Pages.Home.Infinite.AllLoaded')}
      </p>
      <p className="text-xs font-mono">
        {t('Pages.Home.Infinite.FoundCount', { count })}
      </p>
    </div>
  );
}

export function EventListEmptyState({ t }: { t: TFunction }) {
  return (
    <div className="text-center py-12 space-y-1 text-muted-foreground">
      <p className="text-sm font-mono font-medium">
        {t('Pages.Home.Infinite.NoEvents')}
      </p>
      <p className="text-xs font-mono">
        {t('Pages.Home.Infinite.NoEventsHint')}
      </p>
    </div>
  );
}
