import { jsPDF } from 'jspdf';
import * as QRCode from 'qrcode';
import type { BibLabel } from './qrCodeGenerator.utils';

const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const MARGIN_MM = 10;
const ROW_GAP_MM = 10;
const COLUMN_GAP_MM = 20;
const LABEL_TEXT_OFFSET_MM = 5;
const CODE_TEXT_OFFSET_MM = 9;
const TEXT_ROW_HEIGHT_MM = 11;
const CODE_FONT_SIZE = 7;
const LABEL_FONT_SIZE = 10;
const CHUNK_SIZE = 50;

interface BuildPdfOptions {
  sizeMm: number;
  labelText: (label: BibLabel) => string;
  onProgress?: (done: number, total: number) => void;
}

export async function buildBibQrCodesPdf(
  labels: BibLabel[],
  { sizeMm, labelText, onProgress }: BuildPdfOptions
): Promise<Blob> {
  const cellWidth = sizeMm + COLUMN_GAP_MM;
  const cellHeight = sizeMm + TEXT_ROW_HEIGHT_MM + ROW_GAP_MM;
  const usableWidth = PAGE_WIDTH_MM - 2 * MARGIN_MM;
  const usableHeight = PAGE_HEIGHT_MM - 2 * MARGIN_MM;
  const columns = Math.max(
    1,
    Math.floor((usableWidth + COLUMN_GAP_MM) / cellWidth)
  );
  const rows = Math.max(
    1,
    Math.floor((usableHeight + ROW_GAP_MM) / cellHeight)
  );
  const codesPerPage = columns * rows;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFontSize(LABEL_FONT_SIZE);

  for (
    let chunkStart = 0;
    chunkStart < labels.length;
    chunkStart += CHUNK_SIZE
  ) {
    const chunk = labels.slice(chunkStart, chunkStart + CHUNK_SIZE);
    const dataUrls = await Promise.all(
      chunk.map(label =>
        QRCode.toDataURL(label.code, {
          errorCorrectionLevel: 'H',
          margin: 1,
          width: 240,
        })
      )
    );

    chunk.forEach((label, indexInChunk) => {
      const dataUrl = dataUrls[indexInChunk];
      if (!dataUrl) return;

      const index = chunkStart + indexInChunk;
      const posOnPage = index % codesPerPage;
      if (index > 0 && posOnPage === 0) doc.addPage();

      const col = posOnPage % columns;
      const row = Math.floor(posOnPage / columns);
      const x = MARGIN_MM + col * cellWidth;
      const y = MARGIN_MM + row * cellHeight;

      doc.addImage(dataUrl, 'PNG', x, y, sizeMm, sizeMm);

      doc.setFontSize(LABEL_FONT_SIZE);
      doc.text(
        labelText(label),
        x + sizeMm / 2,
        y + sizeMm + LABEL_TEXT_OFFSET_MM,
        { align: 'center' }
      );

      // Printed as a fallback so bibs stay identifiable if the QR code fails to scan.
      doc.setFontSize(CODE_FONT_SIZE);
      doc.text(
        label.code,
        x + sizeMm / 2,
        y + sizeMm + CODE_TEXT_OFFSET_MM,
        { align: 'center' }
      );
    });

    onProgress?.(
      Math.min(chunkStart + CHUNK_SIZE, labels.length),
      labels.length
    );
    // Yield to the browser between chunks so the UI stays responsive.
    await new Promise(resolve => setTimeout(resolve));
  }

  return doc.output('blob');
}
