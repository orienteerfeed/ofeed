import { Alert, CountdownTimer } from '@/components/organisms';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  hasDisplayableCourseClimb,
  hasDisplayableCourseLength,
} from '@/lib/course-info';
import { formatDateTime, getLocaleKey } from '@/lib/date';
import { gql } from '@apollo/client';
import { useQuery, useSubscription } from '@apollo/client/react';
import { TFunction } from 'i18next';
import { Mountain, Route } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EventCategorySwitcher } from './EventCategorySwitcher';
import { SplitChart } from './SplitChart';
import { SplitTable } from './SplitTable';

// GraphQL subscription
const SPLIT_PUBLICATION_STATUS = gql`
  query SplitPublicationStatus($classId: Int!) {
    splitPublicationStatus(classId: $classId) {
      eventId
      classId
      mode
      isPublished
      isAccessible
      publishAt
      reason
    }
  }
`;

const SPLIT_COMPETITORS_BY_CLASS_UPDATED = gql`
  subscription SplitCompetitorsByClassUpdated($classId: Int!) {
    splitCompetitorsByClassUpdated(classId: $classId) {
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
  splitCompetitorsByClassUpdated: Competitor[];
}

interface SplitPublicationStatus {
  eventId: string;
  classId: number;
  mode: 'UNRESTRICTED' | 'LAST_START' | 'SCHEDULED' | 'DISABLED';
  isPublished: boolean;
  isAccessible: boolean;
  publishAt?: string | null;
  reason:
    | 'PUBLISHED'
    | 'WAITING_FOR_LAST_START'
    | 'WAITING_FOR_SCHEDULED'
    | 'DISABLED';
}

interface SplitPublicationStatusData {
  splitPublicationStatus: SplitPublicationStatus;
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
  const { i18n } = useTranslation();
  const [competitors, setCompetitors] = useState<Competitor[]>([]);

  const {
    data: splitPublicationData,
    loading: splitPublicationLoading,
    error: splitPublicationError,
    refetch: refetchSplitPublicationStatus,
  } = useQuery<SplitPublicationStatusData>(SPLIT_PUBLICATION_STATUS, {
    variables: { classId: selectedClass || 0 },
    skip: !selectedClass,
    pollInterval: selectedClass ? 30000 : 0,
    fetchPolicy: 'network-only',
  });

  const splitPublicationStatus =
    splitPublicationData?.splitPublicationStatus?.classId === selectedClass
      ? splitPublicationData.splitPublicationStatus
      : null;

  const { loading, error, data } = useSubscription<SubscriptionData>(
    SPLIT_COMPETITORS_BY_CLASS_UPDATED,
    {
      variables: { classId: selectedClass || 0 },
      skip: !selectedClass || !splitPublicationStatus?.isAccessible,
    }
  );

  useEffect(() => {
    setCompetitors([]);
  }, [selectedClass]);

  useEffect(() => {
    if (splitPublicationStatus && !splitPublicationStatus.isAccessible) {
      setCompetitors([]);
    }
  }, [splitPublicationStatus]);

  useEffect(() => {
    if (
      !splitPublicationStatus?.publishAt ||
      splitPublicationStatus.isAccessible
    ) {
      return;
    }

    const publishAtMs = new Date(splitPublicationStatus.publishAt).getTime();
    if (!Number.isFinite(publishAtMs)) {
      return;
    }

    const delay = publishAtMs - Date.now();
    if (delay <= 0) {
      void refetchSplitPublicationStatus();
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void refetchSplitPublicationStatus();
    }, delay);

    return () => window.clearTimeout(timeoutId);
  }, [refetchSplitPublicationStatus, splitPublicationStatus]);

  useEffect(() => {
    if (data?.splitCompetitorsByClassUpdated) {
      setCompetitors(data.splitCompetitorsByClassUpdated);
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

  if (!currentClass) {
    return (
      <Alert severity="info" variant="outlined">
        {t(
          'Pages.Event.Splits.SelectClass',
          'Please select a class to view split times.'
        )}
      </Alert>
    );
  }

  if (splitPublicationError) {
    return (
      <Alert
        severity="error"
        variant="outlined"
        title={t(
          'Pages.Event.Splits.Publication.ErrorTitle',
          'Split publication settings could not be loaded'
        )}
      >
        {splitPublicationError.message}
      </Alert>
    );
  }

  const showLength = hasDisplayableCourseLength(currentClass.length);
  const showClimb = hasDisplayableCourseClimb(currentClass);
  const courseLengthLabel = showLength
    ? `${((currentClass.length ?? 0) / 1000).toFixed(1)} km`
    : null;
  const courseClimbLabel = showClimb ? `${currentClass.climb ?? 0} m` : null;
  const splitPublishAt = splitPublicationStatus?.publishAt
    ? new Date(splitPublicationStatus.publishAt)
    : null;
  const locale = getLocaleKey(i18n.language);
  const splitPublishAtLabel =
    splitPublishAt && Number.isFinite(splitPublishAt.getTime())
      ? formatDateTime(splitPublishAt, locale)
      : null;
  const showPublicationAlert =
    Boolean(selectedClass) &&
    !splitPublicationLoading &&
    Boolean(splitPublicationStatus) &&
    !splitPublicationStatus?.isAccessible;
  const splitDataLoading =
    splitPublicationLoading ||
    (Boolean(splitPublicationStatus?.isAccessible) && loading);
  const splitDataError = splitPublicationStatus?.isAccessible ? error : null;

  const getPublicationAlertTitle = () => {
    if (splitPublicationStatus?.reason === 'DISABLED') {
      return t(
        'Pages.Event.Splits.Publication.DisabledTitle',
        'Split publication is disabled'
      );
    }

    return t(
      'Pages.Event.Splits.Publication.ScheduledTitle',
      'Split times are not published yet'
    );
  };

  const getPublicationAlertDescription = () => {
    if (!splitPublicationStatus) {
      return null;
    }

    if (splitPublicationStatus.reason === 'DISABLED') {
      return t(
        'Pages.Event.Splits.Publication.DisabledDescription',
        'Split times are not published for this event.'
      );
    }

    if (splitPublicationStatus.reason === 'WAITING_FOR_LAST_START') {
      if (splitPublishAtLabel) {
        return t(
          'Pages.Event.Splits.Publication.LastStartWithTime',
          'Split times will be published at the start of the last starter in this class: {{datetime}}.',
          { datetime: splitPublishAtLabel }
        );
      }

      return t(
        'Pages.Event.Splits.Publication.LastStartPending',
        'Split times will be published at the start of the last starter in this class.'
      );
    }

    if (!splitPublishAtLabel) {
      return t(
        'Pages.Event.Splits.Publication.ScheduledPending',
        'Split times will be published at the configured time.'
      );
    }

    return t(
      'Pages.Event.Splits.Publication.ScheduledDescription',
      'Split times will be published at {{datetime}}.',
      { datetime: splitPublishAtLabel }
    );
  };

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
              loading={splitDataLoading}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {courseLengthLabel && (
            <Badge variant="secondary" className="gap-1 py-1">
              <Route className="w-3 h-3" />
              {courseLengthLabel}
            </Badge>
          )}
          {courseClimbLabel && (
            <Badge variant="secondary" className="gap-1 py-1">
              <Mountain className="w-3 h-3" />
              {courseClimbLabel}
            </Badge>
          )}
        </div>

        {showPublicationAlert && (
          <Alert
            className="mt-1"
            severity={
              splitPublicationStatus?.reason === 'DISABLED' ? 'warning' : 'info'
            }
            variant="outlined"
            title={getPublicationAlertTitle()}
          >
            <div className="space-y-3">
              <p>{getPublicationAlertDescription()}</p>
              {splitPublishAt && (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide">
                    {t(
                      'Pages.Event.Splits.Publication.CountdownLabel',
                      'Countdown to publication'
                    )}
                  </p>
                  <CountdownTimer expiryDate={splitPublishAt} />
                </div>
              )}
            </div>
          </Alert>
        )}

        {!showPublicationAlert && (
          <>
            <TabsContent value="table" className="mt-4">
              <SplitTable
                competitors={competitors}
                isLoading={splitDataLoading}
                error={splitDataError}
              />
            </TabsContent>

            <TabsContent value="chart" className="mt-4">
              <SplitChart
                competitors={competitors}
                isLoading={splitDataLoading}
                error={splitDataError}
              />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
};
