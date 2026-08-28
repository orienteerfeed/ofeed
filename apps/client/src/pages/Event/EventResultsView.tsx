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
import { cn } from '@/lib/utils';
import { Event } from '@/types/event';
import { gql } from '@apollo/client';
import { useQuery, useSubscription } from '@apollo/client/react';
import { useNavigate } from '@tanstack/react-router';
import { TFunction } from 'i18next';
import { ChevronDown, Loader2, Radio, Trophy, Users } from 'lucide-react';
import { motion } from 'motion/react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, CountryFlag, Tooltip } from '../../components/atoms';
import { Alert } from '../../components/organisms';
import { CompetitorName, getMobileCompetitorName } from './CompetitorName';
import { EventCategorySwitcher } from './EventCategorySwitcher';
import { LiveResultsView } from './LiveResultsView';
import { MobileClubName } from './MobileClubName';
import {
  compareByStatusPriorityThenName,
  formatResultListRank,
  getResultStatusDisplay,
  getResultStatusLabel,
  getResultStatusPriority,
  isUnorderedResultListMode,
  shouldDisplayResultTimeLoss,
  shouldDisplayResultTimes,
} from './result-list.utils';
import { computeRelayCumulativeStandings } from './relay-results.utils';
import {
  computeLoss,
  hasValidRaceTime,
  rankByTime,
  formatSignedLoss,
  type TimedEntry,
  type TimeRanking,
} from './result-ranking.utils';
import { WinnerNotification } from './WinnerNotifications';

const CLUB_SHEET_MIN_HEIGHT = 200;
const CLUB_SHEET_DEFAULT_RATIO = 0.8;
const CLUB_SHEET_MAX_RATIO = 0.9;
const CLUB_SHEET_DISMISS_THRESHOLD = 56;

const getClubSheetDefaultHeight = () =>
  typeof window !== 'undefined'
    ? Math.round(window.innerHeight * CLUB_SHEET_DEFAULT_RATIO)
    : 600;

const getClubSheetMaxHeight = () =>
  typeof window !== 'undefined'
    ? Math.round(window.innerHeight * CLUB_SHEET_MAX_RATIO)
    : 800;

const mobileResultsTableClassName =
  'overflow-x-auto [&_table]:text-sm [&_th]:h-7 sm:[&_th]:h-8 [&_th]:px-1.5 sm:[&_th]:px-2 [&_th]:text-xs [&_td]:px-1.5 sm:[&_td]:px-2 [&_td]:py-0.5 sm:[&_td]:py-1 [&_td]:text-sm';

const getActiveTimeState = (
  startTime: string | undefined,
  currentTime: number
): { value: string; className: string } => {
  if (!startTime) {
    return { value: '-', className: 'text-muted-foreground' };
  }

  try {
    const start = new Date(startTime).getTime();

    if (Number.isNaN(start)) {
      return { value: '-', className: 'text-muted-foreground' };
    }

    const elapsedSeconds = Math.floor((currentTime - start) / 1000);

    if (elapsedSeconds < 0) {
      const secondsUntilStart = Math.abs(elapsedSeconds);
      const className =
        secondsUntilStart <= 5
          ? 'animate-pulse text-orange-600 dark:text-orange-400'
          : 'text-muted-foreground';

      return {
        value: `- ${formatSecondsToTime(secondsUntilStart)}`,
        className,
      };
    }

    const className =
      elapsedSeconds <= 5
        ? 'animate-pulse text-green-600 dark:text-green-400'
        : 'text-muted-foreground';

    return {
      value: formatSecondsToTime(elapsedSeconds),
      className,
    };
  } catch {
    return { value: '-', className: 'text-muted-foreground' };
  }
};

// GraphQL queries and subscriptions
const COMPETITORS_BY_CLASS_UPDATED = gql`
  subscription CompetitorsByClassUpdated($classId: Int!) {
    competitorsByClassUpdated(classId: $classId) {
      id
      firstname
      lastname
      registration
      bibNumber
      organisationId
      organisation
      card
      startTime
      finishTime
      time
      rankingPoints
      rankingReferenceValue
      countsTowardsRanking
      countsTowardsRankingReason
      status
      lateStart
      note
      leg
      teamId
      team {
        id
        name
      }
    }
  }
`;

const ORGANISATIONS = gql`
  query OrganisationNames($eventId: String!) {
    organisationNames(eventId: $eventId) {
      id
      name
      countryCode
      country
      competitors
    }
  }
`;

/** `$isRelay` gates the class-wide relay payload (names, legs, teams) that only
 *  the relay overall table needs — individual events keep the slim selection. */
const COMPETITORS_BY_ORGANISATION = gql`
  query CompetitorsByOrganisation(
    $eventId: String!
    $organisationId: Int!
    $isRelay: Boolean!
  ) {
    competitorsByOrganisation(
      eventId: $eventId
      organisationId: $organisationId
    ) {
      id
      firstname
      lastname
      registration
      bibNumber
      organisationId
      organisation
      card
      startTime
      finishTime
      time
      leg
      teamId
      rankingPoints
      rankingReferenceValue
      countsTowardsRanking
      countsTowardsRankingReason
      status
      lateStart
      note
      class {
        id
        name
        resultListMode
        competitors {
          id
          time
          status
          ... on Competitor @include(if: $isRelay) {
            firstname
            lastname
            organisation
            leg
            teamId
            team {
              id
              name
            }
          }
        }
      }
    }
  }
`;

// Type definitions
interface CompetitorsByClassUpdatedResponse {
  competitorsByClassUpdated: Competitor[];
}

interface EventResultsViewProps {
  t: TFunction;
  event: Event;
}

type ViewMode = 'category' | 'club' | 'live';
type CzechRankingType = 'FOREST' | 'SPRINT' | null;

interface Competitor {
  id: string;
  firstname: string;
  lastname: string;
  registration: string;
  bibNumber?: string;
  organisationId?: number | null;
  organisation: string;
  card?: string;
  startTime?: string;
  finishTime?: string;
  time?: number;
  rankingPoints?: number;
  rankingReferenceValue?: number;
  countsTowardsRanking?: boolean | null;
  countsTowardsRankingReason?: string | null;
  status: string;
  lateStart?: boolean;
  note?: string;
  leg?: number;
  teamId?: number;
  team?: { id: number; name: string } | null;
}

interface ProcessedCompetitor extends Competitor {
  position?: number | string | undefined;
  positionTooltip?: string | undefined;
  loss?: number | undefined;
}

interface OrganisationsResponse {
  organisationNames: Organisation[];
}

interface CompetitorsByOrganisationResponse {
  competitorsByOrganisation: Competitor[];
}

interface Organisation {
  id: number;
  name: string;
  countryCode?: string | null;
  country?: string | null;
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
  leg?: number | undefined;
  startTime?: string | undefined;
  loss?: number | undefined;
  classId?: string | undefined;
  resultListMode?: string | null | undefined;
}

interface ProcessedClubResult {
  clubId: number;
  club: string;
  countryCode: string;
  country: string;
  runners: ClubRunner[];
}

/** One class block of the club view for multi-leg disciplines: the club's teams
 *  as they stand in the class-wide relay table. */
interface ClubRelaySection {
  className: string;
  teams: TeamResult[];
}

