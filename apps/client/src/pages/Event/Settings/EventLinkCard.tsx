import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { TFunction } from 'i18next';
import { Copy, Printer, Send } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import React, { useRef } from 'react';
import { Button } from '../../../components/atoms';
import { config } from '../../../config';
import { PATHNAMES } from '../../../lib/paths/pathnames';
import { toast } from '../../../utils';

interface EventLinkCardProps {
  t: TFunction;
  eventId: string;
  eventName: string;
  eventLocation: string;
  eventDateFormatted: string;
}

export const EventLinkCard: React.FC<EventLinkCardProps> = ({
  t,
  eventId,
  eventName,
  eventLocation,
  eventDateFormatted,
}) => {
  const qrRef = useRef<HTMLDivElement>(null);

  const eventUrl = new URL(
    config.PUBLIC_URL + PATHNAMES.eventDetail(eventId).url,
    config.PUBLIC_URL
  ).toString();

  const copyLinkToClipboard = () => {
    navigator.clipboard.writeText(eventUrl);
    toast({
      title: t('Operations.Success', { ns: 'common' }),
      description: t('Pages.Event.Link.Toast.CopySuccessDescription'),
      variant: 'default',
    });
  };

  const handleShare = async () => {
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
    // Wait for the QR Code to render, then convert it to an image
    setTimeout(() => {
      const canvas = qrRef.current?.querySelector('canvas');

      if (!canvas) {
        console.error('QR Code not found');
        return;
      }

      const qrImageUrl = canvas.toDataURL('image/png');

      // Open print window
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;

      // Generate printable HTML content - full A4 page
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
                text-transform: uppercase;
                letter-spacing: 4px;
                line-height: 1.1;
              }

              .sub-header {
                font-size: 28px;
                font-weight: 600;
                color: #333;
                margin-top: 10px;
                text-transform: uppercase;
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
                text-transform: uppercase;
                letter-spacing: 4px;
                line-height: 1.1;
              }

              .sub-header {
                font-size: 28px;
                font-weight: 600;
                color: #333;
                margin-top: 10px;
                text-transform: uppercase;
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
              <h1 class="main-header">OFEED</h1>
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
          <QRCodeCanvas value={eventUrl} size={600} level="H" />
        </div>

        {/* Event URL Display */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">
            {t('Pages.Event.Link.Card.Navigator.EventUri')}
          </Label>
          <div className="p-3 bg-muted rounded-md">
            <p className="text-sm break-all">{eventUrl}</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-2">
          <Button onClick={handleShare} variant="outline" className="flex-1">
            <Send className="h-4 w-4 mr-2" />
            {t('Share', { ns: 'common' })}
          </Button>
          <Button
            onClick={generateQRAndPrint}
            variant="outline"
            className="flex-1"
          >
            <Printer className="h-4 w-4 mr-2" />
            {t('Print', { ns: 'common' })}
          </Button>
          <Button
            onClick={copyLinkToClipboard}
            variant="outline"
            className="flex-1"
          >
            <Copy className="h-4 w-4 mr-2" />
            {t('Copy', { ns: 'common' })}
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
