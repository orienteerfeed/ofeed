import { Alert } from '@/components/organisms';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatSecondsToTime } from '@/lib/date';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Loader2,
  RotateCcw,
  User,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CompetitorName } from './CompetitorName';

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

interface ProcessedCompetitor extends Competitor {
  position?: number | string | undefined;
  positionTooltip?: string | undefined;
  loss?: number | undefined;
}

interface SplitTableProps {
  competitors: Competitor[];
  isLoading?: boolean;
  error?: unknown;
}

interface LegPositionData {
  [controlCode: string]: {
    [competitorId: string]: number;
  };
}

interface SplitPositionData {
  [controlCode: string]: {
    [competitorId: string]: number;
  };
}

// Sorting types
type SortField =
  | 'position'
  | 'time'
  | 'loss'
  | `leg-${number}`
  | `split-${number}`
  | 'final-leg';
type SortDirection = 'asc' | 'desc';

interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

// Constants
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

const STATUS_CONFIG = {
  Active: { emoji: '🏃', tooltip: 'Currently running', color: 'text-blue-600' },
  DidNotFinish: {
    emoji: '🏳️',
    tooltip: 'Did Not Finish',
    color: 'text-orange-600',
  },
  DidNotStart: {
    emoji: '🚷',
    tooltip: 'Did not start',
    color: 'text-gray-600',
  },
  Disqualified: { emoji: '🟥', tooltip: 'Disqualified', color: 'text-red-600' },
  Finished: {
    emoji: '🏁',
    tooltip: 'Waiting for readout',
    color: 'text-yellow-600',
  },
  Inactive: {
    emoji: '🛏️',
    tooltip: 'Waiting for start time',
    color: 'text-gray-500',
  },
  MissingPunch: {
    emoji: '🙈',
    tooltip: 'Missing Punch',
    color: 'text-red-500',
  },
  NotCompeting: {
    emoji: '🦄',
    tooltip: 'Not competing',
    color: 'text-purple-600',
  },
  OverTime: { emoji: '⌛', tooltip: 'Over Time', color: 'text-orange-500' },
} as const;

// Thresholds for highlighting - based on standard deviation from competitor's average loss
const TIME_LOSS_DEVIATION_THRESHOLDS = {
  SIGNIFICANT_LOSS: 1.5, // 1.5x standard deviation
  MAJOR_LOSS: 2.5, // 2.5x standard deviation
  CRITICAL_LOSS: 4.0, // 4.0x standard deviation
};

// Helper functions
const getLegTime = (splits: Split[], index: number): number | null => {
  const currentTime = splits[index]?.time ?? null;
  const previousTime = index === 0 ? 0 : (splits[index - 1]?.time ?? null);

  if (currentTime === null || previousTime === null) return null;
  return currentTime - previousTime;
};

const calculatePositions = (runners: Competitor[]): ProcessedCompetitor[] => {
  const clonedRunners = runners.map(runner => ({ ...runner }));

  const finishedRunners = clonedRunners.filter(
    runner => runner.status === 'OK' && runner.time
  ) as ProcessedCompetitor[];

  finishedRunners.sort((a, b) => (a.time || 0) - (b.time || 0));

  let position = 1;
  for (let i = 0; i < finishedRunners.length; i++) {
    const currentRunner = finishedRunners[i];
    const previousRunner = finishedRunners[i - 1];
    if (
      currentRunner &&
      previousRunner &&
      i > 0 &&
      currentRunner.time === previousRunner.time
    ) {
      currentRunner.position = previousRunner.position;
    } else if (currentRunner) {
      currentRunner.position = position;
    }
    position++;
  }

  const leaderTime = finishedRunners[0]?.time || null;

  return clonedRunners.map(runner => {
    const finished = finishedRunners.find(r => r.id === runner.id);

    let positionWithEmoji: string | undefined;
    let positionTooltip: string | undefined;
    let lossToLeader: number | undefined;

    if (finished) {
      lossToLeader =
        leaderTime !== null ? (finished.time || 0) - leaderTime : undefined;
    } else {
      const statusConfig =
        STATUS_CONFIG[runner.status as keyof typeof STATUS_CONFIG];
      if (statusConfig) {
        positionWithEmoji = statusConfig.emoji;
        positionTooltip = statusConfig.tooltip;
      }
    }

    return {
      ...runner,
      position: finished ? finished.position : positionWithEmoji,
      positionTooltip: finished ? undefined : positionTooltip,
      loss: lossToLeader,
    };
  });
};