export const EventResultsView = ({ t, event }: EventResultsViewProps) => {
  const isRelay = event.relay;
  const navigate = useNavigate();
  const czechRankingType: CzechRankingType =
    event.discipline === 'SPRINT'
      ? 'SPRINT'
      : event.discipline === 'MIDDLE' ||
          event.discipline === 'LONG' ||
          event.discipline === 'NIGHT'
        ? 'FOREST'
        : null;
  const isCzechRankingDiscipline = czechRankingType !== null;

  // Get current search params
  const searchParams = new URLSearchParams(window.location.search);
  const classFromUrl = searchParams.get('class');

  // Load selected class from URL parameter or use first available class
  const initialClass = classFromUrl || event.classes?.[0]?.name || '';

  const [selectedClass, setSelectedClass] = useState(initialClass);
  const [viewMode, setViewMode] = useState<ViewMode>('category');
  const { t: tLocal } = useTranslation();
  const [selectedClubId, setSelectedClubId] = useState<number | null>(null);
  const [isClubSheetOpen, setIsClubSheetOpen] = useState(false);
  const [clubSheetHeight, setClubSheetHeight] = useState(
    getClubSheetDefaultHeight
  );
  const [isClubSheetDragging, setIsClubSheetDragging] = useState(false);
  const clubDragState = useRef<{ startY: number; startHeight: number } | null>(
    null
  );

  useEffect(() => {
    if (isClubSheetOpen) setClubSheetHeight(getClubSheetDefaultHeight());
  }, [isClubSheetOpen]);

  const handleClubDragStart = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      clubDragState.current = {
        startY: e.clientY,
        startHeight: clubSheetHeight,
      };
      setIsClubSheetDragging(true);
    },
    [clubSheetHeight]
  );

  const handleClubDragMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!clubDragState.current) return;
      const delta = clubDragState.current.startY - e.clientY;
      const next = clubDragState.current.startHeight + delta;
      if (next < CLUB_SHEET_MIN_HEIGHT - CLUB_SHEET_DISMISS_THRESHOLD) {
        clubDragState.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
        setIsClubSheetDragging(false);
        setIsClubSheetOpen(false);
        return;
      }
      setClubSheetHeight(
        Math.min(getClubSheetMaxHeight(), Math.max(CLUB_SHEET_MIN_HEIGHT, next))
      );
    },
    []
  );

  const handleClubDragEnd = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      clubDragState.current = null;
      setIsClubSheetDragging(false);
    },
    []
  );
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

  return (
    <div className="flex flex-col h-full">
      <WinnerNotification eventId={event.id} />
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

          {/* Relay keeps its own class switcher next to the leg tabs. */}
          {viewMode === 'category' &&
            !isRelay &&
            event.classes &&
            currentClass && (
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
                    !organisationsData?.organisationNames?.length
                  }
                >
                  <Users className="w-3 h-3 shrink-0" />
                  <span className="text-xs font-bold truncate max-w-[120px]">
                    {organisationsData?.organisationNames?.find(
                      org => org.id === selectedClubId
                    )?.name || tLocal('Pages.Event.ClubSelect.Title')}
                  </span>
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="bottom"
                className="w-full rounded-t-2xl flex flex-col overflow-hidden p-0"
                style={{
                  height: clubSheetHeight,
                  maxHeight: '90vh',
                  transition: isClubSheetDragging
                    ? 'none'
                    : 'height 200ms ease',
                }}
              >
                <SheetHeader className="text-left shrink-0 px-6 pt-2">
                  <div
                    role="separator"
                    aria-orientation="horizontal"
                    aria-label="Resize panel"
                    onPointerDown={handleClubDragStart}
                    onPointerMove={handleClubDragMove}
                    onPointerUp={handleClubDragEnd}
                    onPointerCancel={handleClubDragEnd}
                    className={cn(
                      'group flex w-full touch-none cursor-row-resize select-none flex-col items-center pb-1 pt-1',
                      isClubSheetDragging && 'cursor-grabbing'
                    )}
                  >
                    <span className="h-1.5 w-12 rounded-full bg-muted-foreground/30 transition-colors group-hover:bg-muted-foreground/50" />
                  </div>
                  <SheetTitle className="text-xl font-bold">
                    {tLocal('Pages.Event.ClubSelect.Title')}
                  </SheetTitle>
                  <SheetDescription className="text-muted-foreground mt-1">
                    {tLocal('Pages.Event.ClubSelect.Description')}
                  </SheetDescription>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto px-6 pb-6">
                  {organisationsLoading && (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-6 h-6 animate-spin mr-2" />
                      <span>{t('Pages.Event.Results.LoadingClubs')}</span>
                    </div>
                  )}

                  {!organisationsLoading &&
                    organisationsData?.organisationNames?.length && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 pb-4">
                        {organisationsData.organisationNames.map(org => (
                          <Button
                            key={org.id}
                            variant={
                              selectedClubId === org.id ? 'default' : 'outline'
                            }
                            className="h-auto min-h-[80px] flex flex-col items-center justify-center p-3 text-center"
                            onClick={() => {
                              setSelectedClubId(org.id);
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
                    !organisationsData?.organisationNames?.length && (
                      <div className="text-center py-12 text-muted-foreground">
                        {tLocal('Pages.Event.ClubSelect.NoClubs')}
                      </div>
                    )}
                </div>

                <div className="border-t px-6 pt-4 pb-4 shrink-0">
                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={() => setIsClubSheetOpen(false)}
                  >
                    {tLocal('Pages.Event.ClubSelect.Cancel')}
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          )}
        </div>
      </div>

      {/* Category View - multi-leg disciplines get the relay tables instead */}
      {viewMode === 'category' && isRelay && (
        <RelayResultsView
          t={t}
          event={event}
          selectedClass={selectedClass}
          setSelectedClass={setSelectedClass}
        />
      )}
      {viewMode === 'category' && !isRelay && selectedClassId && (
        <CategoryResultsView
          t={t}
          eventId={event.id}
          classId={selectedClassId}
          className={selectedClass}
          resultListMode={currentClass?.resultListMode}
          rankingType={czechRankingType}
          onSelectClub={clubId => {
            if (clubId === null) return;
            setSelectedClubId(clubId);
            setViewMode('club');
          }}
          showRanking={
            event.ranking &&
            event.country?.countryCode === 'CZ' &&
            isCzechRankingDiscipline &&
            (selectedClass.startsWith('D20') ||
              selectedClass.startsWith('D21') ||
              selectedClass.startsWith('H20') ||
              selectedClass.startsWith('H21'))
          }
          onCompetitorsCountChange={setCategoryCompetitorsCount}
          onLoadingChange={setIsCategoryLoading}
        />
      )}
      {viewMode === 'category' && !isRelay && !selectedClassId && (
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
          isRelay={isRelay}
          selectedClubId={selectedClubId}
          setSelectedClubId={setSelectedClubId}
          organisationsData={organisationsData}
          organisationsLoading={organisationsLoading}
          onSelectClass={className => {
            setSelectedClass(className);
            setViewMode('category');
          }}
        />
      )}

      {viewMode === 'live' && (
        <LiveResultsView
          t={t}
          eventId={event.id}
          isRelay={isRelay}
          onSelectClass={className => {
            setSelectedClass(className);
            setViewMode('category');
          }}
          onSelectClub={clubId => {
            if (clubId === null) return;
            setSelectedClubId(clubId);
            setViewMode('club');
          }}
        />
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
  resultListMode?: string | null | undefined;
  rankingType?: CzechRankingType;
  onSelectClub: (clubId: number | null) => void;
  showRanking?: boolean;
  onCompetitorsCountChange?: (count: number) => void;
  onLoadingChange?: (loading: boolean) => void;
}

const CategoryResultsView = ({
  t,
  classId,
  resultListMode,
  rankingType = null,
  onSelectClub,
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
      const processed = processCompetitors(newCompetitors, resultListMode);
      setCompetitors(processed);
      previousCompetitorsRef.current = newCompetitors;
    }
  }, [data, resultListMode]);

  useEffect(() => {
    onCompetitorsCountChange?.(competitors.length);
  }, [competitors.length, onCompetitorsCountChange]);

  const getCategoryTimeState = (
    competitor: ProcessedCompetitor
  ): { value: string; className: string; hideOnDesktop?: boolean } => {
    if (competitor.status === 'Active') {
      return getActiveTimeState(competitor.startTime, currentTime);
    }

    if (competitor.status === 'Inactive') {
      return {
        value: competitor.startTime
          ? formatTimeToHms(competitor.startTime)
          : '-',
        className: 'text-muted-foreground',
        hideOnDesktop: Boolean(competitor.startTime),
      };
    }

    if (competitor.time !== undefined && competitor.time !== null) {
      return { value: formatSecondsToTime(competitor.time), className: '' };
    }

    return { value: '-', className: 'text-muted-foreground' };
  };

  const getRankingTypeLabel = (): string => {
    if (rankingType === 'FOREST') {
      return t('Pages.Event.Results.Ranking.ForestType');
    }

    if (rankingType === 'SPRINT') {
      return t('Pages.Event.Results.Ranking.SprintType');
    }

    return t('Pages.Event.Results.Ranking.GenericType');
  };

  const getRankingTooltipContent = (
    competitor: ProcessedCompetitor
  ): string => {
    const rankingTypeLabel = getRankingTypeLabel();

    if (competitor.countsTowardsRanking) {
      return t('Pages.Event.Results.Ranking.TooltipCounts', {
        rankingType: rankingTypeLabel,
      });
    }

    return t('Pages.Event.Results.Ranking.TooltipDoesNotCount', {
      rankingType: rankingTypeLabel,
    });
  };

  const renderClubButton = (
    clubName: string,
    clubId: number | null | undefined,
    className: string
  ): React.ReactNode => {
    if (!clubName || !clubId) {
      return null;
    }

    return (
      <button
        type="button"
        onClick={() => onSelectClub(clubId)}
        className={className}
        title={clubName}
      >
        {clubName}
      </button>
    );
  };

  const mobileClubWidthReference = competitors.reduce((longest, competitor) => {
    const name = getMobileCompetitorName(competitor);
    return name.length > longest.length ? name : longest;
  }, '');

  const showTimes = shouldDisplayResultTimes(resultListMode);
  const showTimeLoss = shouldDisplayResultTimeLoss(resultListMode);

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
      <Alert severity="error" variant="outlined" title="Error loading results">
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
      <div className={mobileResultsTableClassName}>
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
              <TableHead className="h-8 px-2 text-right text-xs">
                <span className="sm:hidden">Time</span>
                <span className="hidden sm:inline">Finish</span>
              </TableHead>
              <TableHead className="h-8 px-2 text-xs text-right">
                Diff
              </TableHead>
              {showRanking && (
                <TableHead className="h-8 w-px whitespace-nowrap px-1 text-right text-xs sm:px-2 lg:table-cell">
                  Points
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {competitors.map((competitor, index) => {
              const timeState = getCategoryTimeState(competitor);
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
                    {formatResultListRank(competitor.position, resultListMode)}
                  </TableCell>
                  <TableCell className="px-2 py-1 text-sm font-medium">
                    <div className="flex flex-col">
                      <CompetitorName competitor={competitor} />
                      <MobileClubName
                        clubName={competitor.organisation}
                        referenceText={mobileClubWidthReference}
                        onSelectClub={() =>
                          onSelectClub(competitor.organisationId ?? null)
                        }
                        className="mt-0.5 block truncate rounded-sm text-left text-xs text-muted-foreground hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:hidden"
                      />
                    </div>
                  </TableCell>
                  <TableCell className="px-2 py-1 text-xs text-muted-foreground hidden lg:table-cell">
                    {renderClubButton(
                      competitor.organisation,
                      competitor.organisationId,
                      'hover:underline cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm'
                    )}
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
                    className={`px-2 py-1 text-right font-mono text-sm ${timeState.className}`}
                  >
                    {!showTimes ? null : timeState.hideOnDesktop ? (
                      <>
                        <span className="md:hidden">{timeState.value}</span>
                        <span className="hidden md:inline">&nbsp;</span>
                      </>
                    ) : (
                      timeState.value
                    )}
                  </TableCell>
                  <TableCell className="px-2 py-1 text-sm text-right font-mono font-bold">
                    {!showTimeLoss
                      ? null
                      : competitor.loss && competitor.loss > 0
                        ? `+${formatSecondsToTime(competitor.loss)}`
                        : '-'}
                  </TableCell>
                  {showRanking && (
                    <TableCell className="w-px whitespace-nowrap px-1 py-1 text-right text-xs sm:px-2 lg:table-cell">
                      {competitor.rankingPoints !== undefined &&
                        competitor.rankingPoints !== null && (
                          <Tooltip
                            content={getRankingTooltipContent(competitor)}
                            side="top"
                            align="center"
                          >
                            <span className="inline-flex">
                              <Badge
                                variant="outline"
                                className={`cursor-help px-1 py-0 text-xs font-normal leading-tight ${
                                  competitor.countsTowardsRanking
                                    ? 'border-green-200 bg-green-100 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300'
                                    : 'border-red-200 bg-red-100 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300'
                                }`}
                                title={
                                  competitor.countsTowardsRanking
                                    ? t('Pages.Event.Results.Ranking.Counts')
                                    : t(
                                        'Pages.Event.Results.Ranking.DoesNotCount'
                                      )
                                }
                              >
                                {competitor.rankingPoints}
                              </Badge>
                            </span>
                          </Tooltip>
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
  /** From `event.relay`, which the server derives from the event discipline. */
  isRelay: boolean;
  selectedClubId: number | null;
  setSelectedClubId: (clubId: number | null) => void;
  organisationsData: OrganisationsResponse | undefined;
  organisationsLoading: boolean;
  onSelectClass: (className: string) => void;
}

const ClubResultsView = ({
  t,
  eventId,
  isRelay,
  selectedClubId,
  setSelectedClubId,
  organisationsData,
  organisationsLoading,
  onSelectClass,
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
      organisationId: selectedClubId ?? 0,
      isRelay,
    },
    pollInterval: 15000,
    skip: !selectedClubId,
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
    const firstOrg = organisationsData?.organisationNames?.[0];
    if (firstOrg && !selectedClubId) {
      setSelectedClubId(firstOrg.id);
    }
  }, [organisationsData, selectedClubId, setSelectedClubId]);

  type CompetitorClassInfo = {
    id?: string | number | null;
    name?: string | null;
    resultListMode?: string | null;
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
    organisationId?: number | null;
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

  const getCompetitorResultListMode = (
    competitor?: CompetitorWithClass | null
  ) => competitor?.class?.resultListMode ?? null;

  /**
   * Multi-leg disciplines: the club's teams rendered with the same
   * `RelayOverallView` the category tab uses, so a team keeps its class-wide
   * standing, name and per-leg breakdown here. The class-wide input comes from
   * the `class.competitors` selection of this query (relay-only, see
   * `$isRelay`), which is what the ranking needs — a club-scoped list alone
   * cannot place a team against the rest of its class.
   */
  const buildClubRelaySections = (clubId: number): ClubRelaySection[] => {
    const clubCompetitors = (
      competitorsData?.competitorsByOrganisation ?? []
    ).filter(comp => comp.organisationId === clubId) as Array<
      Competitor & { class?: CompetitorClassInfo | null }
    >;

    const byClass = new Map<
      string,
      {
        className: string;
        teamIds: Set<number>;
        classCompetitors: Competitor[];
      }
    >();

    for (const comp of clubCompetitors) {
      if (comp.teamId == null || !comp.class?.name) continue;
      const key = String(comp.class.id ?? comp.class.name);
      let entry = byClass.get(key);
      if (!entry) {
        entry = {
          className: comp.class.name,
          teamIds: new Set(),
          // Same rows the category tab feeds to computeRelayOverall, just reached
          // through the class relation instead of the class subscription.
          classCompetitors: (comp.class.competitors ??
            []) as unknown as Competitor[],
        };
        byClass.set(key, entry);
      }
      entry.teamIds.add(comp.teamId);
    }

    return [...byClass.values()]
      .map(({ className, teamIds, classCompetitors }) => {
        const maxLeg = classCompetitors.reduce(
          (max, comp) => Math.max(max, comp.leg ?? 0),
          0
        );
        return {
          className,
          teams: computeRelayOverall(classCompetitors, maxLeg).filter(team =>
            teamIds.has(team.teamId)
          ),
        };
      })
      .filter(section => section.teams.length > 0)
      .sort((a, b) => a.className.localeCompare(b.className));
  };

  // Function to calculate position and loss in category
  const calculatePositionAndLoss = (competitor: CompetitorWithClass) => {
    // Relays are not ranked per competitor here — the relay overall table above
    // carries the team standing instead.
    if (isRelay) {
      return { position: '', loss: undefined };
    }

    const classCompetitors = competitor.class?.competitors || [];

    // For non-OK status competitors, return appropriate position emoji
    if (competitor.status !== 'OK') {
      return {
        position: getResultStatusDisplay(competitor.status).emoji,
        loss: undefined,
      };
    }

    // Only competitors with valid time and OK status count for position calculation
    const validCompetitors = classCompetitors.filter(
      (
        comp
      ): comp is {
        id?: string | number;
        status?: string | null;
        time: number;
      } => comp.status === 'OK' && comp.time !== null && comp.time !== undefined
    );

    if (validCompetitors.length === 0 || competitor.id == null) {
      return { position: '❓', loss: undefined };
    }

    const { rankById, bestTime } = rankByTime(
      validCompetitors.map(comp => ({ id: String(comp.id), time: comp.time }))
    );

    const position = rankById.get(String(competitor.id)) ?? '❓';
    const loss = computeLoss(competitor.time ?? undefined, bestTime);

    return { position, loss };
  };

  // Process and group competitors by club and class
  const processClubResults = (): ProcessedClubResult[] => {
    if (
      !organisationsData?.organisationNames ||
      organisationsData.organisationNames.length === 0
    )
      return [];

    return organisationsData.organisationNames
      .map(org => {
        // Get all competitors for this organization
        const orgCompetitors =
          competitorsData?.competitorsByOrganisation?.filter(
            comp => comp.organisationId === org.id
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

            // Unordered modes: keep the status-priority grouping, but sort
            // alphabetically within each status group instead of by time.
            if (
              isUnorderedResultListMode(
                getCompetitorResultListMode(a.competitor as CompetitorWithClass)
              )
            ) {
              return compareByStatusPriorityThenName(
                a.competitor as Competitor,
                b.competitor as Competitor
              );
            }

            // Sort by status priority first
            const statusA = getResultStatusPriority(a.competitor.status);
            const statusB = getResultStatusPriority(b.competitor.status);

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
          clubId: org.id,
          club: org.name,
          countryCode: org.countryCode || '',
          country: org.country || '',
          runners: processedCompetitors.map(item => {
            const comp = item.competitor;
            return {
              id: String(comp.id),
              firstname: comp.firstname,
              lastname: comp.lastname,
              class:
                getCompetitorClassName(comp as CompetitorWithClass) || 'N/A',
              time: comp.time ? formatSecondsToTime(comp.time) : '-',
              status: comp.status,
              position: item.calculatedPosition,
              leg: comp.leg ?? undefined,
              startTime: comp.startTime || undefined,
              loss: item.calculatedLoss || undefined,
              classId: (() => {
                const classId = getCompetitorClassId(
                  comp as CompetitorWithClass
                );
                return classId != null ? String(classId) : undefined;
              })(),
              resultListMode: getCompetitorResultListMode(
                comp as CompetitorWithClass
              ),
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

  const clubResults = processClubResults();

  if (organisationsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span>{t('Pages.Event.Results.LoadingClubs')}</span>
      </div>
    );
  }

  if (!organisationsData?.organisationNames) {
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
      {clubResults.map(clubResult => {
        // Relays fall back to the flat runner table while no team standing can be
        // built yet (no team data in the feed at all).
        const relaySections = isRelay
          ? buildClubRelaySections(clubResult.clubId)
          : [];

        return (
          <div key={clubResult.club} className="space-y-3">
            <div className="flex items-center gap-3 px-2">
              {clubResult.countryCode && (
                <CountryFlag
                  countryCode={clubResult.countryCode}
                  className="w-8 h-6 shrink-0"
                />
              )}
              <h3 className="text-lg font-bold truncate">{clubResult.club}</h3>
              {clubResult.countryCode && clubResult.country && (
                <Badge
                  variant="outline"
                  className="hidden sm:inline-flex text-xs shrink-0"
                >
                  {clubResult.country}
                </Badge>
              )}
              <Badge
                variant="secondary"
                className="hidden sm:inline-flex text-xs shrink-0"
              >
                {clubResult.runners.length} runners
              </Badge>
            </div>

            {relaySections.map(section => (
              <div key={section.className} className="space-y-1">
                <button
                  type="button"
                  onClick={() => onSelectClass(section.className)}
                  className="inline-flex cursor-pointer rounded-sm px-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  title={section.className}
                >
                  <Badge
                    variant="secondary"
                    className="text-xs hover:bg-secondary/80"
                  >
                    {section.className}
                  </Badge>
                </button>
                <RelayOverallView teams={section.teams} t={t} />
              </div>
            ))}

            {relaySections.length === 0 && (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className={mobileResultsTableClassName}>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        {!isRelay && (
                          <TableHead className="h-8 px-2 text-xs w-12">
                            #
                          </TableHead>
                        )}
                        <TableHead className="h-8 px-2 text-xs">Name</TableHead>
                        <TableHead className="h-8 px-2 text-xs w-20">
                          Class
                        </TableHead>
                        <TableHead className="h-8 px-2 text-xs w-20 hidden md:table-cell">
                          Start
                        </TableHead>
                        <TableHead className="h-8 px-2 text-xs text-right w-24">
                          Time
                        </TableHead>
                        {!isRelay && (
                          <TableHead className="h-8 px-2 text-xs text-right w-20">
                            Diff
                          </TableHead>
                        )}
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
                                <TableCell
                                  colSpan={isRelay ? 5 : 7}
                                  className="p-0"
                                >
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
                                {!isRelay && (
                                  <TableCell className="px-2 py-1 text-sm font-bold">
                                    {formatResultListRank(
                                      runner.position,
                                      runner.resultListMode
                                    )}
                                  </TableCell>
                                )}
                                <TableCell className="px-2 py-1 text-sm font-medium">
                                  <CompetitorName
                                    competitor={{
                                      firstname: runner.firstname,
                                      lastname: runner.lastname,
                                    }}
                                  />
                                </TableCell>
                                <TableCell className="px-2 py-1">
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onSelectClass(runner.class)
                                      }
                                      className="inline-flex cursor-pointer rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                      title={runner.class}
                                    >
                                      <Badge
                                        variant="secondary"
                                        className="text-xs hover:bg-secondary/80"
                                      >
                                        {runner.class}
                                      </Badge>
                                    </button>
                                    {runner.leg != null && (
                                      <span className="whitespace-nowrap text-xs text-muted-foreground">
                                        {t('Pages.Event.Live.Leg', {
                                          leg: runner.leg,
                                        })}
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="px-2 py-1 text-xs font-mono hidden md:table-cell">
                                  {formatStartTime(runner.startTime)}
                                </TableCell>
                                <TableCell className="px-2 py-1 text-sm text-right font-mono font-bold">
                                  {shouldDisplayResultTimes(
                                    runner.resultListMode
                                  )
                                    ? runner.time
                                    : null}
                                </TableCell>
                                {!isRelay && (
                                  <TableCell className="px-2 py-1 text-sm text-right font-mono">
                                    {!shouldDisplayResultTimeLoss(
                                      runner.resultListMode
                                    )
                                      ? null
                                      : runner.loss && runner.loss > 0
                                        ? `+${formatSecondsToTime(runner.loss)}`
                                        : runner.loss === 0
                                          ? '-'
                                          : ''}
                                  </TableCell>
                                )}
                                <TableCell className="px-2 py-1">
                                  <span
                                    className={`text-xs font-medium ${getStatusColor(runner.status)}`}
                                  >
                                    {getResultStatusLabel(runner.status)}
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
            )}
          </div>
        );
      })}

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

// ─── Relay overview ──────────────────────────────────────────────────────────

interface TeamLegResult {
  legNumber: number;
  runner: Competitor;
  legTime?: number;
  legRank?: number;
  legLoss?: number;
  cumulativeTime?: number;
  cumulativeRank?: number;
  cumulativeLoss?: number;
  positionChange?: number;
}

interface TeamResult {
  teamId: number;
  teamName: string;
  club: string;
  finalRank?: number;
  totalTime?: number;
  timeDiff?: number;
  legs: TeamLegResult[];
}

const computeRelayOverall = (
  allCompetitors: Competitor[],
  maxLeg: number
): TeamResult[] => {
  if (maxLeg === 0 || allCompetitors.length === 0) return [];

  const teamMap = new Map<number, Competitor[]>();
  for (const c of allCompetitors) {
    if (c.teamId == null) continue;
    if (!teamMap.has(c.teamId)) teamMap.set(c.teamId, []);
    teamMap.get(c.teamId)!.push(c);
  }
  if (teamMap.size === 0) return [];

  const legRankings = new Map<number, TimeRanking>();
  for (let leg = 1; leg <= maxLeg; leg++) {
    const legRunners: TimedEntry[] = allCompetitors
      .filter(
        c => c.leg === leg && c.status === 'OK' && hasValidRaceTime(c.time)
      )
      .map(c => ({ id: c.id, time: c.time as number }));
    legRankings.set(leg, rankByTime(legRunners));
  }

  const {
    cumulativeTimeByTeam: teamCumulByLeg,
    rankingByLeg: cumulRankings,
    brokenTeamIds,
  } = computeRelayCumulativeStandings(allCompetitors, maxLeg);

  const results: TeamResult[] = [];
  for (const [teamId, runners] of teamMap) {
    const byLeg = new Map<number, Competitor>();
    for (const r of runners) {
      if (r.leg != null) byLeg.set(r.leg, r);
    }
    const cumul = teamCumulByLeg.get(teamId) ?? new Map<number, number>();
    const totalTime = cumul.get(maxLeg);
    const finalCumulRanking = cumulRankings.get(maxLeg);
    const finalRank = finalCumulRanking?.rankById.get(String(teamId));
    const timeDiff = computeLoss(totalTime, finalCumulRanking?.bestTime);

    const sortedRunners = [...byLeg.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, r]) => r);
    const firstRunner = sortedRunners[0] ?? runners[0]!;
    const teamName = firstRunner.team?.name ?? String(teamId);
    const club = firstRunner.organisation ?? '';

    const isTeamBroken = brokenTeamIds.has(teamId);

    const legs: TeamLegResult[] = [];
    for (let leg = 1; leg <= maxLeg; leg++) {
      const runner = byLeg.get(leg);
      if (!runner) continue;
      const legTime =
        runner.status === 'OK' ? (runner.time ?? undefined) : undefined;
      const legRanking = legRankings.get(leg);
      const legRank = legRanking?.rankById.get(runner.id);
      const legLoss = computeLoss(legTime, legRanking?.bestTime, {
        rank: legRank,
        secondBestTime: legRanking?.secondBestTime,
      });

      const cumulTime = cumul.get(leg);
      const cumulRanking = cumulRankings.get(leg);
      const cumulRank = cumulRanking?.rankById.get(String(teamId));
      const prevCumulRank =
        leg > 1
          ? cumulRankings.get(leg - 1)?.rankById.get(String(teamId))
          : undefined;
      const positionChange =
        cumulRank != null && prevCumulRank != null
          ? cumulRank - prevCumulRank
          : undefined;
      const cumulativeLoss = computeLoss(cumulTime, cumulRanking?.bestTime, {
        rank: cumulRank,
        secondBestTime: cumulRanking?.secondBestTime,
      });

      const legResult: TeamLegResult = { legNumber: leg, runner };
      if (legTime !== undefined) legResult.legTime = legTime;
      if (cumulTime !== undefined) legResult.cumulativeTime = cumulTime;
      // A leg's own placement is independent of the team's eventual fate — a
      // runner from a team disqualified on another leg can still have run
      // the fastest leg, so legRank/legLoss are never suppressed. Only the
      // team-level standing built by chaining legs together (cumulative rank/
      // loss/position-change) is void once the team is broken.
      if (legRank !== undefined) legResult.legRank = legRank;
      if (legLoss !== undefined) legResult.legLoss = legLoss;
      if (!isTeamBroken) {
        if (cumulRank !== undefined) legResult.cumulativeRank = cumulRank;
        if (positionChange !== undefined)
          legResult.positionChange = positionChange;
        if (cumulativeLoss !== undefined)
          legResult.cumulativeLoss = cumulativeLoss;
      }
      legs.push(legResult);
    }

    const teamResult: TeamResult = { teamId, teamName, club, legs };
    if (finalRank !== undefined) teamResult.finalRank = finalRank;
    if (totalTime !== undefined) teamResult.totalTime = totalTime;
    if (timeDiff !== undefined) teamResult.timeDiff = timeDiff;
    results.push(teamResult);
  }

  results.sort((a, b) => {
    if (a.finalRank != null && b.finalRank != null)
      return a.finalRank - b.finalRank;
    if (a.finalRank != null) return -1;
    if (b.finalRank != null) return 1;
    return (
      b.legs.filter(l => l.cumulativeTime != null).length -
      a.legs.filter(l => l.cumulativeTime != null).length
    );
  });

  return results;
};

const bestLegTimeClassName =
  'rounded bg-green-50 px-1 text-green-700 dark:bg-green-950/30 dark:text-green-300';

const PositionChange: React.FC<{ change: number }> = ({ change }) => {
  if (change === 0) {
    return (
      <span className="text-muted-foreground text-[10px] font-bold leading-none">
        —
      </span>
    );
  }
  if (change < 0) {
    return (
      <span className="text-green-500 text-[10px] font-bold leading-none">
        ▲{Math.abs(change)}
      </span>
    );
  }
  return (
    <span className="text-red-500 text-[10px] font-bold leading-none">
      ▼{change}
    </span>
  );
};

const RelayOverallView: React.FC<{ teams: TeamResult[]; t: TFunction }> = ({
  teams,
  t,
}) => {
  if (teams.length === 0) return null;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className={mobileResultsTableClassName}>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="h-8 px-2 text-xs">#</TableHead>
              <TableHead className="h-8 px-2 text-xs">
                {t('Pages.Event.Results.Relay.Name')}
              </TableHead>
              <TableHead className="h-8 px-2 text-xs hidden lg:table-cell">
                {t('Pages.Event.Results.Relay.Club')}
              </TableHead>
              <TableHead className="h-8 px-2 text-right text-xs">
                {t('Pages.Event.Results.Relay.LegHeader')}
              </TableHead>
              <TableHead className="h-8 px-2 text-right text-xs hidden sm:table-cell">
                {t('Pages.Event.Results.Relay.LegLoss')}
              </TableHead>
              <TableHead className="h-8 px-2 text-right text-xs">
                {t('Pages.Event.Results.Relay.Time')}
              </TableHead>
              <TableHead className="h-8 px-2 text-right text-xs">
                {t('Pages.Event.Results.Relay.Diff')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teams.map((team, teamIndex) => (
              <React.Fragment key={team.teamId}>
                <TableRow
                  className={`border-t-2 border-border ${
                    teamIndex % 2 === 0 ? 'bg-muted/30' : 'bg-muted/15'
                  }`}
                >
                  <TableCell className="px-2 py-1.5 text-sm font-bold">
                    {team.finalRank != null ? `${team.finalRank}.` : '–'}
                  </TableCell>
                  <TableCell className="px-2 py-1.5 text-sm font-bold">
                    {team.teamName}
                  </TableCell>
                  <TableCell className="px-2 py-1.5 text-xs text-muted-foreground hidden lg:table-cell">
                    {team.club}
                  </TableCell>
                  <TableCell />
                  <TableCell className="hidden sm:table-cell" />
                  <TableCell className="px-2 py-1.5 text-right font-mono text-sm font-bold">
                    {team.totalTime != null
                      ? formatSecondsToTime(team.totalTime)
                      : '–'}
                  </TableCell>
                  <TableCell className="px-2 py-1.5 text-right font-mono text-sm text-muted-foreground">
                    {team.timeDiff != null && team.timeDiff > 0
                      ? `+${formatSecondsToTime(team.timeDiff)}`
                      : ''}
                  </TableCell>
                </TableRow>
                {team.legs.map(leg => (
                  <TableRow
                    key={leg.legNumber}
                    className={
                      teamIndex % 2 === 0 ? 'bg-background' : 'bg-muted/5'
                    }
                  >
                    <TableCell />
                    <TableCell className="px-2 py-0.5 text-xs">
                      <CompetitorName competitor={leg.runner} />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell" />
                    <TableCell className="px-2 py-0.5 text-right font-mono text-xs">
                      {leg.legTime != null ? (
                        <>
                          <span
                            className={
                              leg.legRank === 1 ? bestLegTimeClassName : ''
                            }
                          >
                            {formatSecondsToTime(leg.legTime)}
                          </span>
                          {leg.legRank != null && (
                            <span className="text-muted-foreground ml-1">
                              ({leg.legRank}.)
                            </span>
                          )}
                        </>
                      ) : (
                        <span
                          className="text-muted-foreground cursor-help"
                          title={
                            getResultStatusDisplay(leg.runner.status).tooltip
                          }
                        >
                          {getResultStatusDisplay(leg.runner.status).emoji}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="px-2 py-0.5 text-right font-mono text-xs text-muted-foreground hidden sm:table-cell">
                      {formatSignedLoss(leg.legLoss)}
                    </TableCell>
                    <TableCell className="px-2 py-0.5 text-right font-mono text-xs">
                      {leg.cumulativeTime != null ? (
                        <span className="inline-flex items-center justify-end gap-1">
                          {leg.positionChange != null &&
                            leg.positionChange !== 0 && (
                              <PositionChange change={leg.positionChange} />
                            )}
                          {formatSecondsToTime(leg.cumulativeTime)}
                          {leg.cumulativeRank != null && (
                            <span className="text-muted-foreground">
                              ({leg.cumulativeRank}.)
                            </span>
                          )}
                        </span>
                      ) : (
                        '–'
                      )}
                    </TableCell>
                    <TableCell className="px-2 py-0.5 text-right font-mono text-xs text-muted-foreground">
                      {formatSignedLoss(leg.cumulativeLoss)}
                    </TableCell>
                  </TableRow>
                ))}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

// Relay Results Component
interface RelayLegCompetitor extends Competitor {
  cumulativeTime?: number;
  position?: number | string;
  positionTooltip?: string;
  loss?: number;
  isBestLegTime?: boolean;
}

const processRelayLegCompetitors = (
  legCompetitors: Competitor[],
  selectedLeg: number,
  teamTimeMap: Map<number, Map<number, number>>
): RelayLegCompetitor[] => {
  const getCumulativeTime = (c: Competitor): number | undefined => {
    if (selectedLeg === 1) return hasValidRaceTime(c.time) ? c.time : undefined;
    if (c.teamId == null || c.leg == null)
      return hasValidRaceTime(c.time) ? c.time : undefined;
    const legMap = teamTimeMap.get(c.teamId);
    if (!legMap) return undefined;
    let total = 0;
    for (let l = 1; l <= c.leg; l++) {
      const t = legMap.get(l);
      if (t == null) return undefined;
      total += t;
    }
    return total;
  };

  type WithCumulative = Competitor & { cumulativeTime?: number };

  const withCumulative: WithCumulative[] = legCompetitors.map(c => {
    const entry: WithCumulative = { ...c };
    const ct = getCumulativeTime(c);
    if (ct !== undefined) entry.cumulativeTime = ct;
    return entry;
  });

  withCumulative.sort((a, b) => {
    if (a.status === 'OK' && b.status === 'OK') {
      return (a.cumulativeTime ?? Infinity) - (b.cumulativeTime ?? Infinity);
    }
    if (a.status === 'OK') return -1;
    if (b.status === 'OK') return 1;
    const pa = getResultStatusPriority(a.status);
    const pb = getResultStatusPriority(b.status);
    if (pa !== pb) return pa - pb;
    const sa = a.startTime ? new Date(a.startTime).getTime() : Infinity;
    const sb = b.startTime ? new Date(b.startTime).getTime() : Infinity;
    return sa - sb;
  });

  // Only runners with a genuine cumulative time can be ranked or crowned the
  // leg's leader — a zero/missing time earlier in the chain (this team's own
  // broken leg) leaves cumulativeTime undefined, same treatment as DSQ/DNF.
  const rankableCompetitors = withCumulative.filter(
    c => c.status === 'OK' && c.cumulativeTime != null
  );
  const {
    rankById,
    bestTime: leaderTime,
    secondBestTime: secondTime,
  } = rankByTime(
    rankableCompetitors.map(c => ({
      id: c.id,
      time: c.cumulativeTime as number,
    }))
  );

  const validLegTimes: TimedEntry[] = withCumulative
    .filter(c => c.status === 'OK' && hasValidRaceTime(c.time))
    .map(c => ({ id: c.id, time: c.time as number }));
  const bestLegTime = rankByTime(validLegTimes).bestTime;

  return withCumulative.map(c => {
    const pos = rankById.get(c.id);
    const isBestLegTime =
      c.status === 'OK' && bestLegTime != null && c.time === bestLegTime;
    if (pos !== undefined) {
      const loss = computeLoss(c.cumulativeTime, leaderTime, {
        rank: pos,
        secondBestTime: secondTime,
      });
      const result: RelayLegCompetitor = { ...c, position: pos, isBestLegTime };
      if (loss !== undefined) result.loss = loss;
      return result;
    }
    // Status OK but not rankable (this team's chain is already broken by an
    // earlier disqualified/missing leg) — keep raw times, drop the standing.
    if (c.status === 'OK') {
      return { ...c, isBestLegTime } as RelayLegCompetitor;
    }
    const display = getResultStatusDisplay(c.status);
    return {
      ...c,
      position: display.emoji,
      positionTooltip: display.tooltip,
    } as RelayLegCompetitor;
  });
};

const hasRelayResultSignal = (competitor: Competitor): boolean =>
  competitor.time != null ||
  competitor.finishTime != null ||
  competitor.status === 'Active';

interface RelayResultsViewProps {
  t: TFunction;
  event: Event;
  selectedClass: string;
  setSelectedClass: (cls: string) => void;
}

const RelayResultsView = ({
  t,
  event,
  selectedClass,
  setSelectedClass,
}: RelayResultsViewProps) => {
  const [selectedTab, setSelectedTab] = useState<'overall' | number>('overall');
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const [autoFollowEnabled, setAutoFollowEnabled] = useState(false);
  const previousClassIdRef = useRef<number | undefined>(undefined);
  const navigate = useNavigate();

  const currentClass = event.classes?.find(cls => cls.name === selectedClass);
  const selectedClassId = currentClass?.id;

  const { loading, error, data } =
    useSubscription<CompetitorsByClassUpdatedResponse>(
      COMPETITORS_BY_CLASS_UPDATED,
      { variables: { classId: selectedClassId }, skip: !selectedClassId }
    );

  useEffect(() => {
    if (previousClassIdRef.current === selectedClassId) return;
    previousClassIdRef.current = selectedClassId;
    setSelectedTab('overall');
  }, [selectedClassId]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const allCompetitors = data?.competitorsByClassUpdated ?? [];

  const maxLeg = useMemo(
    () => allCompetitors.reduce((max, c) => Math.max(max, c.leg ?? 0), 0),
    [allCompetitors]
  );

  const legs = useMemo(
    () => (maxLeg > 0 ? Array.from({ length: maxLeg }, (_, i) => i + 1) : []),
    [maxLeg]
  );

  const teamResults = useMemo(
    () => computeRelayOverall(allCompetitors, maxLeg),
    [allCompetitors, maxLeg]
  );

  const teamTimeMap = useMemo(() => {
    const map = new Map<number, Map<number, number>>();
    for (const c of allCompetitors) {
      if (
        c.teamId != null &&
        c.leg != null &&
        c.status === 'OK' &&
        hasValidRaceTime(c.time)
      ) {
        if (!map.has(c.teamId)) map.set(c.teamId, new Map());
        map.get(c.teamId)!.set(c.leg, c.time);
      }
    }
    return map;
  }, [allCompetitors]);

  const selectedLeg = typeof selectedTab === 'number' ? selectedTab : null;

  const processedLegCompetitors = useMemo(() => {
    if (selectedLeg == null) return [];
    const legComps = allCompetitors.filter(c => c.leg === selectedLeg);
    return processRelayLegCompetitors(legComps, selectedLeg, teamTimeMap);
  }, [allCompetitors, selectedLeg, teamTimeMap]);

  const mobileClubWidthReference = useMemo(
    () =>
      processedLegCompetitors.reduce((longest, competitor) => {
        const name = getMobileCompetitorName(competitor);
        return name.length > longest.length ? name : longest;
      }, ''),
    [processedLegCompetitors]
  );

  const legPositionChangeMap = useMemo(() => {
    if (selectedLeg == null || selectedLeg <= 1)
      return new Map<string, number>();
    const map = new Map<string, number>();
    for (const team of teamResults) {
      const legResult = team.legs.find(l => l.legNumber === selectedLeg);
      if (legResult?.positionChange != null) {
        map.set(legResult.runner.id, legResult.positionChange);
      }
    }
    return map;
  }, [teamResults, selectedLeg]);

  const hasContent =
    selectedTab === 'overall'
      ? teamResults.length > 0
      : processedLegCompetitors.length > 0;

  const autoFollowTargetLeg = useMemo(() => {
    if (maxLeg === 0) return null;
    const highestLegWithResults = allCompetitors.reduce(
      (highest, competitor) => {
        const leg = competitor.leg ?? 0;
        return hasRelayResultSignal(competitor) && leg > highest
          ? leg
          : highest;
      },
      0
    );
    return highestLegWithResults > 0
      ? Math.min(maxLeg, highestLegWithResults)
      : null;
  }, [allCompetitors, maxLeg]);

  useEffect(() => {
    if (!autoFollowEnabled || autoFollowTargetLeg == null) return;
    if (selectedTab !== autoFollowTargetLeg) {
      setSelectedTab(autoFollowTargetLeg);
    }
  }, [autoFollowEnabled, autoFollowTargetLeg, selectedTab]);

  const showFirstLegStartTimes = selectedLeg === 1;

  const getRelayLegTimeState = (
    competitor: RelayLegCompetitor
  ): { value: string; className: string; hideOnDesktop?: boolean } => {
    if (competitor.status === 'Active') {
      return getActiveTimeState(competitor.startTime, currentTime);
    }

    if (
      showFirstLegStartTimes &&
      competitor.status === 'Inactive' &&
      competitor.startTime
    ) {
      return {
        value: formatTimeToHms(competitor.startTime),
        className: 'text-muted-foreground',
        hideOnDesktop: true,
      };
    }

    if (competitor.time !== undefined && competitor.time !== null) {
      return { value: formatSecondsToTime(competitor.time), className: '' };
    }

    return { value: '-', className: 'text-muted-foreground' };
  };

  const handleClassChange = (classId: number) => {
    const cls = event.classes?.find(c => c.id === classId);
    if (!cls) return;
    const newSearchParams = new URLSearchParams(window.location.search);
    newSearchParams.set('class', cls.name);
    navigate({
      to: window.location.pathname,
      search: Object.fromEntries(newSearchParams),
      replace: true,
    });
    setSelectedClass(cls.name);
  };

  const handleManualTabChange = (tab: 'overall' | number) => {
    setAutoFollowEnabled(false);
    setSelectedTab(tab);
  };

  const handleAutoFollowToggle = () => {
    const nextEnabled = !autoFollowEnabled;
    setAutoFollowEnabled(nextEnabled);
    if (nextEnabled && autoFollowTargetLeg != null) {
      setSelectedTab(autoFollowTargetLeg);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Nested below the Cat/Club/Live switcher, which owns `top-0`.
          ponytail: fixed offset matched to that switcher's height; if the two ever
          overlap, hoist both control rows into one sticky wrapper. */}
      <div className="sticky top-[38px] z-[9] bg-background border-b border-border pb-2 mb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 p-0.5 bg-muted rounded-md">
            {(() => {
              const courseLength =
                currentClass?.course?.length ?? currentClass?.length ?? 0;
              return (
                <Button
                  variant={selectedTab === 'overall' ? 'default' : 'ghost'}
                  size="sm"
                  className={
                    courseLength > 0 ? 'h-auto py-0.5 px-2' : 'h-7 px-2'
                  }
                  onClick={() => handleManualTabChange('overall')}
                >
                  <span className="flex flex-col items-center leading-none gap-0.5">
                    <span className="text-xs font-medium">
                      {t('Pages.Event.Results.Relay.Overall')}
                    </span>
                    {courseLength > 0 && (
                      <span className="text-[9px] opacity-70 font-normal">
                        {(courseLength / 1000).toFixed(1)} km
                      </span>
                    )}
                  </span>
                </Button>
              );
            })()}
            {legs.map(leg => {
              const course = currentClass?.course;
              const courseLength = course?.length ?? null;
              const courseClimb = course?.climb ?? null;
              return (
                <Button
                  key={leg}
                  variant={selectedTab === leg ? 'default' : 'ghost'}
                  size="sm"
                  className={courseLength ? 'h-auto py-0.5 px-2' : 'h-7 px-2'}
                  onClick={() => handleManualTabChange(leg)}
                >
                  <span className="flex flex-col items-center leading-none gap-0.5">
                    <span className="text-xs font-medium">
                      {t('Pages.Event.Results.Relay.Leg', { number: leg })}
                    </span>
                    {courseLength != null && (
                      <span className="text-[9px] opacity-70 font-normal">
                        {(courseLength / 1000).toFixed(1)} km
                        {courseClimb ? ` · ${courseClimb} m` : ''}
                      </span>
                    )}
                  </span>
                </Button>
              );
            })}
            <Button
              variant={autoFollowEnabled ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-2 gap-1"
              disabled={maxLeg === 0}
              onClick={handleAutoFollowToggle}
            >
              <Radio className="w-3 h-3" />
              <span className="text-xs font-medium">
                {t('Pages.Event.Results.Relay.AutoFollow')}
              </span>
            </Button>
          </div>
          {event.classes && currentClass && (
            <EventCategorySwitcher
              classes={event.classes}
              selectedClass={selectedClassId ?? 0}
              onClassChange={handleClassChange}
              currentClass={currentClass}
            />
          )}
        </div>
      </div>

      {loading && !hasContent && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          <span>{t('Pages.Event.Results.Loading')}</span>
        </div>
      )}

      {error && (
        <Alert
          severity="error"
          variant="outlined"
          title={t('Pages.Event.Results.Relay.ErrorLoading')}
        >
          {error.message}
        </Alert>
      )}

      {!loading && !error && !hasContent && (
        <Alert
          severity="info"
          variant="outlined"
          title={t('Pages.Event.Alert.EventDataNotAvailableTitle')}
        >
          {t('Pages.Event.Alert.EventDataNotAvailableMessage', {
            view: t('Pages.Event.Alert.ViewResults'),
          })}
        </Alert>
      )}

      {selectedTab === 'overall' && (
        <RelayOverallView teams={teamResults} t={t} />
      )}

      {typeof selectedTab === 'number' &&
        processedLegCompetitors.length > 0 && (
          <div className="border border-border rounded-lg overflow-hidden">
            <div className={mobileResultsTableClassName}>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="h-8 px-2 text-xs">#</TableHead>
                    <TableHead className="h-8 px-2 text-xs">
                      {t('Pages.Event.Results.Relay.Name')}
                    </TableHead>
                    <TableHead className="h-8 px-2 text-xs hidden lg:table-cell">
                      {t('Pages.Event.Results.Relay.Club')}
                    </TableHead>
                    {showFirstLegStartTimes && (
                      <TableHead className="h-8 px-2 text-xs text-right hidden md:table-cell">
                        {t('Pages.Event.Results.Relay.Start')}
                      </TableHead>
                    )}
                    <TableHead className="h-8 px-2 text-right text-xs">
                      {t('Pages.Event.Results.Relay.Time')}
                    </TableHead>
                    {selectedLeg != null && selectedLeg > 1 && (
                      <TableHead className="h-8 px-2 text-right text-xs hidden sm:table-cell">
                        {t('Pages.Event.Results.Relay.Cumul')}
                      </TableHead>
                    )}
                    <TableHead className="h-8 px-2 text-right text-xs">
                      {t('Pages.Event.Results.Relay.Diff')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {processedLegCompetitors.map((competitor, index) => {
                    const timeState = getRelayLegTimeState(competitor);
                    return (
                      <motion.tr
                        key={competitor.id}
                        layout
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          type: 'spring',
                          stiffness: 100,
                          damping: 15,
                        }}
                        className={`h-9 ${
                          index % 2 === 0
                            ? 'bg-background hover:bg-muted/30'
                            : 'bg-muted/20 hover:bg-muted/40'
                        }`}
                      >
                        <TableCell
                          className="px-2 py-1 text-sm font-bold"
                          title={competitor.positionTooltip || ''}
                        >
                          <span className="inline-flex items-center gap-1">
                            <span>
                              {competitor.position}
                              {typeof competitor.position === 'number' && '.'}
                            </span>
                            {(() => {
                              const change = legPositionChangeMap.get(
                                competitor.id
                              );
                              if (change == null || change === 0) return null;
                              return <PositionChange change={change} />;
                            })()}
                          </span>
                        </TableCell>
                        <TableCell className="px-2 py-1 text-sm font-medium">
                          <div className="flex flex-col">
                            <CompetitorName competitor={competitor} />
                            <MobileClubName
                              clubName={competitor.organisation}
                              referenceText={mobileClubWidthReference}
                              className="mt-0.5 block truncate text-left text-xs text-muted-foreground lg:hidden"
                            />
                          </div>
                        </TableCell>
                        <TableCell className="px-2 py-1 text-xs text-muted-foreground hidden lg:table-cell">
                          {competitor.organisation}
                        </TableCell>
                        {showFirstLegStartTimes && (
                          <TableCell className="px-2 py-1 text-right font-mono text-xs hidden md:table-cell">
                            {competitor.startTime
                              ? formatTimeToHms(competitor.startTime)
                              : '-'}
                          </TableCell>
                        )}
                        <TableCell
                          className={`px-2 py-1 text-right font-mono text-sm ${timeState.className} ${
                            competitor.isBestLegTime ? bestLegTimeClassName : ''
                          }`}
                        >
                          {timeState.hideOnDesktop ? (
                            <>
                              <span className="md:hidden">
                                {timeState.value}
                              </span>
                              <span className="hidden md:inline">&nbsp;</span>
                            </>
                          ) : (
                            timeState.value
                          )}
                        </TableCell>
                        {selectedLeg != null && selectedLeg > 1 && (
                          <TableCell className="px-2 py-1 text-right font-mono text-sm hidden sm:table-cell">
                            {competitor.cumulativeTime != null
                              ? formatSecondsToTime(competitor.cumulativeTime)
                              : '-'}
                          </TableCell>
                        )}
                        <TableCell className="px-2 py-1 text-sm text-right font-mono font-bold">
                          {competitor.loss != null
                            ? formatSignedLoss(competitor.loss)
                            : '-'}
                        </TableCell>
                      </motion.tr>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
    </div>
  );
};

// Helper functions for data processing
const processCompetitors = (
  competitors: Competitor[],
  resultListMode?: string | null
): ProcessedCompetitor[] => {
  // Unordered modes: keep the status-priority grouping, but sort alphabetically
  // within each status group instead of by race time.
  if (isUnorderedResultListMode(resultListMode)) {
    const sortedCompetitors = competitors
      .slice()
      .sort(compareByStatusPriorityThenName);
    return calculatePositions(sortedCompetitors);
  }

  const getSortableStartTime = (startTime?: string): number => {
    if (!startTime) return Number.POSITIVE_INFINITY;
    const timestamp = new Date(startTime).getTime();
    return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
  };

  const sortedCompetitors = competitors.slice().sort((a, b) => {
    const statusA = getResultStatusPriority(a.status);
    const statusB = getResultStatusPriority(b.status);
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
  const finishedRunners = runners.filter(
    (runner): runner is Competitor & { time: number } =>
      runner.status === 'OK' && runner.time !== undefined
  );
  const { rankById, bestTime } = rankByTime(
    finishedRunners.map(r => ({ id: r.id, time: r.time }))
  );

  return runners.map((runner): ProcessedCompetitor => {
    const position = rankById.get(runner.id);

    if (position !== undefined) {
      const loss = computeLoss(runner.time, bestTime);

      // DŮLEŽITÉ: nepřidávat pole s hodnotou undefined
      return {
        ...runner,
        position,
        ...(loss !== undefined ? { loss } : {}),
      };
    }

    // Non-finished běžci
    const statusDisplay = getResultStatusDisplay(runner.status);

    return {
      ...runner,
      position: statusDisplay.emoji,
      positionTooltip: statusDisplay.tooltip,
    };
  });
};
