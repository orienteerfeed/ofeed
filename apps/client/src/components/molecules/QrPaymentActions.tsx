import { Download, Share2 } from 'lucide-react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { toast } from '@/utils';

interface QrPaymentActionsProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
}

export function QrPaymentActions({ canvasRef }: QrPaymentActionsProps) {
  const { t } = useTranslation();

  const getPng = () => {
    if (!canvasRef.current) throw new Error('Payment QR canvas is unavailable');
    return canvasRef.current.toDataURL('image/png');
  };

  const download = (dataUrl: string) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = 'ofeed-payment.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleDownload = () => {
    try {
      download(getPng());
    } catch {
      toast({
        title: t('Pages.Checkout.QrPayment.ExportError'),
        variant: 'error',
      });
    }
  };

  const handleShare = async () => {
    try {
      // Keep PNG generation synchronous: iOS requires transient user activation
      // when share() is called, which an awaited canvas.toBlob() can lose.
      const dataUrl = getPng();
      const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
      const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
      const file = new File([bytes], 'ofeed-payment.png', {
        type: 'image/png',
      });
      if (!navigator.share || !navigator.canShare?.({ files: [file] })) {
        download(dataUrl);
        toast({
          title: t('Pages.Checkout.QrPayment.ShareUnavailable'),
          variant: 'info',
        });
        return;
      }
      await navigator.share({ files: [file] });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      toast({
        title: t('Pages.Checkout.QrPayment.ShareError'),
        variant: 'error',
      });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => void handleShare()}
        >
          <Share2 className="h-4 w-4" />
          {t('Pages.Checkout.QrPayment.ShareQr')}
        </Button>
        <Button type="button" variant="outline" onClick={handleDownload}>
          <Download className="h-4 w-4" />
          {t('Pages.Checkout.QrPayment.DownloadQr')}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {t('Pages.Checkout.QrPayment.MobileInstructions')}
      </p>
    </div>
  );
}
