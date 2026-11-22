import { Event } from '@/types/event';
import { useNavigate } from '@tanstack/react-router';
import { TFunction } from 'i18next';
import { Info, Star, TrendingUp, Trophy } from 'lucide-react';
import { EventFavoritesProvider } from './EventFavoritesProvider';
import { EventFavoritesView } from './EventFavoritesView';
import { Tabs } from '../../components/molecules';
import { EventInfoView } from './EventInfoView';
import { EventResultsView } from './EventResultsView';
import { EventSplitsView } from './EventSplitsView';

interface EventDetailTabsProps {
  t: TFunction;
  event: Event;
  defaultTab?: string | undefined;
}

export function EventDetailTabs(props: EventDetailTabsProps) {
  return (
    <EventFavoritesProvider key={props.event.id} eventId={props.event.id}>
      <EventDetailTabsContent {...props} />
    </EventFavoritesProvider>
  );
}

function EventDetailTabsContent({
  t,
  event,
  defaultTab = 'info',
}: EventDetailTabsProps) {
  const navigate = useNavigate();

  const handleTabChange = (tabValue: string) => {
    const newSearchParams = new URLSearchParams(window.location.search);
    newSearchParams.set('tab', tabValue);

    navigate({
      to: window.location.pathname,
      search: Object.fromEntries(newSearchParams),
      replace: true,
    });
  };

  // Tabs definition
  const tabs = [
    {
      value: 'favorites',
      label: (
        <div className="flex items-center justify-center gap-2">
          <Star className="hidden h-4 w-4 shrink-0 sm:block" />
          <span>{t('Favorites.Title')}</span>
        </div>
      ),
    },
    {
      value: 'info',
      label: (
        <div className="flex items-center gap-2 justify-center">
          <Info className="w-4 h-4 flex-shrink-0" />
          <span className="hidden sm:inline">{t('Pages.Event.Tabs.Info')}</span>
          <span className="sm:hidden">Info</span>
        </div>
      ),
    },
    {
      value: 'results',
      label: (
        <div className="flex items-center gap-2 justify-center">
          <Trophy className="w-4 h-4 flex-shrink-0" />
          <span className="hidden sm:inline">
            {t('Pages.Event.Tabs.Results')}
          </span>
          <span className="sm:hidden">Results</span>
        </div>
      ),
    },
    {
      value: 'splits',
      label: (
        <div className="flex items-center gap-2 justify-center">
          <TrendingUp className="w-4 h-4 flex-shrink-0" />
          <span className="hidden sm:inline">
            {t('Pages.Event.Tabs.Splits')}
          </span>
          <span className="sm:hidden">Splits</span>
        </div>
      ),
    },
  ];

  // Tabs content
  const tabContents = [
    <EventFavoritesView key="favorites" />,
    <EventInfoView key="info" event={event} />,
    <EventResultsView key="results" t={t} event={event} />,
    <EventSplitsView key="splits" t={t} event={event} />,
  ];

  // Dynamically calculate grid columns based on number of tabs
  const gridColsClassMap: Record<number, string> = {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
    5: 'grid-cols-5',
    6: 'grid-cols-6',
  };

  const gridColsClass = gridColsClassMap[tabs.length] ?? 'grid-cols-3';
  const currentTab = tabs.some(tab => tab.value === defaultTab)
    ? defaultTab
    : 'info';

  return (
    <Tabs
      tabs={tabs}
      value={currentTab}
      onValueChange={handleTabChange}
      className="space-y-6"
      listClassName={`grid w-full ${gridColsClass} max-w-2xl mx-auto`}
      triggerClassName="gap-2"
    >
      {tabContents}
    </Tabs>
  );
}
