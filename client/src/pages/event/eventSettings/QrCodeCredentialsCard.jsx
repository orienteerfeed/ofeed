import React, { useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { AiOutlinePrinter } from 'react-icons/ai';
import { LuSend } from 'react-icons/lu';
import { Button } from '../../../atoms';
import { Card } from '../../../organisms';
import { EventPasswordForm } from '..';

export const QrCodeCredentialsCard = ({
  t,
  eventId,
  eventPassword,
  eventName,
  eventDate,
  apiEventsEndpoint,
  apiBaseUrl,
}) => {
  const qrCodeRef = useRef(null); // Reference to the QR code canvas
  // Format the service credentials
  const serviceCredentials = `https://stigning.se/ofeed?url=${encodeURIComponent(apiEventsEndpoint)}&auth=basic&id=${eventId}&pwd=${eventPassword}`;
  const codeSize = 200; // Set the size you want for the QR code
  const errorCorrectionLevel = 'L'; // Set the desired error correction level - values L, M, Q, H,

  // Low (L): Least dense, but the QR code is more space-efficient. Best used when you have minimal space and the code is unlikely to be damaged.
  // Medium (M): A balance between size and error correction. This is a good option for most use cases.
  // Quartile (Q): A higher density with more error correction, useful in environments where the QR code may get partially obscured or damaged.
  // High (H): Most error correction, but the code will be larger and denser.

  const handleShare = async () => {
    if (navigator.share) {
      try {
        const canvas = qrCodeRef.current; // Get the QR code canvas element

        // Create an offscreen canvas to add padding and border
        const offscreenCanvas = document.createElement('canvas');
        const ctx = offscreenCanvas.getContext('2d');
        const padding = 20;
        const border = 10;
        const textHeight = 50; // Increased to accommodate both event name and date

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
          offscreenCanvas.height - padding * 2 - textHeight,
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
          offscreenCanvas.height - padding - 20, // Adjusted to leave space for the date
        );

        // Add the event date text
        ctx.fillText(
          eventDate,
          offscreenCanvas.width / 2,
          offscreenCanvas.height - padding,
        );

        // Convert the offscreen canvas to base64 PNG
        const finalDataUrl = offscreenCanvas.toDataURL('image/png');
        const blob = dataURLToBlob(finalDataUrl); // Convert base64 to a Blob
        const file = new File([blob], 'ofeed-ochecklist-qr.png', {
          type: 'image/png',
        });

        await navigator.share({
          files: [file], // Share the QR code image
          title: t('Pages.Event.QrCode.Card.Navigator.Title'),
          text: t('Pages.Event.QrCode.Card.Navigator.Text'),
        });
        console.log('QR code shared successfully!');
      } catch (error) {
        console.error('Error sharing QR code:', error);
      }
    } else {
      alert('Web Share API is not supported in your browser.');
    }
  };

  const handlePrint = () => {
    const canvas = qrCodeRef.current; // Get the QR code canvas element
    const dataUrl = canvas.toDataURL('image/png'); // Convert canvas to a base64 image
    const printWindow = window.open('', '_blank'); // Open a new window
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
                'Pages.Event.QrCode.PrintWindow.Header',
              )}</h1></div>
              <div class="subheader">${t(
                'Pages.Event.QrCode.PrintWindow.Subheader',
              )}</div>
              <img src="${dataUrl}" class="qr-code" alt="QR Code" />
              <div class="details">
                <span><strong>${t(
                  'Pages.Event.QrCode.Card.EventName',
                )}:</strong> ${eventName}</span>
                <span><strong>${t(
                  'Pages.Event.QrCode.Card.EventDate',
                )}:</strong> ${eventDate}</span>
                <span><strong>${t(
                  'Pages.Event.QrCode.Card.ApiBaseUrl',
                )}:</strong> ${apiBaseUrl}</span>
                <span><strong>${t(
                  'Pages.Event.QrCode.Card.EventId',
                )}:</strong> ${eventId}</span>
                <span><strong>${t(
                  'Pages.Event.QrCode.Card.EventPassword',
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

  // Utility to convert base64 data URL to Blob
  const dataURLToBlob = (dataUrl) => {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  };

  return (
    <Card
      title={t('Pages.Event.QrCode.Card.Title')}
      description={t('Pages.Event.QrCode.Card.Description')}
    >
      <div className="flex flex-col gap-4 justify-between">
        <p>
          <strong>{t('Pages.Event.QrCode.Card.EventId')}: </strong>
          {eventId}
        </p>
        <div className="flex justify-center">
          <QRCodeCanvas
            value={serviceCredentials}
            size={codeSize}
            level={errorCorrectionLevel}
            ref={qrCodeRef} // Reference the QR code canvas
          />
        </div>
        <div className="flex items-end gap-2 mt-4">
          <Button
            onClick={handleShare}
            title={t('Pages.Event.QrCode.Card.ShareQrCode')}
          >
            {t('Share', { ns: 'common' })}
            <span className="ml-2">
              <LuSend />
            </span>
          </Button>
          <Button
            onClick={handlePrint}
            title={t('Pages.Event.QrCode.Card.PrintQrCode')}
          >
            {t('Print', { ns: 'common' })}
            <span className="ml-2">
              <AiOutlinePrinter />
            </span>
          </Button>
        </div>
      </div>
    </Card>
  );
};
