import { Alert, AlertDescription } from '@/components/ui/alert';
import { Event } from '@/types/event';
import { useNavigate } from '@tanstack/react-router';
import { TFunction } from 'i18next';
import React, { useEffect, useState } from 'react';
import { ClassIndividualSplit } from './ClassIndividualSplit';

interface EventSplitsViewProps {
  t: TFunction;
  event: Event;
}

export const EventSplitsView: React.FC<EventSplitsViewProps> = ({
  t,
  event,
}) => {
  const navigate = useNavigate();
  const [selectedClass, setSelectedClass] = useState<number | null>(null);

  // Get current search params
  const searchParams = new URLSearchParams(window.location.search);
  const classNameFromUrl = searchParams.get('class');

  // Initialize selected class from URL using class name
  useEffect(() => {
    if (classNameFromUrl && event.classes) {
      const classItem = event.classes.find(c => c.name === classNameFromUrl);
      if (classItem) {
        setSelectedClass(classItem.id);
      }
    }
  }, [classNameFromUrl, event.classes]);

  // Update URL when selected class changes
  useEffect(() => {
    if (selectedClass !== null && event.classes) {
      const classItem = event.classes.find(c => c.id === selectedClass);
      if (classItem) {
        const newSearchParams = new URLSearchParams(window.location.search);
        newSearchParams.set('class', classItem.name);

        navigate({
          to: window.location.pathname,
          search: Object.fromEntries(newSearchParams),
          replace: true,
        });
      }
    }
  }, [selectedClass, event.classes, navigate]);

  const handleClassChange = (classId: number) => {
    setSelectedClass(classId);
  };

  if (!event.classes || event.classes.length === 0) {
    return (
      <Alert>
        <AlertDescription>
          No classes available for this event.
        </AlertDescription>
      </Alert>
    );
  }

  const splitEvent = {
    id: event.id,
    name: event.name,
    classes: event.classes,
  };

  // Check if event is a relay
  const isRelay = event.discipline === 'relay';

  return (
    <div className="space-y-6">
      {isRelay ? (
        `Relay splits view coming soon`
      ) : (
        <ClassIndividualSplit
          t={t}
          event={splitEvent}
          selectedClass={selectedClass}
          onClassChange={handleClassChange}
        />
      )}
    </div>
  );
};
