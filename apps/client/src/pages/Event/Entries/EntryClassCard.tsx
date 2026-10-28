import type { EntryAvailabilityClass } from '@repo/shared';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/atoms';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface EntryClassCardProps {
  entryClass: EntryAvailabilityClass;
  currencyCode: string;
  onSelect: (entryClass: EntryAvailabilityClass) => void;
}

export function formatEntryFee(
  amount: number,
  currencyCode: string,
  language: string
): string {
  try {
    return new Intl.NumberFormat(language, {
      style: 'currency',
      currency: currencyCode,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount} ${currencyCode}`;
  }
}

export function EntryClassCard({
  entryClass,
  currencyCode,
  onSelect,
}: EntryClassCardProps) {
  const { t, i18n } = useTranslation();

  const details = [
    t('Pages.Event.Entries.Occupancy', {
      count: entryClass.competitorCount,
      capacity: entryClass.maxNumberOfCompetitors,
    }),
    ...(entryClass.birthYearFrom !== null || entryClass.birthYearTo !== null
      ? [
          t('Pages.Event.Entries.BirthYearRange', {
            from: entryClass.birthYearFrom ?? '…',
            to: entryClass.birthYearTo ?? '…',
          }),
        ]
      : []),
  ].join(' · ');

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Card
            role="button"
            aria-description={details}
            tabIndex={0}
            className="flex min-w-0 flex-col cursor-pointer transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            onClick={() => onSelect(entryClass)}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect(entryClass);
              }
            }}
          >
            <CardHeader className="space-y-0 p-3 pb-1 sm:flex-row sm:items-start sm:justify-between sm:gap-2 sm:p-6 sm:pb-2">
              <CardTitle className="break-words text-sm leading-snug sm:text-lg">
                {entryClass.name}
              </CardTitle>
              <Badge
                variant="secondary"
                className="hidden shrink-0 font-mono sm:inline-flex"
              >
                {entryClass.competitorCount} /{' '}
                {entryClass.maxNumberOfCompetitors}
              </Badge>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col p-3 pt-0 sm:p-6 sm:pt-0">
              <p className="break-words text-base font-bold text-primary sm:text-2xl">
                {entryClass.fee
                  ? formatEntryFee(
                      entryClass.fee.amount,
                      currencyCode,
                      i18n.language
                    )
                  : t('Pages.Event.Entries.FreeEntry')}
              </p>
              <div className="mt-auto flex items-end justify-between gap-2 pt-2 sm:pt-3">
                {(entryClass.birthYearFrom !== null ||
                  entryClass.birthYearTo !== null) && (
                  <p className="hidden text-xs text-muted-foreground sm:block">
                    {t('Pages.Event.Entries.BirthYearRange', {
                      from: entryClass.birthYearFrom ?? '…',
                      to: entryClass.birthYearTo ?? '…',
                    })}
                  </p>
                )}
                <p className="ml-auto text-right text-xs font-medium tabular-nums text-muted-foreground sm:text-sm">
                  {t('Pages.Event.Entries.PlacesRemaining', {
                    count: Math.max(0, entryClass.availableCount),
                  })}
                </p>
              </div>
            </CardContent>
          </Card>
        </TooltipTrigger>
        <TooltipContent className="max-w-64">{details}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
