import { Loader2 } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ClassSelect } from './ClassSelect';

interface EventClass {
  id: number;
  name: string;
  length?: number;
  climb?: number;
}

interface EventCategorySwitcherProps {
  classes: EventClass[];
  selectedClass: number | null;
  onClassChange: (classId: number) => void;
  currentClass: EventClass;
  competitorsCount?: number | null;
  loading?: boolean;
}

export const EventCategorySwitcher: React.FC<EventCategorySwitcherProps> = ({
  classes,
  selectedClass,
  onClassChange,
  currentClass,
  competitorsCount,
  loading = false,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-4">
      {typeof competitorsCount === 'number' && (
        <div
          className={`items-center gap-2 text-sm text-muted-foreground ${
            competitorsCount === 0 ? 'hidden sm:flex' : 'flex'
          }`}
        >
          <Loader2
            className={`w-4 h-4 ${loading ? 'animate-spin' : 'opacity-0'}`}
          />
          <span>
            {competitorsCount}{' '}
            {t('Pages.Event.Tables.Competitors').toLowerCase()}
          </span>
        </div>
      )}

      <ClassSelect
        classes={classes}
        selectedClass={selectedClass}
        onClassChange={onClassChange}
        currentClass={currentClass}
      />
    </div>
  );
};
