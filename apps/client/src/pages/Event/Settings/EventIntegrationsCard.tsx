import { ConnectorIcon, OChecklistIcon } from '@/assets/icons';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TFunction } from 'i18next';
import { Copy, Eye, EyeOff, Printer, Send } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import type { ComponentType, RefObject } from 'react';
import { useRef, useState } from 'react';
import { Button } from '../../../components/atoms';
import { toast } from '../../../utils';

interface EventIntegrationsCardProps {
  t: TFunction;
  eventId: string;
  eventPassword: string;
  eventName: string;
  eventDate: string;
  apiEventsEndpoint: string;
  apiBaseUrl: string;
}

interface QrTabPanelProps {
  description: string;
  shareLabel: string;
  printLabel: string;
  qrRef: RefObject<HTMLCanvasElement | null>;
  deepLink: string;
  appName: string;
  appNameLabel: string;
  icon: ComponentType<{ className?: string }>;
  onShare: (
    ref: RefObject<HTMLCanvasElement | null>,
    appName: string
  ) => Promise<void>;
  onPrint: (ref: RefObject<HTMLCanvasElement | null>, appName: string) => void;
  onOpen: (deepLink: string) => void;
  codeSize: number;
  errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H';
  qrBackgroundColor: string;
}

const panelClassName = 'rounded-lg border bg-card p-6 shadow-sm';

const QrTabPanel = ({
  description,
  shareLabel,
  printLabel,
  qrRef,
  deepLink,
  appName,
  appNameLabel,
  icon: Icon,
  onShare,
  onPrint,
  onOpen,
  codeSize,
  errorCorrectionLevel,
  qrBackgroundColor,
}: QrTabPanelProps) => (
  <div className={panelClassName}>
    <div className="space-y-2 mb-6">
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
    <div className="flex justify-center">
      <div className="p-2 rounded-xl bg-white">
        <QRCodeCanvas
          value={deepLink}
          size={codeSize}
          level={errorCorrectionLevel}
          ref={qrRef}
          bgColor={qrBackgroundColor}
          marginSize={1}
        />
      </div>
    </div>
    <div className="flex flex-col sm:flex-row gap-2 mt-6">
      <Button
        onClick={() => onShare(qrRef, appName)}
        variant="outline"
        className="flex-1"
      >
        <Send className="h-4 w-4 mr-2" />
        {shareLabel}
      </Button>
      <Button
        onClick={() => onPrint(qrRef, appNameLabel)}
        variant="outline"
        className="flex-1"
      >
        <Printer className="h-4 w-4 mr-2" />
        {printLabel}
      </Button>
      <Button
        onClick={() => onOpen(deepLink)}
        variant="outline"
        className="flex-1"
      >
        <Icon className="h-4 w-4" />
      </Button>
    </div>
  </div>
);

