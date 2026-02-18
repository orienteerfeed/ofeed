import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatSecondsToTime, formatTimeToHms } from '@/lib/date';
import { Event } from '@/types/event';
import { gql } from '@apollo/client';
import { useQuery, useSubscription } from '@apollo/client/react';
import { useNavigate } from '@tanstack/react-router';
import { TFunction } from 'i18next';
import { ChevronDown, Loader2, Radio, Trophy, Users } from 'lucide-react';
import { motion } from 'motion/react';
import React, { useEffect, useRef, useState } from 'react';
import { Badge, Button, CountryFlag } from '../../components/atoms';
import { Alert } from '../../components/organisms';
import { CompetitorName } from './CompetitorName';
import { EventCategorySwitcher } from './EventCategorySwitcher';

// GraphQL queries and subscriptions
const COMPETITORS_BY_CLASS_UPDATED = gql`
  subscription CompetitorsByClassUpdated($classId: Int!) {
    competitorsByClassUpdated(classId: $classId) {
      id
      firstname
      lastname
      registration
      bibNumber
      organisation
      card
      startTime
      finishTime
      time
      ranking
      rankPointsAvg
      status
      lateStart
      note
    }
  }
`;

const ORGANISATIONS = gql`
  query Organisations($eventId: String!) {
    organisations(eventId: $eventId) {
      name
      competitors
    }
  }
`;

const COMPETITORS_BY_ORGANISATION = gql`
  query CompetitorsByOrganisation($eventId: String!, $organisation: String!) {
    competitorsByOrganisation(eventId: $eventId, organisation: $organisation) {
      id
      firstname
      lastname
      registration
      bibNumber
      organisation
      card
      startTime
      finishTime
      time
      ranking
      rankPointsAvg
      status
      lateStart
      note
      class {
        id
        name
        competitors {
          id
          time
          status
        }
      }
    }
  }
`;

const RELAY_RESULTS_UPDATED = gql`
  subscription RelayResultsUpdated($eventId: String!, $classId: Int!) {
    relayResultsUpdated(eventId: $eventId, classId: $classId) {
      id
      rank
      teamName
      club
      countryCode
      totalTime
      behind
      legs {
        legNumber
        runnerName
        time
        rank
        status
      }
    }
  }
`;

// Type definitions
interface CompetitorsByClassUpdatedResponse {
  competitorsByClassUpdated: Competitor[];
}

interface RelayResultsUpdatedResponse {
  relayResultsUpdated: RelayResult[];
}

interface EventResultsViewProps {
  t: TFunction;
  event: Event;
}

type ViewMode = 'category' | 'club' | 'live';

interface Competitor {
  id: string;
  firstname: string;
  lastname: string;
  registration: string;
  bibNumber?: string;
  organisation: string;
  card?: string;
  startTime?: string;
  finishTime?: string;
  time?: number;
  ranking?: number;
  rankPointsAvg?: number;
  status: string;
  lateStart?: boolean;
  note?: string;
}

interface ProcessedCompetitor extends Competitor {
  position?: number | string | undefined;
  positionTooltip?: string | undefined;
  loss?: number | undefined;
}

interface OrganisationsResponse {
  organisations: Organisation[];
}

interface CompetitorsByOrganisationResponse {
  competitorsByOrganisation: Competitor[];
}

interface Organisation {
  name: string;
  competitors: number;
}

interface ClubRunner {
  id: string;
  firstname: string;
  lastname: string;
  class: string;
  time: string;
  status: string;
  position: number | string;
  startTime?: string | undefined;
  loss?: number | undefined;
  classId?: string | undefined;
}

interface ProcessedClubResult {
  club: string;
  countryCode: string;
  country: string;
  runners: ClubRunner[];
}

interface RelayResult {
  id: string;
  rank: number;
  teamName: string;
  club: string;
  countryCode: string;
  totalTime: string;
  behind?: string;
  legs: {
    legNumber: number;
    runnerName: string;
    time: string;
    rank: number;
    status: 'finished' | 'running' | 'not_started';
  }[];
}