const calculateSplitPositions = (
  competitors: ProcessedCompetitor[],
  controlCodes: string[]
): SplitPositionData => {
  const positions: SplitPositionData = {};

  controlCodes.forEach(code => {
    const runnersWithSplit = competitors
      .map(c => {
        const split = c.splits.find(s => s.controlCode === code);
        return split && typeof split.time === 'number'
          ? { id: c.id, time: split.time }
          : null;
      })
      .filter(Boolean)
      .sort((a, b) => a!.time - b!.time);

    let currentPosition = 1;
    let lastTime: number | null = null;
    const positionMap: { [competitorId: string]: number } = {};

    runnersWithSplit.forEach((r, i) => {
      if (lastTime !== null && r!.time !== lastTime) {
        currentPosition = i + 1;
      }
      positionMap[r!.id] = currentPosition;
      lastTime = r!.time;
    });

    positions[code] = positionMap;
  });

  return positions;
};

// Calculate average and standard deviation of losses for each competitor
const calculateCompetitorLossStats = (
  competitors: Competitor[],
  controlCodes: string[],
  legLosses: { [controlCode: string]: { [competitorId: string]: number } }
): {
  [competitorId: string]: {
    averageLoss: number;
    standardDeviation: number;
    losses: number[];
  };
} => {
  const stats: {
    [competitorId: string]: {
      averageLoss: number;
      standardDeviation: number;
      losses: number[];
    };
  } = {};

  competitors.forEach(competitor => {
    const losses: number[] = [];

    controlCodes.forEach(code => {
      const legLoss = legLosses[code]?.[competitor.id];
      if (legLoss !== undefined && legLoss > 0) {
        losses.push(legLoss);
      }
    });

    if (losses.length > 0) {
      const averageLoss =
        losses.reduce((sum, loss) => sum + loss, 0) / losses.length;
      const variance =
        losses.reduce((sum, loss) => sum + Math.pow(loss - averageLoss, 2), 0) /
        losses.length;
      const standardDeviation = Math.sqrt(variance);

      stats[competitor.id] = {
        averageLoss,
        standardDeviation,
        losses,
      };
    } else {
      stats[competitor.id] = {
        averageLoss: 0,
        standardDeviation: 0,
        losses: [],
      };
    }
  });

  return stats;
};

const getLossDeviationLevel = (
  loss: number,
  averageLoss: number,
  standardDeviation: number
): 'none' | 'significant' | 'major' | 'critical' => {
  if (standardDeviation === 0) return 'none'; // No variation to measure against

  const deviation = (loss - averageLoss) / standardDeviation;

  if (deviation >= TIME_LOSS_DEVIATION_THRESHOLDS.CRITICAL_LOSS)
    return 'critical';
  if (deviation >= TIME_LOSS_DEVIATION_THRESHOLDS.MAJOR_LOSS) return 'major';
  if (deviation >= TIME_LOSS_DEVIATION_THRESHOLDS.SIGNIFICANT_LOSS)
    return 'significant';
  return 'none';
};

const getLossColorClass = (lossLevel: string): string => {
  switch (lossLevel) {
    case 'significant':
      return 'bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-950/20 dark:border-orange-800 dark:text-orange-300';
    case 'major':
      return 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950/20 dark:border-red-800 dark:text-red-300';
    case 'critical':
      return 'bg-red-100 border-red-300 text-red-900 dark:bg-red-950/40 dark:border-red-900 dark:text-red-200';
    default:
      return 'bg-muted/40 border-muted';
  }
};

