import { Alert } from '@/components/organisms';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatSecondsToTime } from '@/lib/date';
import { Loader2, User } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import {
  createFastestSplitChartReferenceTimes,
  createInitialSplitChartVisibility,
  createSplitChartCheckpoints,
} from './split-chart.utils';
import {
  filterValidSplitResultCompetitors,
} from './split-results.utils';
import type { SplitChartCheckpoint } from './split-chart.utils';

// TODO: Refactor type definitions - move to shared types file
// TODO: Define STATUS_PRIORITY in shared constants
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

interface SplitChartProps {
  competitors: Competitor[];
  isLoading?: boolean;
  error?: unknown;
}

interface ChartPoint {
  axisLabel: string;
  checkpointIndex: number;
  checkpointKind: SplitChartCheckpoint['kind'];
  controlCode: string;
  legIndex?: number;
  [key: string]: number | string | undefined;
}

// TODO: Use proper Recharts tooltip types from their definitions
interface RechartsCustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    dataKey?: string;
    value?: number;
    payload?: ChartPoint;
  }>;
  label?: string | number;
}

type PositionsByLeg = Array<Record<string, number>>;
type SplitChartComparisonMode = 'leader' | 'fastest';

// TODO: Move to shared constants - used in both SplitTable and SplitChart
const STATUS_PRIORITY = {
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
} as const;

// Helper function - competitor display name
const getCompetitorLabel = (c: Competitor) =>
  `${c.firstname} ${c.lastname}${c.organisation ? ` (${c.organisation})` : ''}`;