export const EventResultsView = ({ t, event }: EventResultsViewProps) => {
  const isRelay = event.discipline === 'relay';
  const navigate = useNavigate();

  // Get current search params
  const searchParams = new URLSearchParams(window.location.search);
  const classFromUrl = searchParams.get('class');

  // Load selected class from URL parameter or use first available class
  const initialClass = classFromUrl || event.classes?.[0]?.name || '';

  const [selectedClass, setSelectedClass] = useState(initialClass);
  const [viewMode, setViewMode] = useState<ViewMode>('category');
  const [selectedClub, setSelectedClub] = useState<string | null>(null);
  const [isClubSheetOpen, setIsClubSheetOpen] = useState(false);
  const [categoryCompetitorsCount, setCategoryCompetitorsCount] =
    useState<number>(0);
  const [isCategoryLoading, setIsCategoryLoading] = useState(false);

  // Get current class object
  const currentClass = event.classes?.find(cls => cls.name === selectedClass);

  // Get class ID from class name
  const selectedClassId = currentClass?.id;

  useEffect(() => {
    setCategoryCompetitorsCount(0);
  }, [selectedClassId]);

  useEffect(() => {
    if (viewMode !== 'category') {
      setIsCategoryLoading(false);
      setCategoryCompetitorsCount(0);
    }
  }, [viewMode]);

  const { data: organisationsData, loading: organisationsLoading } =
    useQuery<OrganisationsResponse>(ORGANISATIONS, {
      variables: { eventId: event.id },
      pollInterval: 15000,
      skip: viewMode !== 'club',
    });

  // Synchronize URL when selectedClass changes
  useEffect(() => {
    if (selectedClass && selectedClass !== classFromUrl) {
      const newSearchParams = new URLSearchParams(window.location.search);
      newSearchParams.set('class', selectedClass);

      navigate({
        to: window.location.pathname,
        search: Object.fromEntries(newSearchParams),
        replace: true,
      });
    }
  }, [selectedClass, classFromUrl, navigate]);

  const handleClassChange = (className: string) => {
    setSelectedClass(className);
  };

  if (isRelay) {
    return (
      <RelayResultsView
        event={event}
        selectedClass={selectedClass}
        setSelectedClass={setSelectedClass}
        availableClasses={event.classes?.map(cls => cls.name) || []}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 z-10 bg-background border-b border-border pb-2 mb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 p-0.5 bg-muted rounded-md">
            <Button
              variant={viewMode === 'category' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-2 gap-1"
              onClick={() => setViewMode('category')}
            >
              <Trophy className="w-3 h-3" />
              <span className="text-xs font-medium">
                {t('Pages.Event.Tabs.Cat')}
              </span>
            </Button>
            <Button
              variant={viewMode === 'club' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-2 gap-1"
              onClick={() => setViewMode('club')}
            >
              <Users className="w-3 h-3" />
              <span className="text-xs font-medium">
                {t('Pages.Event.Tabs.Club')}
              </span>
            </Button>
            <Button
              variant={viewMode === 'live' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-2 gap-1"
              onClick={() => setViewMode('live')}
            >
              <Radio className="w-3 h-3" />
              <span className="text-xs font-medium">
                {t('Pages.Event.Tabs.Live')}
              </span>
            </Button>
          </div>

          {viewMode === 'category' && event.classes && currentClass && (
            <EventCategorySwitcher
              classes={event.classes}
              selectedClass={selectedClassId || 0}
              onClassChange={classId => {
                const classItem = event.classes?.find(
                  cls => cls.id === classId
                );
                if (classItem) {
                  handleClassChange(classItem.name);
                }
              }}
              currentClass={currentClass}
              competitorsCount={categoryCompetitorsCount}
              loading={isCategoryLoading}
            />
          )}

          {viewMode === 'club' && (
            <Sheet open={isClubSheetOpen} onOpenChange={setIsClubSheetOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 gap-1 min-w-[120px] bg-transparent"
                  disabled={
                    organisationsLoading ||
                    !organisationsData?.organisations?.length
                  }
                >
                  <Users className="w-3 h-3 shrink-0" />
                  <span className="text-xs font-bold truncate max-w-[120px]">
                    {selectedClub || 'Select Club'}
                  </span>
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-[80vh] max-h-[80vh]">
                <div className="flex flex-col h-full pt-4">
                  <div className="text-left mb-6">
                    <SheetTitle className="text-xl font-bold">
                      Select Club
                    </SheetTitle>
                    <SheetDescription className="text-muted-foreground mt-1">
                      Choose a club to view results
                    </SheetDescription>
                  </div>

                  <div className="flex-1 overflow-y-auto">
                    {organisationsLoading && (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-6 h-6 animate-spin mr-2" />
                        <span>{t('Pages.Event.Results.LoadingClubs')}</span>
                      </div>
                    )}

                    {!organisationsLoading &&
                      organisationsData?.organisations?.length && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 pb-4">
                          {organisationsData.organisations.map(org => (
                            <Button
                              key={org.name}
                              variant={
                                selectedClub === org.name
                                  ? 'default'
                                  : 'outline'
                              }
                              className="h-auto min-h-[80px] flex flex-col items-center justify-center p-3 text-center"
                              onClick={() => {
                                setSelectedClub(org.name);
                                setIsClubSheetOpen(false);
                              }}
                            >
                              <div className="flex flex-col items-center justify-center w-full gap-1">
                                <span className="text-sm font-semibold leading-tight break-words text-center w-full">
                                  {org.name}
                                </span>
                                <Badge
                                  variant="secondary"
                                  className="text-xs font-normal"
                                >
                                  {org.competitors} runners
                                </Badge>
                              </div>
                            </Button>
                          ))}
                        </div>
                      )}

                    {!organisationsLoading &&
                      !organisationsData?.organisations?.length && (
                        <div className="text-center py-12 text-muted-foreground">
                          No clubs found
                        </div>
                      )}
                  </div>

                  <div className="border-t pt-4 mt-4">
                    <Button
                      variant="ghost"
                      className="w-full"
                      onClick={() => setIsClubSheetOpen(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          )}
        </div>
      </div>

      {/* Category View */}
      {viewMode === 'category' && selectedClassId && (
        <CategoryResultsView
          t={t}
          eventId={event.id}
          classId={selectedClassId}
          className={selectedClass}
          showRanking={
            event.ranking &&
            (selectedClass.startsWith('D21') ||
              selectedClass.startsWith('H21') ||
              selectedClass.startsWith('M21') ||
              selectedClass.startsWith('W21'))
          }
          onCompetitorsCountChange={setCategoryCompetitorsCount}
          onLoadingChange={setIsCategoryLoading}
        />
      )}
      {viewMode === 'category' && !selectedClassId && (
        <Alert
          severity="warning"
          variant="outlined"
          title={t('Pages.Event.Alert.EventDataNotAvailableTitle')}
        >
          {t('Pages.Event.Alert.EventDataNotAvailableMessage', {
            view: t('Pages.Event.Alert.ViewResults'),
          })}
        </Alert>
      )}

      {/* Club View */}
      {viewMode === 'club' && (
        <ClubResultsView
          t={t}
          eventId={event.id}
          selectedClub={selectedClub}
          setSelectedClub={setSelectedClub}
          organisationsData={organisationsData}
          organisationsLoading={organisationsLoading}
        />
      )}

      {viewMode === 'live' && (
        <div className="border border-border rounded-lg p-8 text-center">
          <Radio className="w-12 h-12 mx-auto mb-4 text-muted-foreground animate-pulse" />
          <h3 className="text-xl font-bold mb-2">
            {t('Pages.Event.Live.Title')}
          </h3>
          <p className="text-muted-foreground">
            {t('Pages.Event.Live.Description')}
          </p>
        </div>
      )}
    </div>
  );
};

// Category Results Component
interface CategoryResultsViewProps {
  t: TFunction;
  eventId: string;
  classId: number;
  className: string;
  showRanking?: boolean;
  onCompetitorsCountChange?: (count: number) => void;
  onLoadingChange?: (loading: boolean) => void;
}

const CategoryResultsView = ({
  t,
  classId,
  showRanking,
  onCompetitorsCountChange,
  onLoadingChange,
}: CategoryResultsViewProps) => {
  const [competitors, setCompetitors] = useState<ProcessedCompetitor[]>([]);
  const [highlightedRows, setHighlightedRows] = useState<string[]>([]);
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const previousCompetitorsRef = React.useRef<Competitor[]>([]);

  const { loading, error, data } =
    useSubscription<CompetitorsByClassUpdatedResponse>(
      COMPETITORS_BY_CLASS_UPDATED,
      {
        variables: { classId },
      }
    );

  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);

  // Update current time every second for active competitors
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Process competitors data
  useEffect(() => {
    if (data?.competitorsByClassUpdated) {
      const newCompetitors = data.competitorsByClassUpdated;

      // Highlight changes
      if (previousCompetitorsRef.current.length > 0) {
        const changedIds = newCompetitors
          .filter((newComp: Competitor) => {
            const prevComp = previousCompetitorsRef.current.find(
              prev => prev.id === newComp.id
            );
            return (
              prevComp && JSON.stringify(newComp) !== JSON.stringify(prevComp)
            );
          })
          .map((comp: Competitor) => comp.id);

        setHighlightedRows(changedIds);
        setTimeout(() => setHighlightedRows([]), 10000);
      }

      // Process and set competitors
      const processed = processCompetitors(newCompetitors);
      setCompetitors(processed);
      previousCompetitorsRef.current = newCompetitors;
    }
  }, [data]);

  useEffect(() => {
    onCompetitorsCountChange?.(competitors.length);
  }, [competitors.length, onCompetitorsCountChange]);

  // Calculate running time for active competitors
  const getRunningTime = (startTime?: string): string => {
    if (!startTime) return '-';

    try {
      // Parse ISO 8601 string to timestamp
      const start = new Date(startTime).getTime();

      // Handle invalid date
      if (isNaN(start)) return '-';

      // Use currentTime from state instead of Date.now()
      const runningTime = Math.floor((currentTime - start) / 1000);

      // Ensure runningTime is not negative
      if (runningTime < 0) return '-';

      return formatSecondsToTime(runningTime);
    } catch {
      return '-';
    }
  };

  if (loading && competitors.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span>{t('Pages.Event.Results.Loading')}</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        severity="error"
        variant="outlined"
        title="Error loading results"
      >
        {error.message}
      </Alert>
    );
  }

  if (!loading && competitors.length === 0) {
    return (
      <Alert
        severity="info"
        variant="outlined"
        title={t('Pages.Event.Alert.EventDataNotAvailableTitle')}
      >
        {t('Pages.Event.Alert.EventDataNotAvailableMessage', {
          view: t('Pages.Event.Alert.ViewResults'),
        })}
      </Alert>
    );
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="h-8 px-2 text-xs">#</TableHead>
              <TableHead className="h-8 px-2 text-xs">Name</TableHead>
              <TableHead className="h-8 px-2 text-xs hidden lg:table-cell">
                Club
              </TableHead>
              <TableHead className="h-8 px-2 text-xs hidden 2xl:table-cell">
                Bib
              </TableHead>
              <TableHead className="h-8 px-2 text-xs hidden xl:table-cell">
                Card
              </TableHead>
              <TableHead className="h-8 px-2 text-xs hidden md:table-cell">
                Start
              </TableHead>
              <TableHead className="h-8 px-2 text-xs">Finish</TableHead>
              <TableHead className="h-8 px-2 text-xs text-right">
                Diff
              </TableHead>
              {showRanking && (
                <TableHead className="h-8 px-2 text-xs hidden lg:table-cell">
                  Points
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {competitors.map((competitor, index) => {
              const isActive = competitor.status === 'Active';
              const textClass = isActive
                ? 'text-muted-foreground text-xs'
                : 'text-sm';
              return (
                <motion.tr
                  key={competitor.id}
                  layout
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 100, damping: 15 }}
                  className={`h-9 ${
                    highlightedRows.includes(competitor.id)
                      ? 'bg-orange-200 dark:bg-orange-800'
                      : index % 2 === 0
                        ? 'bg-background hover:bg-muted/30'
                        : 'bg-muted/20 hover:bg-muted/40'
                  }`}
                >
                  <TableCell
                    className="px-2 py-1 text-sm font-bold"
                    title={competitor.positionTooltip || ''}
                  >
                    {competitor.position}
                    {typeof competitor.position === 'number' && '.'}
                  </TableCell>
                  <TableCell className="px-2 py-1 text-sm font-medium">
                    <div className="flex flex-col">
                      <CompetitorName competitor={competitor} />
                      <span className="text-xs text-muted-foreground lg:hidden mt-0.5">
                        {competitor.organisation}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="px-2 py-1 text-xs text-muted-foreground hidden lg:table-cell">
                    {competitor.organisation}
                  </TableCell>
                  <TableCell className="px-2 py-1 text-xs font-mono hidden 2xl:table-cell">
                    {competitor.bibNumber}
                  </TableCell>
                  <TableCell className="px-2 py-1 text-xs font-mono hidden xl:table-cell">
                    {competitor.card}
                  </TableCell>
                  <TableCell className="px-2 py-1 text-xs font-mono hidden md:table-cell">
                    {competitor.startTime &&
                      formatTimeToHms(competitor.startTime)}
                    {competitor.lateStart && <span title="Late start">⚠️</span>}
                  </TableCell>
                  <TableCell
                    className={`px-2 py-1 text-xs font-mono ${textClass}`}
                  >
                    {isActive ? (
                      <span className="text-muted-foreground">
                        {getRunningTime(competitor.startTime)}
                      </span>
                    ) : (
                      competitor.time && formatSecondsToTime(competitor.time)
                    )}
                  </TableCell>
                  <TableCell className="px-2 py-1 text-sm text-right font-mono font-bold">
                    {competitor.loss && competitor.loss > 0
                      ? `+${formatSecondsToTime(competitor.loss)}`
                      : '-'}
                  </TableCell>
                  {showRanking && (
                    <TableCell className="px-2 py-1 hidden lg:table-cell">
                      {competitor.ranking && (
                        <Badge
                          variant={
                            competitor.ranking > (competitor.rankPointsAvg || 0)
                              ? 'default'
                              : 'secondary'
                          }
                          className="text-xs"
                        >
                          {competitor.ranking}
                        </Badge>
                      )}
                    </TableCell>
                  )}
                </motion.tr>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

// Club Results Component
interface ClubResultsViewProps {
  t: TFunction;
  eventId: string;
  selectedClub: string | null;
  setSelectedClub: (club: string | null) => void;
  organisationsData: OrganisationsResponse | undefined;
  organisationsLoading: boolean;
}

const ClubResultsView = ({
  t,
  eventId,
  selectedClub,
  setSelectedClub,
  organisationsData,
  organisationsLoading,
}: ClubResultsViewProps) => {
  const scrollPositionRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch competitors for selected club with polling
  const {
    data: competitorsData,
    loading: competitorsLoading,
    error: competitorsError,
  } = useQuery<CompetitorsByOrganisationResponse>(COMPETITORS_BY_ORGANISATION, {
    variables: {
      eventId,
      organisation: selectedClub || '',
    },
    pollInterval: 15000,
    skip: !selectedClub,
  });

  // Save scroll position before re-render
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      scrollPositionRef.current = container.scrollTop;
    }
  });

  // Restore scroll position after re-render
  useEffect(() => {
    const container = containerRef.current;
    if (container && scrollPositionRef.current > 0) {
      container.scrollTop = scrollPositionRef.current;
    }
  });

  // Auto-select first organization if none selected
  useEffect(() => {
    const firstOrg = organisationsData?.organisations?.[0];
    if (firstOrg && !selectedClub) {
      setSelectedClub(firstOrg.name);
    }
  }, [organisationsData, selectedClub, setSelectedClub]);

  type CompetitorClassInfo = {
    id?: string | number | null;
    name?: string | null;
    competitors?: Array<{
      id?: string | number;
      status?: string | null;
      time?: number | null;
    }>;
  };

  type CompetitorWithClass = {
    id?: string | number;
    firstname?: string;
    lastname?: string;
    organisation?: string;
    competitorId?: number;
    status?: string | null;
    time?: number | null;
    startTime?: string | null;
    class?: CompetitorClassInfo | null;
  };

  const getCompetitorClassName = (competitor?: CompetitorWithClass | null) =>
    competitor?.class?.name ?? 'ZZZ';

  const getCompetitorClassId = (competitor?: CompetitorWithClass | null) =>
    competitor?.class?.id ?? undefined;

  // Function to calculate position and loss in category
  const calculatePositionAndLoss = (competitor: CompetitorWithClass) => {
    const classCompetitors = competitor.class?.competitors || [];

    // Filter only competitors with valid time and OK status for position calculation
    const validCompetitors = classCompetitors
      .filter(
        (
          comp
        ): comp is { id?: string | number; status?: string | null; time: number } =>
          comp.status === 'OK' && comp.time !== null && comp.time !== undefined
      )
      .sort((a, b) => a.time - b.time);

    // Find best time in category (only from OK status competitors)
    const bestTime =
      validCompetitors.length > 0 ? validCompetitors[0]?.time ?? null : null;

    // For non-OK status competitors, return appropriate position emoji
    if (competitor.status !== 'OK') {
      let positionWithEmoji: string;

      switch (competitor.status) {
        case 'Active':
          positionWithEmoji = '🏃';
          break;
        case 'DidNotFinish':
          positionWithEmoji = '🏳️';
          break;
        case 'DidNotStart':
          positionWithEmoji = '🚷';
          break;
        case 'Disqualified':
          positionWithEmoji = '🟥';
          break;
        case 'Finished':
          positionWithEmoji = '🏁';
          break;
        case 'Inactive':
          positionWithEmoji = '🛏️';
          break;
        case 'MissingPunch':
          positionWithEmoji = '🙈';
          break;
        case 'NotCompeting':
          positionWithEmoji = '🦄';
          break;
        case 'OverTime':
          positionWithEmoji = '⌛';
          break;
        default:
          positionWithEmoji = '❓';
      }

      return { position: positionWithEmoji, loss: undefined };
    }

    // For OK status competitors, calculate actual position
    if (validCompetitors.length === 0) {
      return { position: '❓', loss: undefined };
    }

    // Find position of current competitor
    let position = 1;
    let previousTime: number | null = null;
    let currentPosition = 1;

    for (let i = 0; i < validCompetitors.length; i++) {
      const comp = validCompetitors[i];
      if (!comp) continue;

      if (previousTime !== null && comp.time === previousTime) {
        // Same time - same position
        if (comp.id != null && competitor.id != null) {
          if (String(comp.id) === String(competitor.id)) {
            position = currentPosition;
          }
        }
      } else {
        // Different time - new position
        currentPosition = i + 1;
        if (comp.id != null && competitor.id != null) {
          if (String(comp.id) === String(competitor.id)) {
            position = currentPosition;
          }
        }
      }

      previousTime = comp.time ?? null;
    }

    // Calculate loss only for OK status competitors with valid time
    const loss =
      competitor.time && bestTime && competitor.time > bestTime
        ? competitor.time - bestTime
        : undefined;

    return { position, loss };
  };

  // Process and group competitors by club and class
  const processClubResults = (): ProcessedClubResult[] => {
    if (
      !organisationsData?.organisations ||
      organisationsData.organisations.length === 0
    )
      return [];

    return organisationsData.organisations
      .map(org => {
        // Get all competitors for this organization
        const orgCompetitors =
          competitorsData?.competitorsByOrganisation?.filter(
            comp => comp.organisation === org.name
          ) || [];

        // Process each competitor with position and loss calculation
        const processedCompetitors = orgCompetitors
          .map(comp => {
            const { position, loss } = calculatePositionAndLoss(comp);
            return {
              competitor: comp,
              calculatedPosition: position,
              calculatedLoss: loss,
            };
          })
          // REMOVED FILTER - show all competitors regardless of status
          .sort((a, b) => {
            const classA = getCompetitorClassName(
              a.competitor as CompetitorWithClass
            );
            const classB = getCompetitorClassName(
              b.competitor as CompetitorWithClass
            );

            if (classA !== classB) {
              return classA.localeCompare(classB);
            }

            // Sort by status priority first
            const statusPriority = {
              OK: 0,
              Active: 1,
              Finished: 2,
              Inactive: 3,
              NotCompeting: 4,
              OverTime: 5,
              Disqualified: 6,
              MissingPunch: 7,
              DidNotFinish: 8,
              DidNotStart: 9,
            };

            const statusA =
              statusPriority[
                a.competitor.status as keyof typeof statusPriority
              ] || 10;
            const statusB =
              statusPriority[
                b.competitor.status as keyof typeof statusPriority
              ] || 10;

            if (statusA !== statusB) {
              return statusA - statusB;
            }

            // Same status - sort by position or time
            if (a.competitor.status === 'OK' && b.competitor.status === 'OK') {
              const posA =
                typeof a.calculatedPosition === 'number'
                  ? a.calculatedPosition
                  : 999;
              const posB =
                typeof b.calculatedPosition === 'number'
                  ? b.calculatedPosition
                  : 999;
              return posA - posB;
            }

            // For non-OK status, sort by start time
            return (
              new Date(a.competitor.startTime || 0).getTime() -
              new Date(b.competitor.startTime || 0).getTime()
            );
          });

        return {
          club: org.name,
          countryCode: 'CZ',
          country: 'Czech Republic',
          runners: processedCompetitors.map(item => {
            const comp = item.competitor;
            return {
              id: String(comp.id),
              firstname: comp.firstname,
              lastname: comp.lastname,
              class: getCompetitorClassName(comp as CompetitorWithClass) || 'N/A',
              time: comp.time ? formatSecondsToTime(comp.time) : '-',
              status: comp.status,
              position: item.calculatedPosition,
              startTime: comp.startTime || undefined,
              loss: item.calculatedLoss || undefined,
              classId: (() => {
                const classId = getCompetitorClassId(
                  comp as CompetitorWithClass
                );
                return classId != null ? String(classId) : undefined;
              })(),
            };
          }),
        };
      })
      .filter(clubResult => clubResult.runners.length > 0)
      .sort((a, b) => {
        // Sort clubs by best placement of their competitor in any category
        // Only consider OK status competitors for club ranking
        const aOkCompetitors = a.runners.filter(r => r.status === 'OK');
        const bOkCompetitors = b.runners.filter(r => r.status === 'OK');

        const aBestPosition =
          aOkCompetitors.length > 0
            ? Math.min(
                ...aOkCompetitors.map(r => {
                  const pos = r.position;
                  return typeof pos === 'number' ? pos : 999;
                })
              )
            : Infinity;
        const bBestPosition =
          bOkCompetitors.length > 0
            ? Math.min(
                ...bOkCompetitors.map(r => {
                  const pos = r.position;
                  return typeof pos === 'number' ? pos : 999;
                })
              )
            : Infinity;
        return aBestPosition - bBestPosition;
      });
  };

  // Group runners by class for display - using reduce for safer approach
  const groupRunnersByClass = (runners: ClubRunner[]) => {
    if (runners.length === 0) {
      return [];
    }

    return runners.reduce<{ className: string; runners: ClubRunner[] }[]>(
      (groups, runner) => {
        const lastGroup = groups[groups.length - 1];

        if (lastGroup && lastGroup.className === runner.class) {
          lastGroup.runners.push(runner);
        } else {
          groups.push({
            className: runner.class,
            runners: [runner],
          });
        }

        return groups;
      },
      []
    );
  };

  // Format start time for display
  const formatStartTime = (startTime?: string) => {
    if (!startTime) return '-';
    return formatTimeToHms(startTime);
  };

  // Get status text color
  const getStatusColor = (status: string) => {
    if (status === 'OK') return 'text-green-600 dark:text-green-400';
    if (status === 'Active') return 'text-blue-600 dark:text-blue-400';
    if (status === 'Finished') return 'text-orange-600 dark:text-orange-400';
    if (status === 'Inactive') return 'text-gray-600 dark:text-gray-400';
    if (status === 'MissingPunch') return 'text-red-600 dark:text-red-400';
    if (status === 'Disqualified') return 'text-red-600 dark:text-red-400';
    if (status === 'DidNotFinish') return 'text-red-600 dark:text-red-400';
    if (status === 'DidNotStart') return 'text-gray-600 dark:text-gray-400';
    if (status === 'NotCompeting') return 'text-gray-600 dark:text-gray-400';
    if (status === 'OverTime') return 'text-orange-600 dark:text-orange-400';
    return 'text-gray-600 dark:text-gray-400';
  };

  // Get status display text
  const getStatusDisplay = (status: string) => {
    const statusMap: Record<string, string> = {
      OK: 'OK',
      Active: 'Active',
      Finished: 'Finished',
      Inactive: 'Inactive',
      MissingPunch: 'MP',
      Disqualified: 'DSQ',
      DidNotFinish: 'DNF',
      DidNotStart: 'DNS',
      NotCompeting: 'NC',
      OverTime: 'OT',
    };
    return statusMap[status] || status;
  };

  const clubResults = processClubResults();

  if (organisationsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span>{t('Pages.Event.Results.LoadingClubs')}</span>
      </div>
    );
  }

  if (!organisationsData?.organisations) {
    return (
      <Alert
        severity="info"
        variant="outlined"
        title={t('Pages.Event.Alert.EventDataNotAvailableTitle')}
      >
        {t('Pages.Event.Alert.EventDataNotAvailableMessage', {
          view: t('Pages.Event.Alert.ViewClub'),
        })}
      </Alert>
    );
  }

  return (
    <div
      ref={containerRef}
      className="space-y-4 overflow-auto"
      style={{ maxHeight: 'calc(100vh - 200px)' }} // Adjust based on your layout
    >

      {competitorsLoading && clubResults.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          <span>{t('Pages.Event.Results.LoadingClubResults')}</span>
        </div>
      )}

      {competitorsError && (
        <div className="text-center py-8 text-destructive">
          {t('Pages.Event.Results.ErrorLoadingClubResults', {
            message: competitorsError.message,
          })}
        </div>
      )}

      {/* Club Results */}
      {clubResults.map(clubResult => (
        <div key={clubResult.club} className="space-y-3">
          <div className="flex items-center gap-3 px-2">
            <CountryFlag
              countryCode={clubResult.countryCode}
              className="w-8 h-6 shrink-0"
            />
            <h3 className="text-lg font-bold truncate">{clubResult.club}</h3>
            <Badge variant="outline" className="text-xs shrink-0">
              {clubResult.country}
            </Badge>
            <Badge variant="secondary" className="text-xs shrink-0">
              {clubResult.runners.length} runners
            </Badge>
          </div>

          <div className="border border-border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="h-8 px-2 text-xs w-12">#</TableHead>
                  <TableHead className="h-8 px-2 text-xs">Name</TableHead>
                  <TableHead className="h-8 px-2 text-xs w-20">Class</TableHead>
                  <TableHead className="h-8 px-2 text-xs w-20 hidden md:table-cell">
                    Start
                  </TableHead>
                  <TableHead className="h-8 px-2 text-xs text-right w-24">
                    Time
                  </TableHead>
                  <TableHead className="h-8 px-2 text-xs text-right w-20">
                    Diff
                  </TableHead>
                  <TableHead className="h-8 px-2 text-xs w-20">
                    Status
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupRunnersByClass(clubResult.runners).map(
                  (classGroup, groupIndex) => (
                    <React.Fragment key={classGroup.className}>
                      {groupIndex > 0 && (
                        <TableRow className="bg-muted/30">
                          <TableCell colSpan={7} className="p-0">
                            <div className="h-px bg-border" />
                          </TableCell>
                        </TableRow>
                      )}

                      {classGroup.runners.map((runner, index) => (
                        <TableRow
                          key={runner.id}
                          className={`h-9 ${
                            index % 2 === 0
                              ? 'bg-background hover:bg-muted/30'
                              : 'bg-muted/20 hover:bg-muted/40'
                          } ${runner.status !== 'OK' ? 'opacity-70' : ''}`}
                        >
                          <TableCell className="px-2 py-1 text-sm font-bold">
                            {typeof runner.position === 'number'
                              ? runner.position
                              : runner.position}
                            {typeof runner.position === 'number' && '.'}
                          </TableCell>
                          <TableCell className="px-2 py-1 text-sm font-medium">
                            <CompetitorName
                              competitor={{
                                firstname: runner.firstname,
                                lastname: runner.lastname,
                              }}
                            />
                          </TableCell>
                          <TableCell className="px-2 py-1">
                            <Badge variant="secondary" className="text-xs">
                              {runner.class}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-2 py-1 text-xs font-mono hidden md:table-cell">
                            {formatStartTime(runner.startTime)}
                          </TableCell>
                          <TableCell className="px-2 py-1 text-sm text-right font-mono font-bold">
                            {runner.time}
                          </TableCell>
                          <TableCell className="px-2 py-1 text-sm text-right font-mono">
                            {runner.loss && runner.loss > 0
                              ? `+${formatSecondsToTime(runner.loss)}`
                              : runner.loss === 0
                                ? '-'
                                : ''}
                          </TableCell>
                          <TableCell className="px-2 py-1">
                            <span
                              className={`text-xs font-medium ${getStatusColor(runner.status)}`}
                            >
                              {getStatusDisplay(runner.status)}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </React.Fragment>
                  )
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      ))}

      {clubResults.length === 0 && !competitorsLoading && (
        <Alert
          severity="info"
          variant="outlined"
          title={t('Pages.Event.Alert.EventDataNotAvailableTitle')}
        >
          {t('Pages.Event.Alert.EventDataNotAvailableMessage', {
            view: t('Pages.Event.Alert.ViewClub'),
          })}
        </Alert>
      )}
    </div>
  );
};

// Relay Results Component
interface RelayResultsViewProps {
  event: Event;
  selectedClass: string;
  setSelectedClass: (cls: string) => void;
  availableClasses: string[];
}

const RelayResultsView = ({
  event,
  selectedClass,
  setSelectedClass,
  availableClasses,
}: RelayResultsViewProps) => {
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [relayResults, setRelayResults] = useState<RelayResult[]>([]);
  const navigate = useNavigate();

  const selectedClassId = event.classes?.find(
    cls => cls.name === selectedClass
  )?.id;

  const { loading, data } = useSubscription<RelayResultsUpdatedResponse>(
    RELAY_RESULTS_UPDATED,
    {
      variables: {
        eventId: event.id,
        classId: selectedClassId,
      },
      skip: !selectedClassId,
    }
  );

  // Handler pro změnu třídy
  const handleClassChange = (cls: string) => {
    setSelectedClass(cls);
    const newSearchParams = new URLSearchParams(window.location.search);
    newSearchParams.set('class', cls);

    navigate({
      to: window.location.pathname,
      search: Object.fromEntries(newSearchParams),
      replace: true,
    });
    setIsSheetOpen(false);
  };

  useEffect(() => {
    if (data?.relayResultsUpdated) {
      setRelayResults(data.relayResultsUpdated);
    }
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold">Relay Results</h2>

        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 gap-1 min-w-[80px] bg-transparent"
            >
              <span className="text-xs font-bold">{selectedClass}</span>
              <ChevronDown className="h-3 w-3" />
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[60vh]">
            <SheetHeader>
              <SheetTitle>Select Class</SheetTitle>
              <SheetDescription className="sr-only">
                Choose a competition class from the available options
              </SheetDescription>
            </SheetHeader>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-6 overflow-y-auto max-h-[calc(60vh-100px)]">
              {availableClasses.map(cls => (
                <Button
                  key={cls}
                  variant={selectedClass === cls ? 'default' : 'outline'}
                  className="h-14 text-lg font-bold"
                  onClick={() => handleClassChange(cls)}
                >
                  {cls}
                </Button>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {loading && relayResults.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          <span>Loading relay results...</span>
        </div>
      )}

      <div className="space-y-4">
        {relayResults.map(result => (
          <div
            key={result.id}
            className="border border-border rounded-lg overflow-hidden"
          >
            <div
              className="p-4 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() =>
                setExpandedTeam(expandedTeam === result.id ? null : result.id)
              }
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-2xl font-bold">
                    {result.rank === 1 && '🥇'}
                    {result.rank === 2 && '🥈'}
                    {result.rank === 3 && '🥉'}
                    {result.rank > 3 && result.rank}
                  </span>
                  <div>
                    <div className="font-bold text-lg">{result.teamName}</div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CountryFlag
                        countryCode={result.countryCode}
                        className="w-5 h-3"
                      />
                      <span>{result.club}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-lg">
                    {result.totalTime}
                  </div>
                  {result.behind && (
                    <div className="text-sm text-muted-foreground font-mono">
                      {result.behind}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {expandedTeam === result.id && (
              <div className="border-t border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/20">
                      <TableHead className="w-16">Leg</TableHead>
                      <TableHead>Runner</TableHead>
                      <TableHead className="text-right">Time</TableHead>
                      <TableHead className="text-right">Rank</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.legs.map(leg => (
                      <TableRow key={leg.legNumber}>
                        <TableCell className="font-bold">
                          {leg.legNumber}
                        </TableCell>
                        <TableCell>{leg.runnerName}</TableCell>
                        <TableCell className="text-right font-mono">
                          {leg.time}
                        </TableCell>
                        <TableCell className="text-right">
                          {leg.rank === 1 ? (
                            <Badge variant="default" className="bg-primary">
                              {leg.rank}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">
                              {leg.rank}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// Helper functions for data processing
const processCompetitors = (
  competitors: Competitor[]
): ProcessedCompetitor[] => {
  const getSortableStartTime = (startTime?: string): number => {
    if (!startTime) return Number.POSITIVE_INFINITY;
    const timestamp = new Date(startTime).getTime();
    return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
  };

  const statusPriority = {
    OK: 0,
    Active: 1,
    Finished: 2,
    Inactive: 3,
    NotCompeting: 4,
    OverTime: 5,
    Disqualified: 6,
    MissingPunch: 7,
    DidNotFinish: 8,
    DidNotStart: 9,
  };

  const sortedCompetitors = competitors.slice().sort((a, b) => {
    const statusA =
      statusPriority[a.status as keyof typeof statusPriority] ?? 10;
    const statusB =
      statusPriority[b.status as keyof typeof statusPriority] ?? 10;
    const startTimeDiff =
      getSortableStartTime(a.startTime) - getSortableStartTime(b.startTime);

    // If both have OK status, sort by time (fastest first)
    if (a.status === 'OK' && b.status === 'OK') {
      return (a.time || 0) - (b.time || 0);
    }

    // If only A has OK status, A comes before B
    if (a.status === 'OK' && b.status !== 'OK') {
      return -1;
    }

    // If only B has OK status, B comes before A
    if (a.status !== 'OK' && b.status === 'OK') {
      return 1;
    }

    // Keep competitors ordered by start time after startlist upload
    if (a.status === 'Inactive' && b.status === 'Inactive') {
      return startTimeDiff;
    }

    // Both don't have OK status - sort by status priority
    if (statusA !== statusB) {
      return statusA - statusB;
    }

    // Same status (both non-OK) - sort by start time
    return startTimeDiff;
  });

  return calculatePositions(sortedCompetitors);
};

// Refactored calculatePositions function with proper TypeScript types
const calculatePositions = (runners: Competitor[]): ProcessedCompetitor[] => {
  const positionsMap = new Map<
    string,
    { position: number | string; positionTooltip?: string; loss?: number }
  >();

  const finishedRunners = runners
    .filter(
      (runner): runner is Competitor & { time: number } =>
        runner.status === 'OK' && runner.time !== undefined
    )
    .sort((a, b) => a.time - b.time);

  let position = 1;
  for (let i = 0; i < finishedRunners.length; i++) {
    const currentRunner = finishedRunners[i]!;
    const prevRunner = i > 0 ? finishedRunners[i - 1] : undefined;

    const assignedPosition =
      prevRunner && currentRunner.time === prevRunner.time
        ? (positionsMap.get(prevRunner.id)?.position as number)
        : position;

    positionsMap.set(currentRunner.id, { position: assignedPosition });
    position++;
  }

  const leaderTime = finishedRunners[0]?.time ?? null;

  return runners.map((runner): ProcessedCompetitor => {
    const positionData = positionsMap.get(runner.id);

    if (positionData) {
      const lossToLeader =
        leaderTime !== null && runner.time !== undefined
          ? runner.time - leaderTime
          : undefined;

      // DŮLEŽITÉ: nepřidávat pole s hodnotou undefined
      return {
        ...runner,
        position: positionData.position,
        ...(lossToLeader !== undefined ? { loss: lossToLeader } : {}),
      };
    }

    // Non-finished běžci
    let positionWithEmoji: string;
    let positionTooltip: string;

    switch (runner.status) {
      case 'Active':
        positionWithEmoji = '🏃';
        positionTooltip = 'Giving it their all right now';
        break;
      case 'DidNotFinish':
        positionWithEmoji = '🏳️';
        positionTooltip = 'Did Not Finish';
        break;
      case 'DidNotStart':
        positionWithEmoji = '🚷';
        positionTooltip = 'Did not start';
        break;
      case 'Disqualified':
        positionWithEmoji = '🟥';
        positionTooltip = 'Disqualified';
        break;
      case 'Finished':
        positionWithEmoji = '🏁';
        positionTooltip = 'Waiting for readout';
        break;
      case 'Inactive':
        positionWithEmoji = '🛏️';
        positionTooltip = 'Waiting for start time';
        break;
      case 'MissingPunch':
        positionWithEmoji = '🙈';
        positionTooltip = 'Missing Punch';
        break;
      case 'NotCompeting':
        positionWithEmoji = '🦄';
        positionTooltip = 'Not competing';
        break;
      case 'OverTime':
        positionWithEmoji = '⌛';
        positionTooltip = 'Over Time';
        break;
      default:
        positionWithEmoji = '❓';
        positionTooltip = 'Unknown status';
    }

    return {
      ...runner,
      position: positionWithEmoji,
      positionTooltip,
    };
  });
};
