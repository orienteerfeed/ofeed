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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@radix-ui/react-tabs';
import { TFunction } from 'i18next';
import { Copy, Eye, EyeOff, Printer, Send } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { useRef, useState } from 'react';
import { Button } from '../../../components/atoms';
import { toast } from '../../../utils';

interface QrCodeCredentialsCardProps {
  t: TFunction;
  eventId: string;
  eventPassword: string;
  eventName: string;
  eventDate: string;
  apiEventsEndpoint: string;
  apiBaseUrl: string;
}

export const QrCodeCredentialsCard: React.FC<QrCodeCredentialsCardProps> = ({
  t,
  eventId,
  eventPassword,
  eventName,
  eventDate,
  apiEventsEndpoint,
  apiBaseUrl,
}) => {
  const qrCodeRef = useRef<HTMLCanvasElement>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);

  // Format the service credentials
  const ochecklistDeepLink = `https://stigning.se/ofeed?url=${encodeURIComponent(apiEventsEndpoint)}&auth=basic&id=${encodeURIComponent(eventId)}&pwd=${encodeURIComponent(eventPassword)}`;
  const connectorDeepLink = `https://stigning.se/ofeed_connector?url=${encodeURIComponent(apiEventsEndpoint)}&auth=basic&id=${encodeURIComponent(eventId)}&pwd=${encodeURIComponent(eventPassword)}`;
  const codeSize = 200;
  const errorCorrectionLevel = 'L' as const;
  const qrBackgroundColor = '#ffffff';

  const handleShare = async () => {
    if (navigator.share && qrCodeRef.current) {
      try {
        // Access the canvas element directly from the QRCodeCanvas component
        const canvas = qrCodeRef.current;
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
        const file = new File([blob], 'ofeed-ochecklist-qr.png', {
          type: 'image/png',
        });

        await navigator.share({
          files: [file],
          title: t('Pages.Event.QrCode.Card.Navigator.Title'),
          text: t('Pages.Event.QrCode.Card.Navigator.Text'),
        });
      } catch (error) {
        console.error('Error sharing QR code:', error);
      }
    } else {
      alert('Web Share API is not supported in your browser.');
    }
  };

  const handlePrint = () => {
    const canvas = qrCodeRef.current;
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
                'Pages.Event.QrCode.PrintWindow.Header'
              )}</h1></div>
              <div class="subheader">${t(
                'Pages.Event.QrCode.PrintWindow.Subheader'
              )}</div>
              <img src="${dataUrl}" class="qr-code" alt="QR Code" />
              <div class="details">
                <span><strong>${t(
                  'Pages.Event.QrCode.Card.EventName'
                )}:</strong> ${eventName}</span>
                <span><strong>${t(
                  'Pages.Event.QrCode.Card.EventDate'
                )}:</strong> ${eventDate}</span>
                <span><strong>${t(
                  'Pages.Event.QrCode.Card.ApiBaseUrl'
                )}:</strong> ${apiBaseUrl}</span>
                <span><strong>${t(
                  'Pages.Event.QrCode.Card.EventId'
                )}:</strong> ${eventId}</span>
                <span><strong>${t(
                  'Pages.Event.QrCode.Card.EventPassword'
                )}:</strong> ${eventPassword}</span>
              </div>
              <div class="footer">
              ${t('Pages.Event.QrCode.PrintWindow.Footer')}
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
          title: t('Pages.Event.QrCode.Card.Navigator.Title'),
          text: t('Pages.Event.QrCode.Card.Navigator.Text'),
          url: deepLink,
        });
        return;
      } catch (error) {
        console.error('Error sharing deep link:', error);
      }
    }

    try {
      await navigator.clipboard.writeText(deepLink);
      alert(t('Operations.CopiedToClipboard', { ns: 'common' }));
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

  const copyToClipboard = () => {
    navigator.clipboard.writeText(eventPassword);
    toast({
      title: t('Operations.Success', { ns: 'common' }),
      description: t('Pages.Event.Password.Toast.CopySuccessDescription'),
      variant: 'default',
    });
  };

  return (
    <Card className="w-full">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">
          {t('Pages.Event.QrCode.Card.Title')}
        </CardTitle>
        <CardDescription>
          {t('Pages.Event.QrCode.Card.Description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-0">
        <Tabs defaultValue="ochecklist" className="w-full">
          <TabsList className="grid w-full grid-cols-4 gap-2 bg-transparent p-0 h-auto mb-0">
            <TabsTrigger
              value="ochecklist"
              className="rounded-t-lg border-x-2 border-t-2 border-b-0 border-transparent px-4 py-3 text-sm font-medium transition-all data-[state=active]:border-border data-[state=active]:border-b-background data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=inactive]:bg-muted/30 data-[state=inactive]:text-muted-foreground hover:data-[state=inactive]:bg-muted/50 relative data-[state=active]:z-10"
            >
              OChecklist
            </TabsTrigger>
            <TabsTrigger
              value="quickevent"
              className="rounded-t-lg border-x-2 border-t-2 border-b-0 border-transparent px-4 py-3 text-sm font-medium transition-all data-[state=active]:border-border data-[state=active]:border-b-background data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=inactive]:bg-muted/30 data-[state=inactive]:text-muted-foreground hover:data-[state=inactive]:bg-muted/50 relative data-[state=active]:z-10"
            >
              QuickEvent
            </TabsTrigger>
            <TabsTrigger
              value="connector"
              className="rounded-t-lg border-x-2 border-t-2 border-b-0 border-transparent px-4 py-3 text-sm font-medium transition-all data-[state=active]:border-border data-[state=active]:border-b-background data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=inactive]:bg-muted/30 data-[state=inactive]:text-muted-foreground hover:data-[state=inactive]:bg-muted/50 relative data-[state=active]:z-10"
            >
              SI Droid Connector
            </TabsTrigger>
            {/* <TabsTrigger
              value="meos"
              className="rounded-t-lg border-x-2 border-t-2 border-b-0 border-transparent px-4 py-3 text-sm font-medium transition-all data-[state=active]:border-border data-[state=active]:border-b-background data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=inactive]:bg-muted/30 data-[state=inactive]:text-muted-foreground hover:data-[state=inactive]:bg-muted/50 relative data-[state=active]:z-10"
            >
              MeOS
            </TabsTrigger> */}
          </TabsList>

          {/* Content container - negative margin to overlap with tab */}
          <div
            className="border-2 border-border rounded-b-lg bg-background -mt-[2px]"
            style={{ borderTopLeftRadius: 0 }}
          >
            <TabsContent value="ochecklist" className="m-0 p-6 space-y-4">
              <div className="space-y-2 mb-6">
                <p className="text-sm text-muted-foreground">
                  {t('Pages.Event.QrCode.Card.Tabs.OChecklist.Description')}
                </p>
              </div>
              <div className="flex justify-center">
                <div className="p-2 rounded-xl bg-white">
                  <QRCodeCanvas
                    value={ochecklistDeepLink}
                    size={codeSize}
                    level={errorCorrectionLevel}
                    ref={qrCodeRef}
                    bgColor={qrBackgroundColor}
                    marginSize={1}
                  />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  onClick={handleShare}
                  variant="outline"
                  className="flex-1"
                >
                  <Send className="h-4 w-4 mr-2" />
                  {t('Share', { ns: 'common' })}
                </Button>
                <Button
                  onClick={handlePrint}
                  variant="outline"
                  className="flex-1"
                >
                  <Printer className="h-4 w-4 mr-2" />
                  {t('Print', { ns: 'common' })}
                </Button>
                <Button
                  onClick={() => handleOpenDeepLink(ochecklistDeepLink)}
                  variant="outline"
                  className="flex-1"
                >
                  <OChecklistIcon className="h-4 w-4" />
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="quickevent" className="m-0 p-6 space-y-4">
              <div className="space-y-2 mb-6">
                <p className="text-sm text-muted-foreground">
                  {t('Pages.Event.QrCode.Card.Tabs.QuickEvent.Description')}
                </p>

                <div className="flex justify-between items-center">
                  <Label className="text-sm font-medium">
                    {t(
                      'Pages.Event.QrCode.Card.Tabs.QuickEvent.ExportInterval'
                    )}
                  </Label>
                  <p className="text-sm text-muted-foreground">60 s</p>
                </div>

                <div className="flex justify-between items-center gap-2">
                  <Label className="text-sm font-medium">
                    {t('Pages.Event.QrCode.Card.ApiBaseUrl')}
                  </Label>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                      {apiEventsEndpoint}
                    </p>
                    <Button
                      type="button"
                      onClick={() =>
                        navigator.clipboard.writeText(apiEventsEndpoint)
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
                    {t('Pages.Event.QrCode.Card.EventId')}
                  </Label>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-muted-foreground">{eventId}</p>
                    <Button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(eventId)}
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
                    {t('Pages.Event.QrCode.Card.EventPassword')}
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
                      onClick={copyToClipboard}
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
            </TabsContent>

            <TabsContent value="connector" className="m-0 p-6 space-y-4">
              <div className="space-y-2 mb-6">
                <p className="text-sm text-muted-foreground">
                  {t(
                    'Pages.Event.QrCode.Card.Tabs.SIDroidConenctor.Description'
                  )}
                </p>
              </div>
              <div className="flex justify-center">
                <div className="p-2 rounded-xl bg-white">
                  <QRCodeCanvas
                    value={connectorDeepLink}
                    size={codeSize}
                    level={errorCorrectionLevel}
                    bgColor={qrBackgroundColor}
                    marginSize={1}
                  />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  onClick={handleShare}
                  variant="outline"
                  className="flex-1"
                >
                  <Send className="h-4 w-4 mr-2" />
                  {t('Share', { ns: 'common' })}
                </Button>
                <Button
                  onClick={handlePrint}
                  variant="outline"
                  className="flex-1"
                >
                  <Printer className="h-4 w-4 mr-2" />
                  {t('Print', { ns: 'common' })}
                </Button>
                <Button
                  onClick={() => handleOpenDeepLink(connectorDeepLink)}
                  variant="outline"
                  className="flex-1"
                >
                  <ConnectorIcon className="h-4 w-4" />
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="meos" className="m-0 p-6 space-y-4">
              <div className="flex justify-center">
                <div className="p-2 rounded-xl bg-white">
                  <QRCodeCanvas
                    value={connectorDeepLink}
                    size={codeSize}
                    level={errorCorrectionLevel}
                    bgColor={qrBackgroundColor}
                    marginSize={1}
                  />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  onClick={handleShare}
                  variant="outline"
                  className="flex-1"
                >
                  <Send className="h-4 w-4 mr-2" />
                  {t('Share', { ns: 'common' })}
                </Button>
                <Button
                  onClick={handlePrint}
                  variant="outline"
                  className="flex-1"
                >
                  <Printer className="h-4 w-4 mr-2" />
                  {t('Print', { ns: 'common' })}
                </Button>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
};
