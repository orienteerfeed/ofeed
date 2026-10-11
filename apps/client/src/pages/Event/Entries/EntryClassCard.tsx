import type { EntryAvailabilityClass } from '@repo/shared';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/atoms';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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

  return (
    <Card
      role="button"
      tabIndex={0}
      className="cursor-pointer transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      onClick={() => onSelect(entryClass)}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(entryClass);
        }
      }}
    >
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <CardTitle className="text-lg">{entryClass.name}</CardTitle>
        <Badge variant="secondary" className="shrink-0 font-mono">
          {entryClass.competitorCount} / {entryClass.maxNumberOfCompetitors}
        </Badge>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold text-primary">
          {entryClass.fee
            ? formatEntryFee(entryClass.fee.amount, currencyCode, i18n.language)
            : t('Pages.Event.Entries.FreeEntry')}
        </p>
        {(entryClass.birthYearFrom !== null ||
          entryClass.birthYearTo !== null) && (
          <p className="mt-1 text-xs text-muted-foreground">
            {t('Pages.Event.Entries.BirthYearRange', {
              from: entryClass.birthYearFrom ?? '…',
              to: entryClass.birthYearTo ?? '…',
            })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
