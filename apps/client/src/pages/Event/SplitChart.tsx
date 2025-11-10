import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatSecondsToTime } from '@/lib/date';
import { Loader2, User } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';

// Stejné typy jako ve SplitTable
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
  error?: any;
}

interface ChartPoint {
  legIndex: number;
  controlCode: string;
  [key: string]: number | string | undefined;
}

interface RechartsTooltipEntry {
  payload: ChartPoint;
  dataKey?: string;
  value?: number;
}

interface RechartsCustomTooltipProps {
  active?: boolean;
  payload?: RechartsTooltipEntry[];
  label?: string | number;
}

type PositionsByLeg = Array<Record<string, number>>;

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

// Pomocná – jméno závodníka
const getCompetitorLabel = (c: Competitor) =>
  `${c.firstname} ${c.lastname}${c.organisation ? ` (${c.organisation})` : ''}`;

// Custom tooltip pro Recharts
const makeCustomTooltip =
  (
    competitorsById: Record<string, Competitor>,
    positionsByLeg: PositionsByLeg
  ) =>
  ({ active, payload }: RechartsCustomTooltipProps) => {
    // payload?.length ošetří i undefined i prázdné pole
    if (!active || !payload?.length) return null;

    // po tomhle guardu víme, že payload[0] existuje -> použijeme pomocnou proměnnou + !
    const first = payload[0]!;
    const data = first.payload as ChartPoint;

    const legIndex = data.legIndex as number;
    const controlCode = data.controlCode as string;
    const positionMap = positionsByLeg[legIndex - 1] || {};

    return (
      <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-md">
        <div className="mb-1 font-medium">
          Leg {legIndex} ({controlCode})
        </div>
        <div className="space-y-1">
          {payload.map((entry: RechartsTooltipEntry) => {
            if (!entry.dataKey) return null;

            const competitorId = entry.dataKey;
            const competitor = competitorsById[competitorId];
            const lossSeconds = entry.value;

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
  // seřadíme stejně jako v tabulce (OK, čas, atd.)
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

  const controlCodes = useMemo(() => {
    return sortedCompetitors[0]?.splits.map(s => s.controlCode) ?? [];
  }, [sortedCompetitors]);

  // map závodník -> viditelnost (checkbox)
  const [visible, setVisible] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Při změně seznamu závodníků pro jednoduchost nastavíme vše na true
    const initial: Record<string, boolean> = {};
    sortedCompetitors.forEach(c => {
      initial[c.id] = true;
    });
    setVisible(initial);
  }, [sortedCompetitors]);

  const visibleCompetitors = useMemo(
    () => sortedCompetitors.filter(c => visible[c.id]),
    [sortedCompetitors, visible]
  );

  // Přepočet dat pro graf: loss na nejlepšího + pozice na každém mezičase
  const { chartData, positionsByLeg, competitorsById } = useMemo(() => {
    const competitorsById: Record<string, Competitor> = {};
    sortedCompetitors.forEach(c => {
      competitorsById[c.id] = c;
    });

    const positionsByLeg: PositionsByLeg = [];
    const chartData: ChartPoint[] = [];

    controlCodes.forEach((code, idx) => {
      // Závodníci s časem na tomto mezičase
      const legResults: Array<{ id: string; time: number }> = [];

      sortedCompetitors.forEach(c => {
        const time = c.splits[idx]?.time;
        if (typeof time === 'number' && !isNaN(time)) {
          legResults.push({ id: c.id, time });
        }
      });

      if (legResults.length === 0) return;

      legResults.sort((a, b) => a.time - b.time);

      const leaderTime = legResults[0]?.time ?? null;

      const positionMap: Record<string, number> = {};
      let currentPosition = 1;
      let lastTime: number | null = null;

      legResults.forEach((res, i) => {
        if (lastTime !== null && res.time !== lastTime) {
          currentPosition = i + 1;
        }
        positionMap[res.id] = currentPosition;
        lastTime = res.time;
      });

      positionsByLeg.push(positionMap);

      const point: ChartPoint = {
        legIndex: idx + 1,
        controlCode: code,
      };

      legResults.forEach(res => {
        if (leaderTime !== null) {
          point[res.id] = res.time - leaderTime; // loss na nejlepšího
        }
      });

      chartData.push(point);
    });

    return { chartData, positionsByLeg, competitorsById };
  }, [sortedCompetitors, controlCodes]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="mr-2 h-6 w-6 animate-spin" />
          <span>Loading split chart...</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Error loading split chart: {error.message}
        </AlertDescription>
      </Alert>
    );
  }

  if (!chartData.length || !controlCodes.length) {
    return (
      <Alert>
        <AlertDescription>
          No split data available to display the chart.
        </AlertDescription>
      </Alert>
    );
  }

  // předpřipravené barvy (stačí pár, pak se recyklují)
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

  const customTooltip = useMemo(
    () => makeCustomTooltip(competitorsById, positionsByLeg),
    [competitorsById, positionsByLeg]
  );

  return (
    <Card className="w-full">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span>Race progression (loss to leader)</span>
          <Badge variant="outline" className="text-xs font-normal">
            {visibleCompetitors.length} runners
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-6 lg:flex-row">
        {/* Graf vlevo */}
        <div className="h-[320px] flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="controlCode"
                tick={{ fontSize: 10 }}
                angle={-35}
                textAnchor="end"
                height={50}
              />
              <YAxis
                tickFormatter={value =>
                  `+${formatSecondsToTime(Math.max(0, value as number))}`
                }
              />
              <RechartsTooltip content={customTooltip} />
              <Legend />

              {visibleCompetitors.map((c, idx) => (
                <Line
                  key={c.id}
                  type="monotone"
                  dataKey={c.id}
                  name={getCompetitorLabel(c)}
                  stroke={lineColors[idx % lineColors.length]}
                  dot={false}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Panel závodníků vpravo */}
        <div className="w-full lg:w-72 border-l border-border/60 lg:pl-4 lg:ml-2 pt-4 lg:pt-0">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Runners</span>
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
                All
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
                None
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
                      backgroundColor: lineColors[idx % lineColors.length],
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
