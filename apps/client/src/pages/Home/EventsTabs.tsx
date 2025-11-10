import { TFunction } from 'i18next';
import React, { useCallback, useRef } from 'react';
import { Tabs } from '../../components/molecules';
import { EventList } from './EventList';

interface EventTabsProps {
  t: TFunction;
}

export const EventsTabs: React.FC<EventTabsProps> = ({ t }) => {
  const tabsContainerRef = useRef<HTMLDivElement>(null);

  const tabs = [
    {
      value: 'all',
      label: (
        <span className="font-mono">
          {t('Pages.Event.Tabs.All').toUpperCase()}
        </span>
      ),
    },
    {
      value: 'ongoing',
      label: (
        <span className="font-mono">
          {t('Pages.Event.Tabs.Today').toUpperCase()}
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
  ];

  const handleValueChange = useCallback((_value: string) => {
    setTimeout(() => {
      if (tabsContainerRef.current) {
        const navbar = document.querySelector('header');
        const navbarHeight = navbar?.getBoundingClientRect().height || 64;
        const tabsOffset = 8;

        // Calculate target position
        const tabsRect = tabsContainerRef.current.getBoundingClientRect();
        const currentScroll =
          window.pageYOffset || document.documentElement.scrollTop;
        const targetPosition =
          currentScroll + tabsRect.top - navbarHeight - tabsOffset;

        // Get current position
        const currentPosition =
          window.pageYOffset || document.documentElement.scrollTop;

        // Calculate difference between current and target position
        const positionDiff = Math.abs(currentPosition - targetPosition);

        // Only scroll if we're NOT at the correct position (difference greater than 20px)
        if (positionDiff > 20) {
          window.scrollTo({
            top: Math.max(0, targetPosition),
            behavior: 'smooth',
          });
        }
        // If we're already at the correct position, do nothing
      }
    }, 50);
  }, []);

  return (
    <div ref={tabsContainerRef}>
      <Tabs
        defaultValue="all"
        onValueChange={handleValueChange}
        tabs={tabs}
        className="space-y-6"
        listClassName="sticky top-18 z-50 grid w-full grid-cols-4 max-w-2xl mx-auto"
        triggerClassName="font-mono"
        contentClassName="space-y-4"
      >
        <EventList t={t} filter="all" />
        <EventList t={t} filter="ongoing" />
        <EventList t={t} filter="upcoming" />
        <EventList t={t} filter="recent" />
      </Tabs>
    </div>
  );
};
