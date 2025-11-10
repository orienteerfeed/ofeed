import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { gql } from '@apollo/client';
import { useSubscription } from '@apollo/client/react';
import { TFunction } from 'i18next';
import { Loader2, Mountain, Route } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { ClassSelect } from './ClassSelect';
import { SplitChart } from './SplitChart';
import { SplitTable } from './SplitTable';

// GraphQL subscription
const COMPETITORS_WITH_SPLITS_BY_CLASS_UPDATED = gql`
  subscription CompetitorsByClassUpdated($classId: Int!) {
    competitorsByClassUpdated(classId: $classId) {
      id
      firstname
      lastname
      organisation
      finishTime
      time
      status
      splits {
        controlCode
        time
      }
      bibNumber
      startTime
    }
  }
`;

// Types
interface Split {
  controlCode: string;
  time: number;
}

interface Competitor {
  id: string;
  firstname: string;
  lastname: string;
  organisation: string;
  finishTime?: string;
  time?: number;
  status: string;
  splits: Split[];
  bibNumber?: string;
  startTime?: string;
}

interface SubscriptionData {
  competitorsByClassUpdated: Competitor[];
}

interface ClassIndividualSplitProps {
  t: TFunction;
  event: {
    id: string;
    name: string;
    classes: {
      id: number;
      name: string;
      length?: number;
      climb?: number;
    }[]; // Odstraněno Array<> a přidáno [] pro jasnější typ
  };
  selectedClass: number | null;
  onClassChange: (classId: number) => void;
}

export const ClassIndividualSplit: React.FC<ClassIndividualSplitProps> = ({
  t,
  event,
  selectedClass,
  onClassChange,
}) => {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);

  const { loading, error, data } = useSubscription<SubscriptionData>(
    COMPETITORS_WITH_SPLITS_BY_CLASS_UPDATED,
    {
      variables: { classId: selectedClass || 0 },
      skip: !selectedClass,
    }
  );

  useEffect(() => {
    if (data?.competitorsByClassUpdated) {
      setCompetitors(data.competitorsByClassUpdated);
    }
  }, [data]);

  useEffect(() => {
    // Auto-select first class if none selected
    if (!selectedClass && event.classes.length > 0) {
      const firstClass = event.classes[0];
      if (firstClass) {
        onClassChange(firstClass.id);
      }
    }
  }, [selectedClass, event.classes, onClassChange]);

  const currentClass = event.classes.find(c => c.id === selectedClass);
  const courseLengthInKm = (currentClass?.length ?? 0) / 1000;
  const courseClimb = currentClass?.climb;

  if (!currentClass) {
    return (
      <Alert>
        <AlertDescription>
          Please select a class to view split times.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1 py-1">
              <Route className="w-3 h-3" />
              {courseLengthInKm.toFixed(1)} km
            </Badge>
            {courseClimb && (
              <Badge variant="secondary" className="gap-1 py-1">
                <Mountain className="w-3 h-3" />
                {courseClimb} m
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2
              className={`w-4 h-4 ${loading ? 'animate-spin' : 'opacity-0'}`}
            />
            <span>
              {competitors.length}{' '}
              {t('Pages.Event.Tables.Competitors').toLowerCase()}
            </span>
          </div>

          <ClassSelect
            classes={event.classes}
            selectedClass={selectedClass}
            onClassChange={onClassChange}
            currentClass={currentClass}
          />
        </div>
      </div>

      {/* Split view (Table / Chart) */}
      <Tabs defaultValue="table" className="w-full">
        <TabsList className="inline-flex h-9 items-center rounded-lg bg-muted p-1 text-muted-foreground">
          <TabsTrigger className="flex-1" value="table">
            {t('Pages.Event.Splits.Table', 'Tabulka')}
          </TabsTrigger>
          <TabsTrigger className="flex-1" value="chart">
            {t('Pages.Event.Splits.Chart', 'Graf')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="table" className="mt-4">
          <SplitTable
            competitors={competitors}
            isLoading={loading}
            error={error}
          />
        </TabsContent>

        <TabsContent value="chart" className="mt-4">
          <SplitChart
            competitors={competitors}
            isLoading={loading}
            error={error}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};
