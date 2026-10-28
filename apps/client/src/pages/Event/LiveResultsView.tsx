import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatSecondsToTime, formatTimeToHms } from '@/lib/date';
import { TFunction } from 'i18next';
import { Loader2, Radio, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button } from '../../components/atoms';
import { Alert } from '../../components/organisms';
import { CompetitorName, getMobileCompetitorName } from './CompetitorName';
import {
  compareByFinishDesc,
  matchesLiveFeedQuery,
  rankFeedRows,
} from './live-feed.utils';
import { MobileClubName } from './MobileClubName';
import { ResultsViewport } from './ResultsViewport';
import {
  formatResultListRank,
  getResultStatusDisplay,
  getResultStatusLabel,
  shouldDisplayResultTimes,
} from './result-list.utils';
import { useLiveResultFeed } from './useLiveResultFeed';

/** How many rows are revealed at a time; the rest waits behind a button. */
const PAGE_SIZE = 50;

interface LiveResultsViewProps {
  t: TFunction;
  eventId: string;
  /** From `event.relay`, which the server derives from the event discipline. */
  isRelay: boolean;
  onSelectClass: (className: string) => void;
  onSelectClub: (clubId: number | null) => void;
}

export const LiveResultsView = (props: LiveResultsViewProps) => (
  <EventLiveResultsView key={props.eventId} {...props} />
);

