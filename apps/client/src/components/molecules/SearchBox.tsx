import { gql, type TypedDocumentNode } from '@apollo/client';
import { useLazyQuery } from '@apollo/client/react';
import { Link } from '@tanstack/react-router';
import { X } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Input, TableLoadingProgress } from '@/components/atoms'; // tvůj atom (wrapper nad shadcn Input)
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import PATHNAMES from '@/lib/paths/pathnames';
import { formatDate } from '@/lib/utils';

// ---------- GraphQL ----------
type SearchEvent = {
  id: string;
  name: string;
  location: string;
  organizer: string;
  date: string;
  published: boolean;
};
type SearchEventsData = { searchEvents: SearchEvent[] };
type SearchEventsVars = { query: string };

const SEARCH_EVENTS: TypedDocumentNode<SearchEventsData, SearchEventsVars> =
  gql`
    query SearchEvents($query: String!) {
      searchEvents(query: $query) {
        id
        name
        location
        organizer
        date
        published
      }
    }
  `;

// ---------- Component ----------
export type SearchBoxProps = {
  className?: string;
  minChars?: number;
  debounceMs?: number;
};

export function SearchBox({
  className,
  minChars = 3,
  debounceMs = 250,
}: SearchBoxProps) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [input, setInput] = React.useState('');

  const [runSearch, { loading, data }] = useLazyQuery<
    SearchEventsData,
    SearchEventsVars
  >(SEARCH_EVENTS, {
    fetchPolicy: 'network-only',
  });

  // Debounce
  React.useEffect(() => {
    const q = input.trim();
    if (q.length < minChars) {
      return setOpen(false);
    }
    const id = window.setTimeout(() => {
      runSearch({ variables: { query: q } });
      setOpen(true);
    }, debounceMs);
    return () => window.clearTimeout(id);
  }, [input, minChars, debounceMs, runSearch]);

  const results = data?.searchEvents ?? [];
  const showList = open && !loading && results.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className={className}>
          <div className="flex h-10 items-center rounded-full bg-blue-50 px-3 text-zinc-700 dark:bg-zinc-800 dark:text-white xl:w-[225px]">
            <Input
              value={input}
              onChange={e => setInput(e.currentTarget.value)}
              onFocus={() => setOpen(Boolean(input))}
              placeholder="Search..."
              className="h-8 w-full rounded-full border-0 bg-transparent px-0 text-sm font-medium placeholder:text-gray-400 focus-visible:ring-0 dark:placeholder:text-white/70"
              aria-label={t('Search', { ns: 'common' })}
            />
          </div>
        </div>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        className="w-[360px] sm:w-[460px] rounded-2xl p-0"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-2 pt-3">
          <p className="text-base font-bold text-zinc-700 dark:text-white">
            {t('Molecules.SearchBox.SearchResults')}
          </p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="p-1 text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
            aria-label={t('Close', { ns: 'common' }) as string}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* Body */}
        <div className="border-t px-2 py-2 dark:border-white/10">
          {loading ? (
            <div className="px-2 py-6 text-center">
              <TableLoadingProgress />
            </div>
          ) : showList ? (
            <div className="flex flex-col gap-1">
              {results.map(event => (
                <Link
                  key={event.id}
                  // TanStack Router Link
                  {...PATHNAMES.eventDetail(event.id)}
                  // zavře popover po kliknutí
                  onClick={() => setOpen(false)}
                  className="flex w-full items-center rounded-md p-2 text-left hover:bg-gray-100 dark:hover:bg-zinc-700"
                >
                  <div className="ml-1 flex w-full flex-col px-1 text-sm">
                    <p className="mb-1 text-left text-base font-bold text-gray-900 dark:text-white">
                      {event.name}
                    </p>
                    <p className="text-left text-xs text-gray-700 dark:text-gray-200">
                      {event.location} <span aria-hidden>|</span>{' '}
                      {formatDate(new Date(Number(event.date)))}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              {input.trim().length < minChars
                ? t('TypeAtLeastNCharacters', {
                    ns: 'common',
                    n: minChars,
                  })
                : t('NoResults', { ns: 'common' })}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default SearchBox;
