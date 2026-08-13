import { jsPDF } from 'jspdf';
import { textToPng } from './canvasRaster';
import {
  resolve2018Ref,
  rowSymbolRefs,
  START_SYMBOL,
  symbolToPng,
} from './iofSymbols';
import { DESCRIPTION_BOXES, type Course, type DescriptionRow } from './ppen';
import {
  A4_PAGE_HEIGHT_MM,
  A4_PAGE_MARGIN_MM,
  A4_COLUMN_SPACING_MM,
  A4_ROW_SPACING_MM,
  getColumnsPerPage,
} from './controlDescriptionLayout';

export const PAPER_WIDTHS_MM = [48] as const;
export type PaperWidthMm = (typeof PAPER_WIDTHS_MM)[number];

export const PDF_FORMATS = ['thermal', 'a4'] as const;
export type PdfFormat = (typeof PDF_FORMATS)[number];

export const BOX_SIZES_MM = [5, 5.5, 6, 6.5, 7] as const;
export type BoxSizeMm = (typeof BOX_SIZES_MM)[number];

/** Safety net against an accidentally huge job; roughly 20 metres of paper. */
export const MAX_PAGES = 500;

const HEADER_ROWS = 2;
const COLUMNS = 8;
const THICK_MM = 0.35; // IOF spec: all grid lines use 0.35mm
const SYMBOL_MM = 5.4;
/** Thick vertical rules bracketing the C-E and F-H symbol groups. */
const GROUP_COLUMNS = [3, 6];
const PAGES_PER_CHUNK = 20;

/** Page height that makes the printer's knife cut exactly at the end of the table. */
export const coursePageHeightMm = (course: Course): number =>
  (HEADER_ROWS + course.rows.length) * 6;

/**
 * jsPDF reverses an array page format when it disagrees with the orientation, which
 * would silently turn an 80x36mm page into 36x80mm. Pick the orientation that leaves the
 * format untouched.
 */
const orientationFor = (widthMm: number, heightMm: number) =>
  heightMm >= widthMm ? ('p' as const) : ('l' as const);

export interface CourseSelection {
  course: Course;
  copies: number;
}

export interface BuildPdfOptions {
  eventTitle: string;
  format: PdfFormat;
  boxSizeMm?: number;
  widthMm?: number;
  selections: CourseSelection[];
  /** Locale-aware, e.g. `4,2 km`. */
  formatLength: (km: number) => string;
  /** Locale-aware, e.g. `120 m`; empty string when the course has no climb. */
  formatClimb: (metres: number | null) => string;
  onProgress?: (done: number) => void;
}

/** Rasterises every symbol the selected courses need, once each. */
const loadSymbols = async (courses: Course[]): Promise<Map<string, string>> => {
  const keys = new Set<string>([START_SYMBOL]);
  for (const course of courses) {
    for (const row of course.rows) {
      for (const ref of rowSymbolRefs(row)) {
        const key = resolve2018Ref(ref);
        if (key) keys.add(key);
      }
    }
  }

  const entries = await Promise.all(
    [...keys].map(
      async key => [key, await symbolToPng(key, SYMBOL_MM, SYMBOL_MM)] as const
    )
  );

  return new Map(entries);
};

