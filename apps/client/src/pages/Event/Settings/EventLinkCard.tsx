import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { TFunction } from 'i18next';
import {
  CheckCircle2,
  Copy,
  Loader2,
  Printer,
  Send,
  Share2,
  XCircle,
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import React, { useEffect, useRef, useState } from 'react';
import { Button } from '../../../components/atoms';
import { config } from '../../../config';
import { useApi } from '../../../hooks';
import { ENDPOINTS } from '../../../lib/api/endpoints';
import { PATHNAMES } from '../../../lib/paths/pathnames';
import { toast } from '../../../utils';

interface EventLinkCardProps {
  t: TFunction;
  eventId: string;
  eventSlug?: string | null;
  eventName: string;
  eventLocation: string;
  eventDateFormatted: string;
  onSlugUpdated?: () => void | Promise<void>;
}

type SlugStatus =
  | 'idle'
  | 'checking'
  | 'saving'
  | 'saved'
  | 'invalid'
  | 'unavailable'
  | 'error';

type SlugAvailabilityResponse = {
  data?: {
    slug: string;
    available: boolean;
    reason: string | null;
  };
};

type SlugUpdateResponse = {
  data?: {
    id: string;
    slug: string | null;
  };
};

const slugMinLength = 6;
const slugMaxLength = 64;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function normalizeSlugInput(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export const EventLinkCard: React.FC<EventLinkCardProps> = ({
  t,
  eventId,
  eventSlug,
  eventName,
  eventLocation,
  eventDateFormatted,
  onSlugUpdated,
}) => {
  const qrRef = useRef<HTMLDivElement>(null);
  const api = useApi();
  const [slugInput, setSlugInput] = useState(eventSlug ?? '');
  const [savedSlug, setSavedSlug] = useState(eventSlug ?? null);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>(
    eventSlug ? 'saved' : 'idle'
  );
  const slugInputRef = useRef(slugInput);
  const latestSlugRequestRef = useRef(0);

  // Pre-bake the logo with a white frame into a data URL so qrcode.react renders
  // the padded version natively via imageSettings.
  const LOGO_SIZE = 90;
  const LOGO_PADDING = 20; // white frame on each side → total slot 130×130
  const LOGO_SLOT = LOGO_SIZE + LOGO_PADDING * 2;
  const [logoDataUrl, setLogoDataUrl] = useState(
    '/images/logos/2025-04-24_orienteerfeed_logo_light_192x192.png'
  );

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = LOGO_SLOT;
      c.height = LOGO_SLOT;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, LOGO_SLOT, LOGO_SLOT);
      ctx.drawImage(img, LOGO_PADDING, LOGO_PADDING, LOGO_SIZE, LOGO_SIZE);
      setLogoDataUrl(c.toDataURL('image/png'));
    };
    img.src = '/images/logos/2025-04-24_orienteerfeed_logo_light_192x192.png';
  }, []);

  useEffect(() => {
    slugInputRef.current = slugInput;
  }, [slugInput]);

  useEffect(() => {
    setSavedSlug(eventSlug ?? null);
    setSlugInput(eventSlug ?? '');
    setSlugStatus(eventSlug ? 'saved' : 'idle');
  }, [eventSlug]);

  const handleSlugChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;
    slugInputRef.current = nextValue;
    setSlugInput(nextValue);
    setSlugStatus(
      savedSlug && normalizeSlugInput(nextValue) === savedSlug
        ? 'saved'
        : 'idle'
    );
  };

  const handleSlugBlur = async () => {
    const normalizedSlug = normalizeSlugInput(slugInputRef.current);
    slugInputRef.current = normalizedSlug;
    setSlugInput(normalizedSlug);

    const requestId = latestSlugRequestRef.current + 1;
    latestSlugRequestRef.current = requestId;

    const isLatestRequest = () => latestSlugRequestRef.current === requestId;

    if (!normalizedSlug) {
      if (!savedSlug) {
        setSlugStatus('idle');
        return;
      }

      setSlugStatus('saving');

      try {
        await api.patch<SlugUpdateResponse>(
          ENDPOINTS.updateEventSlug(eventId),
          {
            slug: null,
          }
        );

        if (
          !isLatestRequest() ||
          normalizeSlugInput(slugInputRef.current) !== ''
        ) {
          return;
        }

        setSavedSlug(null);
        setSlugStatus('idle');
        await onSlugUpdated?.();
      } catch {
        if (isLatestRequest()) {
          setSlugStatus('error');
        }
      }

      return;
    }

    if (
      normalizedSlug.length < slugMinLength ||
      normalizedSlug.length > slugMaxLength ||
      !slugPattern.test(normalizedSlug)
    ) {
      setSlugStatus('invalid');
      return;
    }

    if (normalizedSlug === savedSlug) {
      setSlugStatus('saved');
      return;
    }

    setSlugStatus('checking');

    try {
      const response = await api.get<SlugAvailabilityResponse>(
        ENDPOINTS.eventSlugAvailability({
          slug: normalizedSlug,
          eventId,
        }),
        { skipAuth: true }
      );

      if (
        !isLatestRequest() ||
        normalizeSlugInput(slugInputRef.current) !== normalizedSlug
      ) {
        return;
      }

      const availability = response.data;
      if (!availability?.available) {
        setSlugStatus('unavailable');
        return;
      }

      setSlugStatus('saving');

      const updateResponse = await api.patch<SlugUpdateResponse>(
        ENDPOINTS.updateEventSlug(eventId),
        {
          slug: availability.slug,
        }
      );

      if (
        !isLatestRequest() ||
        normalizeSlugInput(slugInputRef.current) !== normalizedSlug
      ) {
        return;
      }

      const nextSlug = updateResponse.data?.slug ?? availability.slug;
      slugInputRef.current = nextSlug;
      setSlugInput(nextSlug);
      setSavedSlug(nextSlug);
      setSlugStatus('saved');
      await onSlugUpdated?.();
    } catch {
      if (isLatestRequest()) {
        setSlugStatus('error');
      }
    }
  };

  const shareIdentifier = savedSlug || eventId;

  const eventUrl = new URL(
    config.PUBLIC_URL + PATHNAMES.eventDetail(shareIdentifier).url,
    config.PUBLIC_URL
  ).toString();

  const slugHelpText =
    slugStatus === 'saved'
      ? t('Pages.Event.Link.Card.Slug.Available')
      : slugStatus === 'checking'
        ? t('Pages.Event.Link.Card.Slug.Checking')
        : slugStatus === 'saving'
          ? t('Pages.Event.Link.Card.Slug.Saving')
          : slugStatus === 'invalid'
            ? t('Pages.Event.Link.Card.Slug.Invalid')
            : slugStatus === 'unavailable'
              ? t('Pages.Event.Link.Card.Slug.Unavailable')
              : slugStatus === 'error'
                ? t('Pages.Event.Link.Card.Slug.Error')
                : t('Pages.Event.Link.Card.Slug.Help');

  const isSlugPositive = slugStatus === 'saved';
  const isSlugNegative =
    slugStatus === 'invalid' ||
    slugStatus === 'unavailable' ||
    slugStatus === 'error';
  const isSlugPending = slugStatus === 'checking' || slugStatus === 'saving';

  const copyLinkToClipboard = () => {
    navigator.clipboard.writeText(eventUrl);
    toast({
      title: t('Operations.Success', { ns: 'common' }),
      description: t('Pages.Event.Link.Toast.CopySuccessDescription'),
      variant: 'default',
    });
  };

  const handleShareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: eventName,
          text: `${eventName}\n📅 ${eventDateFormatted}\n📍 ${eventLocation}`,
          url: eventUrl,
        });
      } catch (error) {
        console.error('Error sharing event link:', error);
      }
    } else {
      alert('Web Share API is not supported in your browser.');
    }
  };

  const handleShareQR = async () => {
    if (navigator.share) {
      try {
        const canvas = qrRef.current?.querySelector('canvas');

        if (!canvas) {
          console.error('QR Code not found');
          return;
        }

        const qrImageUrl = canvas.toDataURL('image/png');
        const blob = await fetch(qrImageUrl).then(res => res.blob());
        const file = new File([blob], 'ofeed-link-qr.png', {
          type: 'image/png',
        });

        await navigator.share({
          files: [file],
          title: `${t('Pages.Event.Link.Card.Navigator.Title')}: ${eventName}`,
          text: `📅 ${t('Pages.Event.Link.Card.Navigator.Event')}: ${eventName}
📍 ${t('Pages.Event.Link.Card.Navigator.Location')}: ${eventLocation}
🗓️ ${t('Pages.Event.Link.Card.Navigator.Date')}: ${eventDateFormatted}

🔗 ${t('Pages.Event.Link.Card.Navigator.EventUri')}: ${eventUrl}

${t('Pages.Event.Link.Card.Navigator.UrlDescription')}`,
        });
      } catch (error) {
        console.error('Error sharing event link:', error);
      }
    } else {
      alert('Web Share API is not supported in your browser.');
    }
  };

  const generateQRAndPrint = () => {
    setTimeout(() => {
      const canvas = qrRef.current?.querySelector('canvas');

      if (!canvas) {
        console.error('QR Code not found');
        return;
      }

      const qrImageUrl = canvas.toDataURL('image/png');

      const printWindow = window.open('', '_blank');
      if (!printWindow) return;

      printWindow.document.write(`
      <html>
        <head>
          <title>${t('Pages.Event.Link.PrintWindow.Title')}</title>
          <style>
            @media print {
              @page {
                size: A4 portrait;
                margin: 0;
              }

              body {
                margin: 0;
                padding: 0;
                font-family: 'Arial', sans-serif;
                height: 100vh;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: space-between;
                background: white;
                page-break-after: avoid;
                page-break-before: avoid;
                page-break-inside: avoid;
              }

              .print-container {
                width: 100%;
                height: 100vh;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: space-around;
                text-align: center;
                padding: 40px 20px ;
                box-sizing: border-box;
              }

              .header-section {
                margin-bottom: 20px;
              }

              .main-header {
                font-size: 72px;
                font-weight: 900;
                color: #000;
                margin: 0;
                letter-spacing: 4px;
                line-height: 1.1;
              }

              .sub-header {
                font-size: 28px;
                font-weight: 600;
                color: #333;
                margin-top: 10px;
                letter-spacing: 2px;
              }

              .qr-section {
                flex-grow: 1;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                margin: 20px 0;
              }

              .qr-container {
                padding: 30px;
                border: 4px solid #000;
                border-radius: 20px;
                background: white;
                box-shadow: 0 10px 30px rgba(0,0,0,0.1);
                max-width: 80%;
              }

              .qr-container img {
                width: 500px;
                height: 500px;
                max-width: 100%;
                height: auto;
              }

              .event-info {
                margin: 30px 0;
                font-size: 20px;
                color: #333;
                line-height: 1.6;
                max-width: 80%;
              }

              .event-info strong {
                color: #000;
                font-weight: 700;
              }

              .url-section {
                margin: 20px 0;
                padding: 20px;
                background: #f8f9fa;
                border: 2px solid #dee2e6;
                border-radius: 10px;
                font-family: 'Courier New', monospace;
                font-size: 16px;
                font-weight: 600;
                word-break: break-all;
                max-width: 80%;
              }

              /* Ensure everything stays on one page */
              .print-container, .header-section, .qr-section, .event-info, .url-section, .app-description {
                page-break-inside: avoid;
                break-inside: avoid;
              }
            }

            @media screen {
              body {
                margin: 0;
                padding: 0;
                font-family: 'Arial', sans-serif;
                height: 100vh;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: space-between;
                background: white;
              }

              .print-container {
                width: 210mm; /* A4 width */
                height: 297mm; /* A4 height */
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: space-around;
                text-align: center;
                padding: 40px 20px;
                box-sizing: border-box;
                border: 1px solid #ccc;
                margin: 20px auto;
                box-shadow: 0 0 20px rgba(0,0,0,0.1);
              }

              .header-section {
                margin-bottom: 20px;
              }

              .main-header {
                font-size: 72px;
                font-weight: 900;
                color: #000;
                margin: 0;
                letter-spacing: 4px;
                line-height: 1.1;
              }

              .sub-header {
                font-size: 28px;
                font-weight: 600;
                color: #333;
                margin-top: 10px;
                letter-spacing: 2px;
              }

              .qr-section {
                flex-grow: 1;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                margin: 20px 0;
              }

              .qr-container {
                padding: 30px;
                border: 4px solid #000;
                border-radius: 20px;
                background: white;
                box-shadow: 0 10px 30px rgba(0,0,0,0.1);
                max-width: 80%;
              }

              .qr-container img {
                width: 500px;
                height: 500px;
                max-width: 100%;
                height: auto;
              }

              .event-info {
                margin: 30px 0;
                font-size: 20px;
                color: #333;
                line-height: 1.6;
                max-width: 80%;
              }

              .event-info strong {
                color: #000;
                font-weight: 700;
              }

              .url-section {
                margin: 20px 0;
                padding: 20px;
                background: #f8f9fa;
                border: 2px solid #dee2e6;
                border-radius: 10px;
                font-family: 'Courier New', monospace;
                font-size: 16px;
                font-weight: 600;
                word-break: break-all;
                max-width: 80%;
              }
            }
          </style>
        </head>
        <body>
          <div class="print-container">
            <!-- Header Section -->
            <div class="header-section">
              <h1 class="main-header">${t('Pages.Event.Link.PrintWindow.Header')}</h1>
              <div class="sub-header">${t('Pages.Event.Link.PrintWindow.EventQR')}</div>
            </div>

            <!-- QR Code Section -->
            <div class="qr-section">
              <div class="qr-container">
                <img src="${qrImageUrl}" alt="QR Code">
              </div>
              <p>${t('Pages.Event.Link.PrintWindow.Info')}</p>
            </div>

            <!-- Event Information -->
            <div class="event-info">
              <p><strong>${t('Pages.Event.Link.Card.Navigator.Event')}:</strong> ${eventName}</p>
              <p><strong>${t('Pages.Event.Link.Card.Navigator.Location')}:</strong> ${eventLocation}</p>
              <p><strong>${t('Pages.Event.Link.Card.Navigator.Date')}:</strong> ${eventDateFormatted}</p>
            </div>

            <!-- URL Section -->
            <div class="url-section">
              ${eventUrl}
            </div>
          </div>

          <script>
            let isPrinting = false;
            let printTimeout;

            window.onload = function() {
              // Auto-print after a short delay to ensure everything is loaded
              printTimeout = setTimeout(() => {
                isPrinting = true;
                window.print();
              }, 800);
            };

            // Handle print dialog close
            window.onafterprint = function() {
              clearTimeout(printTimeout);
              if (isPrinting) {
                // Close the window after printing is done
                setTimeout(() => {
                  window.close();
                }, 300);
              }
            };

            // Handle cases where user cancels printing or closes the window
            window.onbeforeunload = function() {
              clearTimeout(printTimeout);
              if (!isPrinting) {
                // If user closes the tab without printing, close it completely
                setTimeout(() => {
                  window.close();
                }, 100);
              }
            };

            // Add keyboard listener for Escape key to close
            document.addEventListener('keydown', function(e) {
              if (e.key === 'Escape') {
                clearTimeout(printTimeout);
                window.close();
              }
            });

            // Also close if user clicks anywhere
            document.addEventListener('click', function() {
              clearTimeout(printTimeout);
              if (!isPrinting) {
                window.close();
              }
            });
          </script>
        </body>
      </html>
    `);

      printWindow.document.close();

      // Focus the window to ensure print dialog appears
      printWindow.focus();
    }, 300);
  };

  return (
    <Card className="w-full">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">
          {t('Pages.Event.Link.Card.Title')}
        </CardTitle>
        <CardDescription>
          {t('Pages.Event.Link.Card.Description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Hidden QR Code for sharing/printing */}
        <div ref={qrRef} className="hidden">
          <QRCodeCanvas
            value={eventUrl}
            size={600}
            level="H"
            imageSettings={{
              src: logoDataUrl,
              height: LOGO_SLOT,
              width: LOGO_SLOT,
              excavate: true,
            }}
          />
        </div>

        {/* Event URL Display */}
        <div className="space-y-2">
          <Label htmlFor="event-slug" className="text-sm font-medium">
            {t('Pages.Event.Link.Card.Slug.Label')}
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="event-slug"
              value={slugInput}
              onBlur={handleSlugBlur}
              onChange={handleSlugChange}
              maxLength={slugMaxLength}
              placeholder={t('Pages.Event.Link.Card.Slug.Placeholder', {
                year: new Date().getFullYear(),
              })}
              aria-invalid={isSlugNegative}
              className={cn(
                isSlugPositive &&
                  'border-green-600 focus-visible:ring-green-600',
                isSlugNegative &&
                  'border-destructive focus-visible:ring-destructive'
              )}
            />
            <div className="flex h-10 w-6 shrink-0 items-center justify-center">
              {isSlugPositive && (
                <CheckCircle2
                  className="h-5 w-5 text-green-600"
                  aria-label={t('Pages.Event.Link.Card.Slug.Available')}
                />
              )}
              {isSlugNegative && (
                <XCircle
                  className="h-5 w-5 text-destructive"
                  aria-label={slugHelpText}
                />
              )}
              {isSlugPending && (
                <Loader2
                  className="h-5 w-5 animate-spin text-muted-foreground"
                  aria-label={slugHelpText}
                />
              )}
            </div>
          </div>
          <p
            className={cn(
              'text-sm text-muted-foreground',
              isSlugPositive && 'text-green-700',
              isSlugNegative && 'text-destructive'
            )}
          >
            {slugHelpText}
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">
            {t('Pages.Event.Link.Card.Navigator.EventUri')}
          </Label>
          <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
            <p className="text-sm break-all flex-1">{eventUrl}</p>
            <Button
              onClick={copyLinkToClipboard}
              variant="outline"
              size="sm"
              className="shrink-0 h-8 w-8 p-0"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            onClick={handleShareLink}
            variant="outline"
            className="flex-1"
          >
            <Share2 className="h-4 w-4 mr-2" />
            {t('ShareLink', { ns: 'common' })}
          </Button>
          <Button onClick={handleShareQR} variant="outline" className="flex-1">
            <Send className="h-4 w-4 mr-2" />
            {t('ShareQR', { ns: 'common' })}
          </Button>
          <Button
            onClick={generateQRAndPrint}
            variant="outline"
            className="flex-1"
          >
            <Printer className="h-4 w-4 mr-2" />
            {t('Print', { ns: 'common' })}
          </Button>
        </div>

        {/* Additional Information */}
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            <strong>{t('Pages.Event.Link.Card.Navigator.Event')}:</strong>{' '}
            {eventName}
          </p>
          <p>
            <strong>{t('Pages.Event.Link.Card.Navigator.Location')}:</strong>{' '}
            {eventLocation}
          </p>
          <p>
            <strong>{t('Pages.Event.Link.Card.Navigator.Date')}:</strong>{' '}
            {eventDateFormatted}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
