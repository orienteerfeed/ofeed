import { TFunction } from 'i18next';
import React, { useCallback, useRef, useState } from 'react';
import { Tabs } from '../../components/molecules';
import { EventList } from './EventList';
import { EventsOverview } from './EventsOverview';

interface EventTabsProps {
  t: TFunction;
}

export const EventsTabs: React.FC<EventTabsProps> = ({ t }) => {
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState('overview');

  const tabs = [
    {
      value: 'overview',
      label: (
        <span className="font-mono">
          {t('Pages.Event.Tabs.Overview').toUpperCase()}
        </span>
      ),
    },
    {
      value: 'upcoming',
      label: (
        <span className="font-mono">
          {t('Pages.Event.Tabs.Upcoming').toUpperCase()}
        </span>
      ),
    },
    {
      value: 'recent',
      label: (
        <span className="font-mono">
          {t('Pages.Event.Tabs.Recent').toUpperCase()}
        </span>
      ),
    },
    {
      value: 'all',
      label: (
        <span className="font-mono">
          {t('Pages.Event.Tabs.All').toUpperCase()}
        </span>
      ),
    },
  ];

  const scrollToTabs = useCallback(() => {
    setTimeout(() => {
      if (tabsContainerRef.current) {
        const navbar = document.querySelector('header');
        const navbarHeight = navbar?.getBoundingClientRect().height || 64;
        const tabsOffset = 8;

        const tabsRect = tabsContainerRef.current.getBoundingClientRect();
        const currentScroll =
          window.pageYOffset || document.documentElement.scrollTop;
        const targetPosition =
          currentScroll + tabsRect.top - navbarHeight - tabsOffset;

        const positionDiff = Math.abs(currentScroll - targetPosition);

        if (positionDiff > 20) {
          window.scrollTo({
            top: Math.max(0, targetPosition),
            behavior: 'smooth',
          });
        }
      }
    }, 50);
  }, []);

  const handleValueChange = useCallback(
    (newValue: string) => {
      setActiveTab(newValue);
      scrollToTabs();
    },
    [scrollToTabs]
  );

  return (
    <div ref={tabsContainerRef}>
      <Tabs
        value={activeTab}
        onValueChange={handleValueChange}
        tabs={tabs}
        className="space-y-6"
        listClassName="sticky top-18 z-50 grid w-full grid-cols-4 max-w-2xl mx-auto"
        triggerClassName="font-mono"
        contentClassName="space-y-4"
      >
        <EventsOverview t={t} onTabChange={handleValueChange} />
        <EventList t={t} filter="upcoming" />
        <EventList t={t} filter="recent" />
        <EventList t={t} filter="all" />
      </Tabs>
    </div>
  );
};