const EventLiveResultsView = ({
  t,
  eventId,
  isRelay,
  onSelectClass,
  onSelectClub,
}: LiveResultsViewProps) => {
  const { rows, highlighted, loading, error } = useLiveResultFeed(eventId);
  const [search, setSearch] = useState('');
  const [revealed, setRevealed] = useState(PAGE_SIZE);

  // A narrower query should start from the top of its own result set.
  useEffect(() => setRevealed(PAGE_SIZE), [search]);

  const allRows = useMemo(() => [...rows.values()], [rows]);
  const ranks = useMemo(
    () => rankFeedRows(allRows, isRelay),
    [allRows, isRelay]
  );
  const matched = useMemo(
    () =>
      allRows
        .slice()
        .sort(compareByFinishDesc)
        .filter(row => matchesLiveFeedQuery(row, search)),
    [allRows, search]
  );
  const visible = matched.slice(0, revealed);

  const mobileClubWidthReference = visible.reduce((longest, row) => {
    const name = getMobileCompetitorName(row);
    return name.length > longest.length ? name : longest;
  }, '');

  if (loading && allRows.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span>{t('Pages.Event.Results.Loading')}</span>
      </div>
    );
  }

  if (error && allRows.length === 0) {
    return (
      <Alert
        severity="error"
        variant="outlined"
        title={t('Pages.Event.Live.ErrorTitle')}
      >
        {error.message}
      </Alert>
    );
  }

  return (
    <ResultsViewport
      resetKey={search}
      error={error}
      className="flex flex-col gap-2"
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder={t('Pages.Event.Live.SearchPlaceholder')}
          aria-label={t('Pages.Event.Live.SearchPlaceholder')}
          className="h-9 pl-8"
        />
      </div>

      {allRows.length === 0 && (
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

      {allRows.length > 0 && matched.length === 0 && (
        <Alert
          severity="info"
          variant="outlined"
          title={t('Pages.Event.Live.NoMatchesTitle')}
        >
          {t('Pages.Event.Live.NoMatches', { query: search })}
        </Alert>
      )}

      {visible.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto [&_table]:text-sm [&_th]:h-7 sm:[&_th]:h-8 [&_th]:px-1.5 sm:[&_th]:px-2 [&_th]:text-xs [&_td]:px-1.5 sm:[&_td]:px-2 [&_td]:py-0.5 sm:[&_td]:py-1 [&_td]:text-sm">
            <Table data-results-table="live">
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="h-8 px-2 text-xs">
                    {t('Pages.Event.Live.Columns.Finish')}
                  </TableHead>
                  <TableHead className="h-8 px-2 text-xs">
                    {t('Pages.Event.Live.Columns.Name')}
                  </TableHead>
                  <TableHead className="h-8 px-2 text-xs">
                    {t('Pages.Event.Live.Columns.Class')}
                  </TableHead>
                  <TableHead className="h-8 px-2 text-xs">
                    {t('Pages.Event.Live.Columns.Rank')}
                  </TableHead>
                  <TableHead className="h-8 px-2 text-xs hidden lg:table-cell">
                    {t('Pages.Event.Live.Columns.Club')}
                  </TableHead>
                  <TableHead className="h-8 px-2 text-right text-xs">
                    {t('Pages.Event.Live.Columns.Time')}
                  </TableHead>
                  <TableHead className="h-8 px-2 text-xs hidden md:table-cell">
                    {t('Pages.Event.Live.Columns.Status')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((row, index) => {
                  const rank = ranks.get(row.id);
                  const readoutFallback = !row.finishTime;
                  const finishLabel = formatTimeToHms(
                    row.finishTime ?? row.updatedAt
                  );
                  // No rank yet (non-OK status, or a relay team still missing an
                  // earlier leg) falls back to the status marker used elsewhere.
                  const statusDisplay = getResultStatusDisplay(row.status);
                  const rankValue: number | string =
                    rank ?? statusDisplay.emoji;
                  const rankTooltip =
                    rank == null
                      ? statusDisplay.tooltip
                      : isRelay && row.leg != null
                        ? t('Pages.Event.Live.RelayRankHint', { leg: row.leg })
                        : '';

                  return (
                    <TableRow
                      key={row.id}
                      className={`h-9 ${
                        highlighted.has(row.id)
                          ? 'bg-orange-200 dark:bg-orange-800'
                          : index % 2 === 0
                            ? 'bg-background hover:bg-muted/30'
                            : 'bg-muted/20 hover:bg-muted/40'
                      }`}
                    >
                      <TableCell
                        className={`px-2 py-1 font-mono text-xs ${
                          readoutFallback ? 'text-muted-foreground' : ''
                        }`}
                        title={
                          readoutFallback
                            ? t('Pages.Event.Live.ReadoutTimeHint')
                            : ''
                        }
                      >
                        {finishLabel}
                      </TableCell>
                      <TableCell className="px-2 py-1 text-sm font-medium">
                        <div className="flex flex-col">
                          <CompetitorName competitor={row} />
                          <MobileClubName
                            clubName={row.organisation ?? ''}
                            referenceText={mobileClubWidthReference}
                            onSelectClub={() =>
                              onSelectClub(row.organisationId ?? null)
                            }
                            className="mt-0.5 block truncate rounded-sm text-left text-xs text-muted-foreground hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:hidden"
                          />
                        </div>
                      </TableCell>
                      <TableCell className="px-2 py-1">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onSelectClass(row.class.name)}
                            className="inline-flex cursor-pointer rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            title={row.class.name}
                          >
                            <Badge
                              variant="secondary"
                              className="text-xs hover:bg-secondary/80"
                            >
                              {row.class.name}
                            </Badge>
                          </button>
                          {row.leg != null && (
                            <span className="whitespace-nowrap text-xs text-muted-foreground">
                              {t('Pages.Event.Live.Leg', { leg: row.leg })}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="px-2 py-1 text-sm font-bold">
                        <span
                          title={rankTooltip}
                          className={rankTooltip ? 'cursor-help' : ''}
                        >
                          {formatResultListRank(
                            rankValue,
                            row.class.resultListMode
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="px-2 py-1 text-xs text-muted-foreground hidden lg:table-cell">
                        {row.organisation && row.organisationId ? (
                          <button
                            type="button"
                            onClick={() => onSelectClub(row.organisationId!)}
                            className="rounded-sm hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            title={row.organisation}
                          >
                            {row.organisation}
                          </button>
                        ) : (
                          row.organisation
                        )}
                      </TableCell>
                      <TableCell className="px-2 py-1 text-right font-mono text-sm">
                        {shouldDisplayResultTimes(row.class.resultListMode) &&
                        row.time != null
                          ? formatSecondsToTime(row.time)
                          : null}
                      </TableCell>
                      <TableCell className="px-2 py-1 hidden md:table-cell">
                        <span className="text-xs font-medium text-muted-foreground">
                          {getResultStatusLabel(row.status)}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {matched.length > visible.length && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setRevealed(current => current + PAGE_SIZE)}
        >
          {t('Pages.Event.Live.ShowMore', {
            next: Math.min(PAGE_SIZE, matched.length - visible.length),
            shown: visible.length,
            total: matched.length,
          })}
        </Button>
      )}
    </ResultsViewport>
  );
};
