import { Alert } from '@/components/organisms';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { gql } from '@apollo/client';
import { useSubscription } from '@apollo/client/react';
import { TFunction } from 'i18next';
import { Mountain, Route } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { EventCategorySwitcher } from './EventCategorySwitcher';
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
      <Alert severity="info" variant="outlined">
        Please select a class to view split times.
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="table" className="w-full">
        <div className="sticky top-0 z-10 bg-background border-b border-border pb-2 mb-2">
          <div className="flex items-center justify-between gap-2">
            <TabsList className="flex h-7 items-center gap-1 rounded-md bg-muted p-0">
              <TabsTrigger
                className="h-7 px-2 py-0 gap-1 rounded-md text-xs font-medium transition-colors data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow data-[state=active]:hover:bg-primary/90 data-[state=inactive]:hover:bg-accent data-[state=inactive]:hover:text-accent-foreground"
                value="table"
              >
                {t('Pages.Event.Splits.Table', 'Tabulka')}
              </TabsTrigger>
              <TabsTrigger
                className="h-7 px-2 py-0 gap-1 rounded-md text-xs font-medium transition-colors data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow data-[state=active]:hover:bg-primary/90 data-[state=inactive]:hover:bg-accent data-[state=inactive]:hover:text-accent-foreground"
                value="chart"
              >
                {t('Pages.Event.Splits.Chart', 'Graf')}
              </TabsTrigger>
            </TabsList>

            <EventCategorySwitcher
              classes={event.classes}
              selectedClass={selectedClass}
              onClassChange={onClassChange}
              currentClass={currentClass}
              competitorsCount={competitors.length}
              loading={loading}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