const getLossTooltip = (
  loss: number,
  averageLoss: number,
  standardDeviation: number,
  lossLevel: string,
  bestTime: number | null,
  legTime: number | null
): string => {
  const lossToBest =
    bestTime !== null && legTime !== null
      ? `Loss to best: +${formatSecondsToTime(legTime - bestTime)}`
      : '';

  if (standardDeviation === 0) {
    return lossToBest || `Time loss: +${formatSecondsToTime(loss)}`;
  }

  const deviation = (loss - averageLoss) / standardDeviation;
  const levels = {
    significant: `Significantly above average: +${formatSecondsToTime(loss)} (${deviation.toFixed(1)}σ)`,
    major: `Major deviation: +${formatSecondsToTime(loss)} (${deviation.toFixed(1)}σ)`,
    critical: `Critical deviation: +${formatSecondsToTime(loss)} (${deviation.toFixed(1)}σ)`,
    none: `Time loss: +${formatSecondsToTime(loss)} (${deviation.toFixed(1)}σ)`,
  };

  const baseMessage = levels[lossLevel as keyof typeof levels] || levels.none;
  return lossToBest ? `${baseMessage}\n${lossToBest}` : baseMessage;
};

// Sorting helper functions
const getCompetitorSortValue = (
  competitor: ProcessedCompetitor,
  field: SortField
): number | string => {
  switch (field) {
    case 'position':
      return typeof competitor.position === 'number'
        ? competitor.position
        : 9999;

    case 'time':
      return competitor.time ?? Infinity;

    case 'loss':
      return competitor.loss ?? Infinity;

    case 'final-leg':
      {
        const lastSplitTime = competitor.splits.at(-1)?.time;
        const finishTime = competitor.time;
        if (lastSplitTime && finishTime) {
          return finishTime - lastSplitTime;
        }
        return Infinity;
      }

    default:
      if (field.startsWith('leg-')) {
        const legIndex = parseInt(field.split('-')[1] ?? '0');
        const legTime = getLegTime(competitor.splits, legIndex);
        return legTime ?? Infinity;
      }

      if (field.startsWith('split-')) {
        const splitIndex = parseInt(field.split('-')[1] ?? '0');
        const splitTime = competitor.splits[splitIndex]?.time;
        return splitTime ?? Infinity;
      }

      return Infinity;
  }
};

const sortCompetitors = (
  competitors: ProcessedCompetitor[],
  sortConfig: SortConfig
): ProcessedCompetitor[] => {
  return [...competitors].sort((a, b) => {
    const aValue = getCompetitorSortValue(a, sortConfig.field);
    const bValue = getCompetitorSortValue(b, sortConfig.field);

    let result = 0;

    if (typeof aValue === 'number' && typeof bValue === 'number') {
      result = aValue - bValue;
    } else {
      result = String(aValue).localeCompare(String(bValue));
    }

    return sortConfig.direction === 'asc' ? result : -result;
  });
};