export async function buildControlDescriptionsPdf({
  eventTitle,
  format,
  boxSizeMm = 6,
  widthMm,
  selections,
  formatLength,
  formatClimb,
  onProgress,
}: BuildPdfOptions): Promise<Blob> {
  // One entry per printed page, so every page is drawn by the same code path.
  const pages = selections.flatMap(({ course, copies }) =>
    Array.from({ length: copies }, () => course)
  );
  const firstPage = pages[0];
  if (!firstPage) throw new Error('No courses selected');

  const symbols = await loadSymbols(pages);

  // Dynamic dimensions based on box size (IOF spec: 5-7mm, boxes must be square)
  const rowHeightMm = boxSizeMm;
  const columnWidthMm = boxSizeMm;
  const tableWidthMm = COLUMNS * columnWidthMm;

  // Use provided width for thermal, fixed width for A4 to match thermal printer aspect ratio
  const isA4 = format === 'a4';
  const effectiveWidth = isA4 ? tableWidthMm : (widthMm || PAPER_WIDTHS_MM[0]);

  const columnX = (index: number) => columnWidthMm * index;
  const centreOf = (index: number, span = 1) =>
    columnX(index) + (columnWidthMm * span) / 2;
  const inset = THICK_MM / 2;
  const descriptionTop = HEADER_ROWS * rowHeightMm;

  const pageHeight = isA4 ? 297 : (HEADER_ROWS + firstPage.rows.length) * rowHeightMm;
  const doc = new jsPDF({
    unit: 'mm',
    format: isA4 ? 'a4' : [effectiveWidth, pageHeight],
    orientation: isA4 ? 'p' : orientationFor(effectiveWidth, pageHeight),
    compress: true,
  });

  const drawSymbol = (key: string, centreX: number, rowTop: number) => {
    const dataUrl = symbols.get(key);
    if (!dataUrl) return;
    doc.addImage(
      dataUrl,
      'PNG',
      centreX - SYMBOL_MM / 2,
      rowTop + (rowHeightMm - SYMBOL_MM) / 2,
      SYMBOL_MM,
      SYMBOL_MM,
      `s:${key}`,
      'FAST'
    );
  };

  const drawText = (
    text: string,
    centreX: number,
    rowTop: number,
    cellWidth: number,
    options?: { bold?: boolean; sizeMm?: number }
  ) => {
    if (text === '') return;
    const { dataUrl, alias } = textToPng(text, cellWidth, rowHeightMm, options);
    doc.addImage(
      dataUrl,
      'PNG',
      centreX - cellWidth / 2,
      rowTop,
      cellWidth,
      rowHeightMm,
      alias,
      'FAST'
    );
  };

  const drawDescriptionRow = (row: DescriptionRow, rowTop: number) => {
    if (row.allBox) {
      const key = resolve2018Ref(row.allBox);
      if (key) drawSymbol(key, effectiveWidth / 2, rowTop);
      return;
    }

    if (row.order !== null) {
      drawText(String(row.order), centreOf(0), rowTop, columnWidthMm, {
        bold: true,
        sizeMm: 3.6,
      });
    } else {
      drawSymbol(START_SYMBOL, centreOf(0), rowTop);
    }

    if (row.code !== null) {
      drawText(String(row.code), centreOf(1), rowTop, columnWidthMm, {
        sizeMm: 3.2,
      });
    }

    DESCRIPTION_BOXES.forEach((box, index) => {
      const ref = row.boxes[box];
      if (!ref) return;
      const key = resolve2018Ref(ref);
      if (key) drawSymbol(key, centreOf(index + 2), rowTop);
    });
  };

  const drawHeader = (course: Course) => {
    drawText(eventTitle, effectiveWidth / 2, 0, effectiveWidth, {
      bold: true,
      sizeMm: 3.2,
    });
    drawText(course.name, centreOf(0, 3), rowHeightMm, columnWidthMm * 3, {
      bold: true,
      sizeMm: 3.4,
    });
    drawText(
      formatLength(course.length),
      centreOf(3, 3),
      rowHeightMm,
      columnWidthMm * 3,
      { sizeMm: 3 }
    );
    drawText(
      formatClimb(course.climb),
      centreOf(6, 2),
      rowHeightMm,
      columnWidthMm * 2,
      { sizeMm: 3 }
    );
  };

  const courseHeightMm = (course: Course): number =>
    (HEADER_ROWS + course.rows.length) * rowHeightMm;

  const drawBorders = (course: Course, heightMm: number, offsetX = 0, offsetY = 0) => {
    doc.setLineWidth(THICK_MM);
    doc.rect(offsetX + inset, offsetY + inset, effectiveWidth - THICK_MM, heightMm - THICK_MM);
    doc.line(
      offsetX + inset,
      offsetY + rowHeightMm,
      offsetX + effectiveWidth - inset,
      offsetY + rowHeightMm
    );
    doc.line(
      offsetX + inset,
      offsetY + descriptionTop,
      offsetX + effectiveWidth - inset,
      offsetY + descriptionTop
    );
    for (const column of GROUP_COLUMNS) {
      doc.line(
        offsetX + columnX(column),
        offsetY + rowHeightMm,
        offsetX + columnX(column),
        offsetY + descriptionTop
      );
    }

    course.rows.forEach((row, index) => {
      const rowTop = offsetY + descriptionTop + index * rowHeightMm;
      const rowBottom = rowTop + rowHeightMm;
      const isFullWidth = Boolean(row.allBox);

      if (!isFullWidth) {
        for (let column = 1; column < COLUMNS; column += 1) {
          doc.setLineWidth(THICK_MM);
          doc.line(offsetX + columnX(column), rowTop, offsetX + columnX(column), rowBottom);
        }
      }

      if (isFullWidth && index > 0) {
        doc.setLineWidth(THICK_MM);
        doc.line(offsetX + inset, rowTop, offsetX + effectiveWidth - inset, rowTop);
      }
      if (index < course.rows.length - 1) {
        doc.setLineWidth(THICK_MM);
        doc.line(offsetX + inset, rowBottom, offsetX + effectiveWidth - inset, rowBottom);
      }
    });
  };

  if (isA4) {
    // A4: multi-column layout to optimize paper usage
    const columnsPerPage = getColumnsPerPage(effectiveWidth);

    let columnIndex = 0;
    let rowYPositions: number[] = [];
    let currentRowY = A4_PAGE_MARGIN_MM;

    for (const [courseIndex, course] of pages.entries()) {
      const cHeight = courseHeightMm(course);

      // Initialize row if needed
      if (columnIndex === 0) {
        rowYPositions = [];
      }

      // Check if we need a new page (before calculating position)
      if (currentRowY + cHeight > A4_PAGE_HEIGHT_MM - A4_PAGE_MARGIN_MM) {
        // If starting a new row would exceed page, move to next page
        if (columnIndex === 0) {
          doc.addPage('a4', 'p');
          currentRowY = A4_PAGE_MARGIN_MM;
        } else {
          // Mid-row, finish current row and move to next page
          columnIndex = 0;
          doc.addPage('a4', 'p');
          currentRowY = A4_PAGE_MARGIN_MM;
          rowYPositions = [];
        }
      }

      // Calculate left offset for current column
      const leftOffset = A4_PAGE_MARGIN_MM + columnIndex * (effectiveWidth + A4_COLUMN_SPACING_MM);
      const topOffset = currentRowY;

      if (courseIndex === 0) {
        doc.setPage(1);
      }

      // Draw header (event title, course name, length, climb)
      drawText(eventTitle, leftOffset + effectiveWidth / 2, topOffset, effectiveWidth, {
        bold: true,
        sizeMm: 3.2,
      });

      drawText(course.name, leftOffset + centreOf(0, 3), topOffset + rowHeightMm, columnWidthMm * 3, {
        bold: true,
        sizeMm: 3.4,
      });
      drawText(
        formatLength(course.length),
        leftOffset + centreOf(3, 3),
        topOffset + rowHeightMm,
        columnWidthMm * 3,
        { sizeMm: 3 }
      );
      drawText(
        formatClimb(course.climb),
        leftOffset + centreOf(6, 2),
        topOffset + rowHeightMm,
        columnWidthMm * 2,
        { sizeMm: 3 }
      );

      // Draw control rows
      course.rows.forEach((row, rowIdx) => {
        if (row.allBox) {
          const key = resolve2018Ref(row.allBox);
          if (key) drawSymbol(key, leftOffset + effectiveWidth / 2, topOffset + descriptionTop + rowIdx * rowHeightMm);
          return;
        }

        if (row.order !== null) {
          drawText(String(row.order), leftOffset + centreOf(0), topOffset + descriptionTop + rowIdx * rowHeightMm, columnWidthMm, {
            bold: true,
            sizeMm: 3.6,
          });
        } else {
          drawSymbol(START_SYMBOL, leftOffset + centreOf(0), topOffset + descriptionTop + rowIdx * rowHeightMm);
        }

        if (row.code !== null) {
          drawText(String(row.code), leftOffset + centreOf(1), topOffset + descriptionTop + rowIdx * rowHeightMm, columnWidthMm, {
            sizeMm: 3.2,
          });
        }

        DESCRIPTION_BOXES.forEach((box, boxIdx) => {
          const ref = row.boxes[box];
          if (!ref) return;
          const key = resolve2018Ref(ref);
          if (key) drawSymbol(key, leftOffset + centreOf(boxIdx + 2), topOffset + descriptionTop + rowIdx * rowHeightMm);
        });
      });

      // Draw borders
      drawBorders(course, cHeight, leftOffset, topOffset);

      // Track row height for each column
      rowYPositions[columnIndex] = topOffset + cHeight;

      // Move to next column
      columnIndex += 1;
      if (columnIndex >= columnsPerPage) {
        // Move to next row - use max height of current row
        currentRowY = Math.max(...rowYPositions) + A4_ROW_SPACING_MM;
        columnIndex = 0;
      }

      if ((courseIndex + 1) % PAGES_PER_CHUNK === 0) {
        onProgress?.(courseIndex + 1);
        await new Promise(resolve => setTimeout(resolve));
      }
    }
  } else {
    // Thermal printer mode: one course per page
    for (const [index, course] of pages.entries()) {
      const heightMm = courseHeightMm(course);
      if (index > 0) {
        doc.addPage([effectiveWidth, heightMm], orientationFor(effectiveWidth, heightMm));
      }

      drawHeader(course);
      course.rows.forEach((row, rowIndex) =>
        drawDescriptionRow(row, descriptionTop + rowIndex * rowHeightMm)
      );
      drawBorders(course, heightMm, 0, 0);

      if ((index + 1) % PAGES_PER_CHUNK === 0) {
        onProgress?.(index + 1);
        await new Promise(resolve => setTimeout(resolve));
      }
    }
  }

  onProgress?.(pages.length);
  return doc.output('blob');
}