export const EventIntegrationsCard: React.FC<EventIntegrationsCardProps> = ({
  t,
  eventId,
  eventPassword,
  eventName,
  eventDate,
  apiEventsEndpoint,
  apiBaseUrl,
}) => {
  const qrCodeOChecklistRef = useRef<HTMLCanvasElement>(null);
  const qrCodeConnectorRef = useRef<HTMLCanvasElement>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);

  // Format the service credentials
  const ochecklistDeepLink = `https://stigning.se/ofeed?url=${encodeURIComponent(apiEventsEndpoint)}&auth=basic&id=${encodeURIComponent(eventId)}&pwd=${encodeURIComponent(eventPassword)}`;
  const connectorDeepLink = `https://stigning.se/connector?url=${encodeURIComponent(apiEventsEndpoint)}&auth=basic&id=${encodeURIComponent(eventId)}&pwd=${encodeURIComponent(eventPassword)}`;
  const codeSize = 200;
  const errorCorrectionLevel = 'L' as const;
  const qrBackgroundColor = '#ffffff';

  const handleShare = async (
    ref: React.RefObject<HTMLCanvasElement | null>,
    appName: string
  ) => {
    if (navigator.share && ref.current) {
      try {
        // Access the canvas element directly from the QRCodeCanvas component
        const canvas = ref.current;
        if (!canvas) return;

        // Create an offscreen canvas to add padding and border
        const offscreenCanvas = document.createElement('canvas');
        const ctx = offscreenCanvas.getContext('2d');
        if (!ctx) return;

        const padding = 20;
        const border = 10;
        const textHeight = 50;

        offscreenCanvas.width = canvas.width + padding * 2 + border * 2;
        offscreenCanvas.height =
          canvas.height + padding * 2 + border * 2 + textHeight;

        // Fill the background with white
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);

        // Draw the black border
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(
          padding,
          padding,
          offscreenCanvas.width - padding * 2,
          offscreenCanvas.height - padding * 2 - textHeight
        );

        // Draw the QR code
        ctx.drawImage(canvas, padding + border, padding + border);

        // Add the event name text
        ctx.fillStyle = '#000000';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';

        // Check if the event name is too long and truncate if necessary
        let truncatedEventName = eventName;
        const maxWidth = offscreenCanvas.width - padding * 2;
        if (ctx.measureText(eventName).width > maxWidth) {
          while (ctx.measureText(truncatedEventName + '...').width > maxWidth) {
            truncatedEventName = truncatedEventName.slice(0, -1);
          }
          truncatedEventName += '...';
        }

        ctx.fillText(
          truncatedEventName,
          offscreenCanvas.width / 2,
          offscreenCanvas.height - padding - 20
        );

        // Add the event date text
        ctx.fillText(
          eventDate,
          offscreenCanvas.width / 2,
          offscreenCanvas.height - padding
        );

        // Convert the offscreen canvas to base64 PNG
        const finalDataUrl = offscreenCanvas.toDataURL('image/png');
        const blob = dataURLToBlob(finalDataUrl);
        const file = new File([blob], `ofeed-${appName}-qr.png`, {
          type: 'image/png',
        });

        await navigator.share({
          files: [file],
          title: t('Pages.Event.Integration.Card.Navigator.Title'),
          text: t('Pages.Event.Integration.Card.Navigator.Text'),
        });
      } catch (error) {
        console.error('Error sharing QR code:', error);
      }
    } else {
      alert('Web Share API is not supported in your browser.');
    }
  };

  const handlePrint = (
    ref: React.RefObject<HTMLCanvasElement | null>,
    appName: string
  ) => {
    const canvas = ref.current;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL('image/png');
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Print QR Code</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                margin: 20px;
                padding: 0;
                color: #333;
                line-height: 1.6;
              }
              .container {
                text-align: center;
                margin-top: 20px;
              }
              .header {
                font-size: 24px;
                font-weight: bold;
                margin-bottom: 10px;
              }
              .subheader {
                font-size: 18px;
                margin-bottom: 20px;
                color: #555;
              }
              .qr-code {
                margin: 20px auto;
                display: block;
                width: 300px;
                height: 300px;
              }
              .details {
                margin-top: 20px;
                text-align: left;
                font-size: 16px;
                display: inline-block;
              }
              .details span {
                display: block;
                margin-bottom: 8px;
              }
              .footer {
                margin-top: 20px;
                font-size: 14px;
                color: #777;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header"><h1>${t(
                'Pages.Event.Integration.PrintWindow.Header'
              )}</h1></div>
              <div class="subheader">${t(
                'Pages.Event.Integration.PrintWindow.Subheader',
                { appName }
              )}</div>
              <img src="${dataUrl}" class="qr-code" alt="QR Code" />
              <div class="details">
                <span><strong>${t(
                  'Pages.Event.Integration.Card.EventName'
                )}:</strong> ${eventName}</span>
                <span><strong>${t(
                  'Pages.Event.Integration.Card.EventDate'
                )}:</strong> ${eventDate}</span>
                <span><strong>${t(
                  'Pages.Event.Integration.Card.ApiBaseUrl'
                )}:</strong> ${apiBaseUrl}</span>
                <span><strong>${t(
                  'Pages.Event.Integration.Card.EventId'
                )}:</strong> ${eventId}</span>
                <span><strong>${t(
                  'Pages.Event.Integration.Card.EventPassword'
                )}:</strong> ${eventPassword}</span>
              </div>
              <div class="footer">
              ${t('Pages.Event.Integration.PrintWindow.Footer')}
              </div>
            </div>
            <script>
              window.onload = function() {
                window.print();
                window.onafterprint = function() { window.close(); };
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  const handleOpenDeepLink = async (deepLink: string) => {
    if (!deepLink) return;

    if (navigator.share) {
      try {
        await navigator.share({
          title: t('Pages.Event.Integration.Card.Navigator.Title'),
          text: t('Pages.Event.Integration.Card.Navigator.Text'),
          url: deepLink,
        });
        return;
      } catch (error) {
        console.error('Error sharing deep link:', error);
      }
    }

    try {
      await navigator.clipboard.writeText(deepLink);
      toast({
        title: t('Operations.Success', { ns: 'common' }),
        description: t('Operations.CopiedToClipboard', { ns: 'common' }),
        variant: 'default',
      });
    } catch {
      window.open(deepLink, '_blank');
    }
  };

  // Utility to convert base64 data URL to Blob
  const dataURLToBlob = (dataUrl: string): Blob => {
    const arr = dataUrl.split(',');
    if (!arr[0]) {
      throw new Error('Invalid data URL format - missing header');
    }
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch || !mimeMatch[1]) {
      throw new Error('Invalid data URL format');
    }

    const mime = mimeMatch[1];
    if (!arr[1]) {
      throw new Error('Invalid data URL format - missing data');
    }
    const bstr = atob(arr[1]);
    const u8arr = new Uint8Array(bstr.length);

    for (let i = 0; i < bstr.length; i++) {
      u8arr[i] = bstr.charCodeAt(i);
    }

    return new Blob([u8arr], { type: mime });
  };

  // Toggle password visibility
  const togglePasswordVisibility = () => {
    setPasswordVisible(!passwordVisible);
  };

  const copyWithToast = (value: string, description: string) => {
    navigator.clipboard.writeText(value);
    toast({
      title: t('Operations.Success', { ns: 'common' }),
      description,
      variant: 'default',
    });
  };

  const copyPasswordToClipboard = () => {
    copyWithToast(
      eventPassword,
      t('Pages.Event.Password.Toast.CopySuccessDescription')
    );
  };

  return (
    <Card className="w-full">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">
          {t('Pages.Event.Integration.Card.Title')}
        </CardTitle>
        <CardDescription>
          {t('Pages.Event.Integration.Card.Description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-0">
        <Tabs defaultValue="ochecklist" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="ochecklist">OChecklist</TabsTrigger>
            <TabsTrigger value="quickevent">QuickEvent</TabsTrigger>
            <TabsTrigger value="connector">SI Droid Connector</TabsTrigger>
          </TabsList>

          <TabsContent value="ochecklist" className="space-y-4">
            <QrTabPanel
              description={t(
                'Pages.Event.Integration.Card.Tabs.OChecklist.Description'
              )}
              shareLabel={t('Share', { ns: 'common' })}
              printLabel={t('Print', { ns: 'common' })}
              qrRef={qrCodeOChecklistRef}
              deepLink={ochecklistDeepLink}
              appName="ochecklist"
              appNameLabel="O Checklist"
              icon={OChecklistIcon}
              onShare={handleShare}
              onPrint={handlePrint}
              onOpen={handleOpenDeepLink}
              codeSize={codeSize}
              errorCorrectionLevel={errorCorrectionLevel}
              qrBackgroundColor={qrBackgroundColor}
            />
          </TabsContent>

          <TabsContent value="quickevent" className="space-y-4">
            <div className={panelClassName}>
              <div className="space-y-2 mb-6">
                <p className="text-sm text-muted-foreground">
                  {t(
                    'Pages.Event.Integration.Card.Tabs.QuickEvent.Description'
                  )}
                </p>

                <div className="flex justify-between items-center">
                  <Label className="text-sm font-medium">
                    {t(
                      'Pages.Event.Integration.Card.Tabs.QuickEvent.ExportInterval'
                    )}
                  </Label>
                  <p className="text-sm text-muted-foreground">60 s</p>
                </div>

                <div className="flex justify-between items-center gap-2">
                  <Label className="text-sm font-medium">
                    {t('Pages.Event.Integration.Card.ApiBaseUrl')}
                  </Label>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                      {apiEventsEndpoint}
                    </p>
                    <Button
                      type="button"
                      onClick={() =>
                        copyWithToast(
                          apiEventsEndpoint,
                          t('Pages.Event.Integration.Toast.CopyBaseUrl')
                        )
                      }
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 shrink-0"
                    >
                      <Copy className="h-3 w-3" />
                      <span className="sr-only">Copy API endpoint</span>
                    </Button>
                  </div>
                </div>

                <div className="flex justify-between items-center gap-2">
                  <Label className="text-sm font-medium">
                    {t('Pages.Event.Integration.Card.EventId')}
                  </Label>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-muted-foreground">{eventId}</p>
                    <Button
                      type="button"
                      onClick={() =>
                        copyWithToast(
                          eventId,
                          t('Pages.Event.Integration.Toast.CopyEventId')
                        )
                      }
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 shrink-0"
                    >
                      <Copy className="h-3 w-3" />
                      <span className="sr-only">Copy event ID</span>
                    </Button>
                  </div>
                </div>

                <div className="flex justify-between items-center gap-2">
                  <Label className="text-sm font-medium">
                    {t('Pages.Event.Integration.Card.EventPassword')}
                  </Label>
                  <div className="flex items-center gap-2 flex-1 max-w-[250px]">
                    <div className="relative flex-1">
                      <Input
                        type={passwordVisible ? 'text' : 'password'}
                        value={eventPassword}
                        placeholder={t(
                          'Pages.Event.Password.Field.Placeholders.Name'
                        )}
                        autoCapitalize="off"
                        autoComplete="off"
                        autoCorrect="off"
                        readOnly
                        className="pr-10 h-8 text-sm"
                      />

                      {/* Visibility Toggle Button */}
                      <Button
                        type="button"
                        onClick={togglePasswordVisibility}
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                      >
                        {passwordVisible ? (
                          <EyeOff className="h-3 w-3" />
                        ) : (
                          <Eye className="h-3 w-3" />
                        )}
                        <span className="sr-only">
                          {passwordVisible ? 'Hide password' : 'Show password'}
                        </span>
                      </Button>
                    </div>

                    {/* Copy Button */}
                    <Button
                      type="button"
                      onClick={copyPasswordToClipboard}
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 shrink-0"
                    >
                      <Copy className="h-3 w-3" />
                      <span className="sr-only">
                        {t('Pages.Event.Password.Copy')}
                      </span>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="connector" className="space-y-4">
            <QrTabPanel
              description={t(
                'Pages.Event.Integration.Card.Tabs.SIDroidConenctor.Description'
              )}
              shareLabel={t('Share', { ns: 'common' })}
              printLabel={t('Print', { ns: 'common' })}
              qrRef={qrCodeConnectorRef}
              deepLink={connectorDeepLink}
              appName="si-droid-connector"
              appNameLabel="SI-Droid Connector"
              icon={ConnectorIcon}
              onShare={handleShare}
              onPrint={handlePrint}
              onOpen={handleOpenDeepLink}
              codeSize={codeSize}
              errorCorrectionLevel={errorCorrectionLevel}
              qrBackgroundColor={qrBackgroundColor}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