// Main Component
export const SplitTable: React.FC<SplitTableProps> = ({
  competitors,
  isLoading = false,
  error,
}) => {
  const { t } = useTranslation();
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    field: 'position',
    direction: 'asc',
  });

  // Sort competitors by status and time initially
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

  // Preprocess competitors data
  const processedCompetitors = useMemo(() => {
    return calculatePositions(sortedCompetitors);
  }, [sortedCompetitors]);

  // Build the list of all controlCodes from first competitor
  const controlCodes = useMemo(() => {
    return sortedCompetitors[0]?.splits.map(split => split.controlCode) || [];
  }, [sortedCompetitors]);

  // Apply sorting
  const sortedAndProcessedCompetitors = useMemo(() => {
    return sortCompetitors(processedCompetitors, sortConfig);
  }, [processedCompetitors, sortConfig]);

  // Calculate best leg times and leg positions
  const { bestLegTimes, legPositions, legLosses } = useMemo(() => {
    const bestLegTimes: { [controlCode: string]: number | null } = {};
    const legPositions: LegPositionData = {};
    const legLosses: {
      [controlCode: string]: { [competitorId: string]: number };
    } = {};

    controlCodes.forEach((code, idx) => {
      const legResults: Array<{ id: string; time: number }> = [];

      competitors.forEach(c => {
        const legTime = getLegTime(c.splits, idx);
        if (legTime !== null && !isNaN(legTime)) {
          legResults.push({ id: c.id, time: legTime });
        }
      });

      legResults.sort((a, b) => a.time - b.time);
      bestLegTimes[code] = legResults[0]?.time ?? null;

      legPositions[code] = {};
      legLosses[code] = {};

      let pos = 1;
      for (let i = 0; i < legResults.length; i++) {
        const currentResult = legResults[i];
        const previousResult = legResults[i - 1];

        if (
          currentResult &&
          previousResult &&
          i > 0 &&
          currentResult.time === previousResult.time
        ) {
          legPositions[code][currentResult.id] =
            legPositions[code][previousResult.id]!;
        } else if (currentResult) {
          legPositions[code][currentResult.id] = pos;
        }

        if (currentResult) {
          const bestTime = bestLegTimes[code];
          if (bestTime != null) {
            legLosses[code][currentResult.id] = currentResult.time - bestTime;
          }
        }

        pos++;
      }
    });

    return { bestLegTimes, legPositions, legLosses };
  }, [competitors, controlCodes]);

  // Calculate competitor loss statistics
  const competitorLossStats = useMemo(() => {
    return calculateCompetitorLossStats(competitors, controlCodes, legLosses);
  }, [competitors, controlCodes, legLosses]);

  const splitPositions = useMemo(() => {
    return calculateSplitPositions(processedCompetitors, controlCodes);
  }, [processedCompetitors, controlCodes]);

  const visibleCompetitors = sortedAndProcessedCompetitors.filter(
    c => !['Active', 'Inactive', 'Finished'].includes(c.status)
  );

  // Sort handler
  const handleSort = (field: SortField) => {
    setSortConfig(current => {
      if (current.field === field) {
        // Toggle direction if same field
        return {
          field,
          direction: current.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      // New field, default to ascending
      return {
        field,
        direction: 'asc',
      };
    });
  };

  // Reset to default sorting
  const resetSorting = () => {
    setSortConfig({
      field: 'position',
      direction: 'asc',
    });
  };

  const getSortIcon = (field: SortField) => {
    if (sortConfig.field !== field) {
      return <ArrowUpDown className="h-3 w-3" />;
    }
    return sortConfig.direction === 'asc' ? (
      <ArrowUp className="h-3 w-3" />
    ) : (
      <ArrowDown className="h-3 w-3" />
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          <span>{t('Pages.Event.Splits.LoadingTimes')}</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert
        severity="error"
        variant="outlined"
        title="Error loading split times"
      >
        {error instanceof Error ? error.message : String(error)}
      </Alert>
    );
  }

  if (visibleCompetitors.length === 0) {
    return (
      <Alert severity="info" variant="outlined">
        {t('Pages.Event.Alert.EventDataNotAvailableMessage', {
          view: t('Pages.Event.Alert.ViewSplits'),
        })}
      </Alert>
    );
  }

  return (
    <TooltipProvider>
      <Card className="w-full">
        {/* Sorting Controls */}
        <div className="p-4 border-b bg-muted/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Sorted by:</span>
            <Badge variant="secondary" className="font-medium">
              {sortConfig.field === 'position' && 'Position'}
              {sortConfig.field === 'time' && 'Finish Time'}
              {sortConfig.field === 'loss' && 'Loss to Leader'}
              {sortConfig.field === 'final-leg' && 'Final Leg Time'}
              {sortConfig.field.startsWith('leg-') &&
                `Leg ${parseInt(sortConfig.field.split('-')[1] ?? '0') + 1}`}
              {sortConfig.field.startsWith('split-') &&
                `Split ${parseInt(sortConfig.field.split('-')[1] ?? '0') + 1}`}{' '}
              {sortConfig.direction === 'asc' ? '(Asc)' : '(Desc)'}
            </Badge>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={resetSorting}
            className="h-8 gap-1"
          >
            <RotateCcw className="h-3 w-3" />
            Reset Sort
          </Button>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                {/* Position Column */}
                <TableHead className="w-12 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSort('position')}
                    className="h-8 font-medium hover:bg-muted"
                  >
                    <span className="mr-1">#</span>
                    {getSortIcon('position')}
                  </Button>
                </TableHead>

                <TableHead className="min-w-[140px]">Competitor</TableHead>

                {/* Finish Time Column */}
                <TableHead className="w-20 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSort('time')}
                    className="h-8 font-medium hover:bg-muted"
                  >
                    <span className="mr-1">Finish</span>
                    {getSortIcon('time')}
                  </Button>
                </TableHead>

                {/* Loss Column */}
                <TableHead className="w-20 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSort('loss')}
                    className="h-8 font-medium hover:bg-muted"
                  >
                    <span className="mr-1">Loss</span>
                    {getSortIcon('loss')}
                  </Button>
                </TableHead>

                {/* Leg Columns */}
                {controlCodes.map((code, i) => (
                  <TableHead key={i} className="text-center min-w-[110px]">
                    <div className="flex flex-col text-xs">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSort(`leg-${i}`)}
                        className="h-8 font-medium hover:bg-muted p-1"
                      >
                        <span className="text-xs mr-1">Leg {i + 1}</span>
                        {getSortIcon(`leg-${i}`)}
                      </Button>
                      <span className="text-muted-foreground font-normal">
                        ({code})
                      </span>
                    </div>
                  </TableHead>
                ))}

                {/* Final Leg Column */}
                <TableHead className="text-center min-w-[100px]">
                  <div className="flex flex-col text-xs">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort('final-leg')}
                      className="h-8 font-medium hover:bg-muted p-1"
                    >
                      <span className="text-xs mr-1">Final</span>
                      {getSortIcon('final-leg')}
                    </Button>
                    <span className="text-muted-foreground font-normal">
                      (Finish)
                    </span>
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleCompetitors.map(competitor => (
                <CompetitorRow
                  key={competitor.id}
                  competitor={competitor}
                  controlCodes={controlCodes}
                  bestLegTimes={bestLegTimes}
                  legPositions={legPositions}
                  legLosses={legLosses}
                  competitorLossStats={competitorLossStats}
                  splitPositions={splitPositions}
                />
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Legend */}
        <div className="p-4 border-t bg-muted/20">
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-100 border border-green-300 rounded" />
              <span>Fastest leg time</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-100 border border-blue-300 rounded" />
              <span>Best cumulative time</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-orange-100 border border-orange-300 rounded" />
              <span>Significant deviation (&gt;1.5σ)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-100 border border-red-300 rounded" />
              <span>Major deviation (&gt;2.5σ)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-200 border border-red-400 rounded" />
              <span>Critical deviation (&gt;4.0σ)</span>
            </div>
          </div>
        </div>
      </Card>
    </TooltipProvider>
  );
};

