import { useTranslation } from 'react-i18next';

export function EntryPaymentDeadline({
  entry,
}: {
  entry: {
    status: string;
    paid: boolean;
    paymentMethod: string | null;
    paymentDueAt?: string | Date | null | undefined;
  };
}) {
  const { t, i18n } = useTranslation();
  if (
    entry.status !== 'RECEIVED' ||
    entry.paid ||
    entry.paymentMethod === 'CASH' ||
    !entry.paymentDueAt
  )
    return null;
  return (
    <p
      role="status"
      className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm"
    >
      {t('EntryPaymentExpiry.Deadline', {
        date: new Date(entry.paymentDueAt).toLocaleString(i18n.language),
      })}
    </p>
  );
}