// Custom tooltip for Recharts - fixed types
const makeCustomTooltip =
  (
    formatCheckpointLabel: (
      checkpointKind: SplitChartCheckpoint['kind'],
      legIndex: number | undefined,
      controlCode: string,
    ) => string,
    competitorsById: Record<string, Competitor>,
    positionsByCheckpoint: PositionsByLeg
  ): React.FC<RechartsCustomTooltipProps> =>
  ({ active, payload }) => {
    // Check if tooltip should be displayed
    if (!active || !payload?.length) return null;

    const first = payload[0];
    if (!first?.payload) return null;
    const data = first.payload as ChartPoint;

    const checkpointIndex = data.checkpointIndex as number;
    const checkpointKind = data.checkpointKind as SplitChartCheckpoint['kind'];
    const legIndex = data.legIndex as number | undefined;
    const controlCode = data.controlCode as string;
    const positionMap = positionsByCheckpoint[checkpointIndex] || {};

    return (
      <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-md">
        <div className="mb-1 font-medium">
          {formatCheckpointLabel(checkpointKind, legIndex, controlCode)}
        </div>
        <div className="space-y-1">
          {payload.map(entry => {
            if (!entry.dataKey) return null;

            const competitorId = entry.dataKey;
            const competitor = competitorsById[competitorId];
            const lossSeconds = entry.value;

            // Skip if competitor not found or no loss data
            if (!competitor || lossSeconds == null) return null;

            const position = positionMap[competitorId];

            return (
              <div
                key={competitorId}
                className="flex items-center justify-between gap-2"
              >
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3 text-muted-foreground" />
                  <span className="truncate max-w-[180px]">
                    {getCompetitorLabel(competitor)}
                  </span>
                </span>
                <span className="text-right font-mono">
                  +{formatSecondsToTime(lossSeconds)}
                  {position ? ` (#${position})` : ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

export const SplitChart: React.FC<SplitChartProps> = ({
  competitors,
  isLoading = false,
  error,
}) => {
  const { t } = useTranslation();
  const [comparisonMode, setComparisonMode] =
    useState<SplitChartComparisonMode>('leader');
  // Sort competitors same as in SplitTable (by status priority, then time)
  const sortedCompetitors = useMemo(() => {
    return [...competitors].sort((a, b) => {
      const statusA =
        STATUS_PRIORITY[a.status as keyof typeof STATUS_PRIORITY] ?? 99;
      const statusB =
        STATUS_PRIORITY[b.status as keyof typeof STATUS_PRIORITY] ?? 99;
      if (statusA !== statusB) return statusA - statusB;
      return (a.time ?? Infinity) - (b.time ?? Infinity);
    });
  }, [competitors]);

  const checkpoints = useMemo(() => {
    return createSplitChartCheckpoints(sortedCompetitors);
  }, [sortedCompetitors]);

  const validReferenceCompetitors = useMemo(
    () => filterValidSplitResultCompetitors(sortedCompetitors),
    [sortedCompetitors],
  );

  // Competitor visibility state for checkboxes
  const [visible, setVisible] = useState<Record<string, boolean>>({});

  // Initialize visibility state when competitors change
  useEffect(() => {
    setVisible(prev =>
      createInitialSplitChartVisibility(sortedCompetitors, prev),
    );
  }, [sortedCompetitors]);

  // Filter competitors based on visibility
  const visibleCompetitors = useMemo(
    () => sortedCompetitors.filter(c => visible[c.id]),
    [sortedCompetitors, visible]
  );

  const getCheckpointAxisLabel = (
    checkpointKind: SplitChartCheckpoint['kind'],
    controlCode: string,
  ) => {
    if (checkpointKind === 'start') {
      return String(t('Pages.Event.Splits.Start'));
    }

    if (checkpointKind === 'finish') {
      return String(t('Pages.Event.Splits.Finish'));
    }

    return controlCode;
  };

  // Calculate chart data: cumulative loss to leader and positions for each checkpoint
  const { chartData, positionsByLeg, competitorsById } = useMemo(() => {
    const competitorsById: Record<string, Competitor> = {};
    const fastestReferenceTimes = createFastestSplitChartReferenceTimes(
      checkpoints,
      validReferenceCompetitors,
    );
    const validReferenceCompetitorIds = new Set(
      validReferenceCompetitors.map(competitor => competitor.id),
    );

    sortedCompetitors.forEach(c => {
      competitorsById[c.id] = c;
    });

    const positionsByLeg: PositionsByLeg = [];
    const chartData: ChartPoint[] = [];

    checkpoints.forEach((checkpoint, checkpointIndex) => {
      const allResults: Array<{ id: string; time: number }> = [];
      const referenceResults: Array<{ id: string; time: number }> = [];

      sortedCompetitors.forEach(c => {
        let time: number | undefined;

        if (checkpoint.kind === 'start') {
          time = 0;
        } else if (checkpoint.kind === 'finish') {
          time = c.time;
        } else if (typeof checkpoint.splitIndex === 'number') {
          time = c.splits[checkpoint.splitIndex]?.time;
        }

        if (typeof time === 'number' && !isNaN(time)) {
          const result = { id: c.id, time };
          allResults.push(result);

          if (validReferenceCompetitorIds.has(c.id)) {
            referenceResults.push(result);
          }
        }
      });

      if (allResults.length === 0 || referenceResults.length === 0) return;

      referenceResults.sort((a, b) => a.time - b.time);
      const leaderTime = referenceResults[0]?.time ?? null;
      const referenceTime =
        comparisonMode === 'fastest'
          ? fastestReferenceTimes[checkpointIndex] ?? leaderTime
          : leaderTime;

      const positionMap: Record<string, number> = {};
      let currentPosition = 1;
      let lastTime: number | null = null;

      referenceResults.forEach((res, i) => {
        if (lastTime !== null && res.time !== lastTime) {
          currentPosition = i + 1;
        }
        positionMap[res.id] = currentPosition;
        lastTime = res.time;
      });

      positionsByLeg[checkpointIndex] = positionMap;

      const point: ChartPoint = {
        axisLabel: getCheckpointAxisLabel(checkpoint.kind, checkpoint.controlCode),
        checkpointIndex,
        checkpointKind: checkpoint.kind,
        controlCode: checkpoint.controlCode,
      };

      if (typeof checkpoint.legIndex === 'number') {
        point.legIndex = checkpoint.legIndex;
      }

      allResults.forEach(res => {
        if (referenceTime !== null) {
          point[res.id] = res.time - referenceTime;
        }
      });

      chartData.push(point);
    });

    return { chartData, positionsByLeg, competitorsById };
  }, [
    checkpoints,
    comparisonMode,
    sortedCompetitors,
    t,
    validReferenceCompetitors,
  ]);

  // Predefined colors for chart lines
  const lineColors = [
    '#2563eb', // blue-600
    '#16a34a', // green-600
    '#dc2626', // red-600
    '#7c3aed', // violet-600
    '#f97316', // orange-500
    '#0891b2', // cyan-600
    '#4b5563', // gray-600
    '#db2777', // pink-600
  ];

  const getLineColor = (index: number) =>
    lineColors[index % lineColors.length] ?? '#2563eb';

  const competitorColorById = useMemo(
    () =>
      Object.fromEntries(
        sortedCompetitors.map((competitor, index) => [
          competitor.id,
          getLineColor(index),
        ]),
      ),
    [sortedCompetitors]
  );

  // Memoized custom tooltip component
  const CustomTooltip = useMemo(
    () =>
      makeCustomTooltip(
        (checkpointKind, legIndex, controlCode) => {
          if (checkpointKind === 'start') {
            return String(t('Pages.Event.Splits.Start'));
          }

          if (checkpointKind === 'finish') {
            return String(t('Pages.Event.Splits.Finish'));
          }

          return String(
            t('Pages.Event.Splits.LegLabel', { legIndex, controlCode }),
          );
        },
        competitorsById,
        positionsByLeg,
      ),
    [t, competitorsById, positionsByLeg]
  );

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="mr-2 h-6 w-6 animate-spin" />
          <span>{t('Pages.Event.Splits.LoadingChart')}</span>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Alert
        severity="error"
        variant="outlined"
        title={t('Pages.Event.Splits.ErrorLoadingChart')}
      >
        {error instanceof Error ? error.message : String(error)}
      </Alert>
    );
  }

  // Empty state
  if (chartData.length < 2) {
    return (
      <Alert severity="info" variant="outlined">
        {t('Pages.Event.Alert.EventDataNotAvailableMessage', {
          view: t('Pages.Event.Alert.ViewSplits'),
        })}
      </Alert>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">
            {comparisonMode === 'leader'
              ? t('Pages.Event.Splits.ChartTitle')
              : t('Pages.Event.Splits.ChartTitleFastest')}
          </CardTitle>
          <Badge variant="outline" className="text-xs font-normal">
            {t('Pages.Event.Splits.RunnersCount', {
              count: visibleCompetitors.length,
            })}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {t('Pages.Event.Splits.CompareTo')}
          </span>
          <Tabs
            value={comparisonMode}
            onValueChange={value =>
              setComparisonMode(
                value === 'fastest' ? 'fastest' : 'leader',
              )
            }
            className="w-auto"
          >
            <TabsList className="h-8">
              <TabsTrigger value="leader" className="text-xs">
                {t('Pages.Event.Splits.CompareToLeader')}
              </TabsTrigger>
              <TabsTrigger value="fastest" className="text-xs">
                {t('Pages.Event.Splits.CompareToFastest')}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-6 lg:flex-row">
        {/* Chart on the left */}
        <div className="h-[320px] flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="axisLabel"
                tick={{ fontSize: 10 }}
                angle={-35}
                textAnchor="end"
                height={50}
              />
              <YAxis
                reversed
                allowDecimals={false}
                tickFormatter={value =>
                  `+${formatSecondsToTime(Math.max(0, value as number))}`
                }
              />
              {/* TODO: Fix TypeScript types for Recharts Tooltip content prop */}
              <RechartsTooltip content={<CustomTooltip />} />

              {visibleCompetitors.map(c => (
                <Line
                  key={c.id}
                  type="linear"
                  dataKey={c.id}
                  name={getCompetitorLabel(c)}
                  stroke={competitorColorById[c.id] ?? getLineColor(0)}
                  dot={false}
                  strokeWidth={1.5}
                  activeDot={{ r: 3 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Competitor selection panel on the right */}
        <div className="w-full lg:w-72 border-l border-border/60 lg:pl-4 lg:ml-2 pt-4 lg:pt-0">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{t('Pages.Event.Splits.Runners')}</span>
            <div className="flex gap-2">
              <button
                type="button"
                className="hover:underline"
                onClick={() => {
                  const all: Record<string, boolean> = {};
                  sortedCompetitors.forEach(c => {
                    all[c.id] = true;
                  });
                  setVisible(all);
                }}
              >
                {t('Pages.Event.Splits.SelectAll')}
              </button>
              <span>·</span>
              <button
                type="button"
                className="hover:underline"
                onClick={() => {
                  const none: Record<string, boolean> = {};
                  sortedCompetitors.forEach(c => {
                    none[c.id] = false;
                  });
                  setVisible(none);
                }}
              >
                {t('Pages.Event.Splits.SelectNone')}
              </button>
            </div>
          </div>

          <ScrollArea className="h-[260px] pr-2">
            <div className="space-y-2">
              {sortedCompetitors.map((c, idx) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-2 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={c.id}
                      checked={!!visible[c.id]}
                      onCheckedChange={checked =>
                        setVisible(prev => ({
                          ...prev,
                          [c.id]: !!checked,
                        }))
                      }
                    />
                    <Label
                      htmlFor={c.id}
                      className="cursor-pointer text-xs leading-tight"
                    >
                      <span className="block truncate max-w-[140px]">
                        {getCompetitorLabel(c)}
                      </span>
                      {typeof c.time === 'number' && (
                        <span className="block text-[10px] text-muted-foreground">
                          {formatSecondsToTime(c.time)}
                        </span>
                      )}
                    </Label>
                  </div>

                  <div
                    className="h-3 w-3 rounded-full"
                    style={{
                      backgroundColor: competitorColorById[c.id] ?? getLineColor(idx),
                    }}
                  />
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
};
