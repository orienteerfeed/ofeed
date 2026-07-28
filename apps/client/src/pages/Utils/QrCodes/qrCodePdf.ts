import { jsPDF } from 'jspdf';
import * as QRCode from 'qrcode';
import type { BibLabel } from './qrCodeGenerator.utils';

const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const MARGIN_MM = 10;
const LABEL_GAP_MM = 4;
const TEXT_ROW_HEIGHT_MM = 6;
const CHUNK_SIZE = 50;

interface BuildPdfOptions {
  sizeMm: number;
  labelText: (label: BibLabel) => string;
  onProgress?: (done: number, total: number) => void;
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function buildBibQrCodesPdf(
  labels: BibLabel[],
  { sizeMm, labelText, onProgress }: BuildPdfOptions,
): Promise<Blob> {
  const cellWidth = sizeMm + LABEL_GAP_MM;
  const cellHeight = sizeMm + TEXT_ROW_HEIGHT_MM + LABEL_GAP_MM;
  const usableWidth = PAGE_WIDTH_MM - 2 * MARGIN_MM;
  const usableHeight = PAGE_HEIGHT_MM - 2 * MARGIN_MM;
  const columns = Math.max(
    1,
    Math.floor((usableWidth + LABEL_GAP_MM) / cellWidth),
  );
  const rows = Math.max(
    1,
    Math.floor((usableHeight + LABEL_GAP_MM) / cellHeight),
  );
  const codesPerPage = columns * rows;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFontSize(10);

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
        }),
      ),
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
      doc.text(labelText(label), x + sizeMm / 2, y + sizeMm + 4, {
        align: 'center',
      });
    });

    onProgress?.(
      Math.min(chunkStart + CHUNK_SIZE, labels.length),
      labels.length,
    );
    await wait(0);
  }

  return doc.output('blob');
}
