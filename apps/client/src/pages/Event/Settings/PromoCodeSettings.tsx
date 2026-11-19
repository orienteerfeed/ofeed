import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { createPromoCodeSchema } from '@repo/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/atoms';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/molecules';

export const EVENT_PROMO_CODES = gql`
  query EventPromoCodes($eventId: String!) {
    eventPromoCodes(eventId: $eventId) {
      id
      code
      discountPercent
      revokedAt
      usageCount
    }
  }
`;
export const CREATE_PROMO_CODE = gql`
  mutation CreateEventPromoCode(
    $eventId: String!
    $code: String!
    $discountPercent: Float!
  ) {
    createEventPromoCode(
      eventId: $eventId
      code: $code
      discountPercent: $discountPercent
    ) {
      message
    }
  }
`;
export const REVOKE_PROMO_CODE = gql`
  mutation RevokeEventPromoCode($eventId: String!, $id: String!) {
    revokeEventPromoCode(eventId: $eventId, id: $id) {
      message
    }
  }
`;
export function PromoCodeSettings({ eventId }: { eventId: string }) {
  const { t } = useTranslation();
  const { data, loading, error, refetch } = useQuery<{
    eventPromoCodes: {
      id: string;
      code: string;
      discountPercent: number;
      revokedAt: string | null;
      usageCount: number;
    }[];
  }>(EVENT_PROMO_CODES, { variables: { eventId } });
  const [create, { loading: creating }] = useMutation(CREATE_PROMO_CODE);
  const [revoke, { loading: revoking }] = useMutation(REVOKE_PROMO_CODE);
  const [code, setCode] = useState('');
  const [percent, setPercent] = useState('');
  const [message, setMessage] = useState('');
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const busy = loading || creating || revoking;
  const save = async () => {
    const parsed = createPromoCodeSchema.safeParse({
      code,
      discountPercent: Number(percent.replace(',', '.')),
    });
    if (!parsed.success) {
      setMessage(t('PromoCodes.Validation'));
      return;
    }
    try {
      await create({ variables: { eventId, ...parsed.data } });
      setCode('');
      setPercent('');
      setMessage('');
      await refetch();
    } catch {
      setMessage(t('PromoCodes.SaveError'));
    }
  };
  return (
    <section className="space-y-4" aria-labelledby="promo-codes-title">
      <h3 id="promo-codes-title" className="text-base font-semibold">
        {t('PromoCodes.Title')}
      </h3>
      <p className="text-sm text-muted-foreground">
        {t('PromoCodes.Description')}
      </p>
      {(message || error) && (
        <p role="alert" className="text-destructive">
          {message || t('PromoCodes.LoadError')}
        </p>
      )}
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={event => {
          event.preventDefault();
          void save();
        }}
      >
        <label className="space-y-2">
          {t('PromoCodes.Code')}
          <Input
            value={code}
            maxLength={40}
            onChange={event => setCode(event.target.value)}
            disabled={busy || !!error}
          />
        </label>
        <label className="space-y-2">
          {t('PromoCodes.Percent')}
          <Input
            type="number"
            min="0.01"
            max="100"
            step="0.01"
            value={percent}
            onChange={event => setPercent(event.target.value)}
            disabled={busy || !!error}
          />
        </label>
        <Button type="submit" disabled={busy || !!error}>
          {t('PromoCodes.Create')}
        </Button>
      </form>
      {!loading && !error && data?.eventPromoCodes.length === 0 && (
        <p>{t('PromoCodes.Empty')}</p>
      )}
      <ul className="space-y-2">
        {data?.eventPromoCodes.map(promo => (
          <li
            key={promo.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
          >
            <strong className="font-mono">{promo.code}</strong>
            <span>{promo.discountPercent}%</span>
            <span>
              {promo.revokedAt
                ? t('PromoCodes.Revoked')
                : t('PromoCodes.Active')}
            </span>
            <span>{t('PromoCodes.Uses', { count: promo.usageCount })}</span>
            <Button
              variant="outline"
              onClick={() => {
                void navigator.clipboard
                  .writeText(promo.code)
                  .catch(() => setMessage(t('PromoCodes.CopyError')));
              }}
            >
              {t('PromoCodes.Copy')}
            </Button>
            {!promo.revokedAt && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setRevokeId(promo.id)}
              >
                {t('PromoCodes.Revoke')}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={revokeId !== null}
        onOpenChange={open => {
          if (!open) setRevokeId(null);
        }}
        confirmText={t('PromoCodes.Revoke')}
        cancelText={t('PromoCodes.Cancel')}
        title={t('PromoCodes.Revoke')}
        description={t('PromoCodes.RevokeDescription')}
        onConfirm={async () => {
          if (!revokeId) return;
          try {
            await revoke({ variables: { eventId, id: revokeId } });
            setRevokeId(null);
            setMessage('');
            await refetch();
          } catch {
            setMessage(t('PromoCodes.SaveError'));
          }
        }}
      />
    </section>
  );
}