// Sub-components (CompetitorRow remains the same as in your original code)
interface CompetitorRowProps {
  competitor: ProcessedCompetitor;
  controlCodes: string[];
  bestLegTimes: { [controlCode: string]: number | null };
  legPositions: LegPositionData;
  legLosses: { [controlCode: string]: { [competitorId: string]: number } };
  competitorLossStats: {
    [competitorId: string]: {
      averageLoss: number;
      standardDeviation: number;
      losses: number[];
    };
  };
  splitPositions: SplitPositionData;
}

const CompetitorRow: React.FC<CompetitorRowProps> = ({
  competitor,
  controlCodes,
  bestLegTimes,
  legPositions,
  legLosses,
  competitorLossStats,
  splitPositions,
}) => {
  const competitorStats = competitorLossStats[competitor.id];

  return (
    <TableRow className="group hover:bg-muted/30 transition-colors">
      <TableCell className="text-center font-medium">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center justify-center">
              {competitor.position}
              {typeof competitor.position === 'number' && '.'}
            </div>
          </TooltipTrigger>
          {competitor.positionTooltip && (
            <TooltipContent>
              <p>{competitor.positionTooltip}</p>
            </TooltipContent>
          )}
        </Tooltip>
      </TableCell>

      <TableCell>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            <User className="w-3 h-3 text-muted-foreground flex-shrink-0" />
            <span className="font-medium truncate">
              <CompetitorName competitor={competitor} />
            </span>
          </div>
          <span className="text-xs text-muted-foreground truncate mt-0.5">
            {competitor.organisation}
          </span>
        </div>
      </TableCell>

      <TableCell className="text-center font-mono text-sm font-medium">
        {competitor.time ? formatSecondsToTime(competitor.time) : '-'}
      </TableCell>

      <TableCell className="text-center font-mono text-sm">
        {competitor.loss && competitor.loss > 0 ? (
          <Badge variant="outline" className="text-xs font-medium">
            +{formatSecondsToTime(competitor.loss)}
          </Badge>
        ) : (
          '-'
        )}
      </TableCell>

      {/* Leg Times */}
      {controlCodes.map((code, index) => {
        const legTime = getLegTime(competitor.splits, index);
        const legPosition = legPositions[code]?.[competitor.id];
        const splitPosition = splitPositions[code]?.[competitor.id];

        const rawBestTime = bestLegTimes[code];
        const bestTime: number | null = rawBestTime ?? null;

        const isBestLeg =
          legTime !== null && bestTime !== null && legTime === bestTime;
        const isBestSplit = splitPosition === 1;
        const legLoss = legLosses[code]?.[competitor.id];

        const lossLevel =
          legLoss !== undefined &&
          competitorStats &&
          competitorStats.standardDeviation > 0
            ? getLossDeviationLevel(
                legLoss,
                competitorStats.averageLoss,
                competitorStats.standardDeviation
              )
            : 'none';

        const showLossWarning = lossLevel !== 'none' && !isBestLeg;

        return (
          <TableCell key={index} className="text-center p-2">
            <div className="flex flex-col gap-1.5">
              {/* Leg Time */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={`
                      font-mono text-xs px-2 py-1.5 rounded border font-medium
                      transition-colors
                      ${
                        isBestLeg
                          ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-950/20 dark:border-green-800 dark:text-green-300'
                          : showLossWarning
                            ? getLossColorClass(lossLevel)
                            : 'bg-muted/40 border-muted'
                      }
                    `}
                  >
                    {legTime ? formatSecondsToTime(legTime) : '-'}
                    {legPosition && (
                      <span className="text-[10px] opacity-70 ml-1">
                        ({legPosition})
                      </span>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-[300px] whitespace-pre-line">
                  <p>Leg time to {code}</p>
                  {isBestLeg && (
                    <p className="text-xs mt-1 text-green-600">Fastest leg!</p>
                  )}
                  {showLossWarning && competitorStats && (
                    <p className="text-xs mt-1 text-red-600">
                      {getLossTooltip(
                        legLoss!,
                        competitorStats.averageLoss,
                        competitorStats.standardDeviation,
                        lossLevel,
                        bestTime,
                        legTime
                      )}
                    </p>
                  )}

                  {!showLossWarning &&
                    bestTime !== null &&
                    legTime !== null && (
                      <p className="text-xs mt-1 text-muted-foreground">
                        Loss to best: +{formatSecondsToTime(legTime - bestTime)}
                      </p>
                    )}
                </TooltipContent>
              </Tooltip>

              {/* Split Time */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={`
                      font-mono text-xs px-2 py-1.5 rounded border
                      transition-colors
                      ${
                        isBestSplit
                          ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/20 dark:border-blue-800 dark:text-blue-300'
                          : 'bg-muted/20 border-muted/60'
                      }
                    `}
                  >
                    {competitor.splits[index]?.time
                      ? formatSecondsToTime(competitor.splits[index].time)
                      : '-'}
                    {splitPosition && (
                      <span className="text-[10px] opacity-70 ml-1">
                        ({splitPosition})
                      </span>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Cumulative time at {code}</p>
                  {isBestSplit && (
                    <p className="text-xs mt-1 text-blue-600">
                      Leading at this point!
                    </p>
                  )}
                </TooltipContent>
              </Tooltip>
            </div>
          </TableCell>
        );
      })}

      {/* Final Leg */}
      <TableCell className="text-center p-2">
        <div className="font-mono text-xs bg-muted/40 px-2 py-1.5 rounded border border-muted font-medium">
          {(() => {
            const lastSplitTime = competitor.splits.at(-1)?.time;
            const finishTime = competitor.time;
            if (lastSplitTime && finishTime) {
              const finalLegTime = finishTime - lastSplitTime;
              return formatSecondsToTime(finalLegTime);
            }
            return '-';
          })()}
        </div>
      </TableCell>
    </TableRow>
  );
};
