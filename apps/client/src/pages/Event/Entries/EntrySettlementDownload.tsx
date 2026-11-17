import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/atoms';
import { useApi } from '@/hooks/useApi';
import { toast } from '@/utils';
import { ENDPOINTS } from '@/lib/api/endpoints';
export function EntrySettlementDownload({
  eventId,
  entryId,
  access,
}: {
  eventId: string;
  entryId: string;
  access?: string;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const [loading, setLoading] = useState(false);
  const download = async () => {
    setLoading(true);
    try {
      const blob = await api.getBlob(
        ENDPOINTS.entrySettlement(eventId, entryId, access),
        { skipAuth: Boolean(access) }
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `vyuctovani-${entryId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast({ title: t('Billing.Failed'), variant: 'error' });
    } finally {
      setLoading(false);
    }
  };
  return (
    <Button
      variant="outline"
      disabled={loading}
      onClick={() => void download()}
    >
      {t('Billing.Download')}
    </Button>
  );
}
