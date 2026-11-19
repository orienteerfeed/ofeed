import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import type { EntryOrderItemInput } from '@repo/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/atoms';
import { Input } from '@/components/ui/input';
import { formatEntryFee } from '../Event/Entries/EntryClassCard';

export const ENTRY_PROMO_QUOTE = gql`
  query EntryPromoQuote(
    $eventId: String!
    $code: String!
    $items: [EntryPromoQuoteItemInput!]!
  ) {
    entryPromoQuote(eventId: $eventId, code: $code, items: $items) {
      code
      discountPercent
      subtotal
      eligibleAmount
      discountAmount
      totalAmount
      currency
      excludedItems
    }
  }
`;
export interface PromoSelection {
  code: string;
  fingerprint: string;
  ready: boolean;
}
export function CheckoutPromoCode({
  eventId,
  items,
  selection,
  onChange,
}: {
  eventId: string;
  items: EntryOrderItemInput[];
  selection: PromoSelection | undefined;
  onChange: (
    eventId: string,
    value: PromoSelection,
    quoteUpdate?: boolean
  ) => void;
}) {
  const { t, i18n } = useTranslation();
  const [draft, setDraft] = useState('');
  const code = selection?.code ?? '';
  const fingerprint = JSON.stringify(items);
  const { data, loading, error, refetch } = useQuery<{
    entryPromoQuote: {
      code: string;
      discountPercent: number;
      subtotal: number;
      discountAmount: number;
      totalAmount: number;
      currency: string;
      excludedItems: number;
    };
  }>(ENTRY_PROMO_QUOTE, {
    variables: { eventId, code, items },
    skip: !code,
    fetchPolicy: 'network-only',
  });
  useEffect(() => {
    if (code)
      onChange(
        eventId,
        { code, fingerprint, ready: !!data && !loading && !error },
        true
      );
  }, [code, fingerprint, data, loading, error, eventId, onChange]);
  const quote = !loading && !error && code ? data?.entryPromoQuote : undefined;
  return (
    <section className="space-y-2" aria-label={t('PromoCodes.Title')}>
      <label htmlFor={`promo-${eventId}`} className="text-sm font-medium">
        {t('PromoCodes.Code')}
      </label>
      <div className="flex gap-2">
        <Input
          id={`promo-${eventId}`}
          maxLength={40}
          value={draft}
          onChange={event => setDraft(event.target.value)}
        />
        <Button
          variant="outline"
          disabled={!draft.trim() || loading}
          onClick={() => {
            const next = draft.trim().toUpperCase();
            onChange(eventId, { code: next, fingerprint, ready: false });
            if (next === code) void refetch().catch(() => undefined);
          }}
        >
          {t('PromoCodes.Apply')}
        </Button>
        {code && (
          <Button
            variant="ghost"
            onClick={() => {
              setDraft('');
              onChange(eventId, { code: '', fingerprint, ready: true });
            }}
          >
            {t('PromoCodes.Remove')}
          </Button>
        )}
      </div>
      {loading && code && <p role="status">{t('PromoCodes.Checking')}</p>}
      {error && code && (
        <p role="alert" className="text-destructive">
          {t(
            error.message.includes('PROMO_NO_ELIGIBLE_ITEMS')
              ? 'PromoCodes.NoEligible'
              : 'PromoCodes.Invalid'
          )}
        </p>
      )}
      {quote && (
        <div aria-live="polite" className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span>{t('PromoCodes.Subtotal')}</span>
            <span>
              {formatEntryFee(quote.subtotal, quote.currency, i18n.language)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>
              {quote.code} ({quote.discountPercent}%)
            </span>
            <span>
              −
              {formatEntryFee(
                quote.discountAmount,
                quote.currency,
                i18n.language
              )}
            </span>
          </div>
          {quote.excludedItems > 0 && (
            <p className="text-muted-foreground">{t('PromoCodes.Excluded')}</p>
          )}
          <div className="flex justify-between font-semibold">
            <span>{t('Pages.Checkout.Total')}</span>
            <span>
              {formatEntryFee(quote.totalAmount, quote.currency, i18n.language)}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
