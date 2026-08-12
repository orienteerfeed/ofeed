import { jsPDF } from 'jspdf';
import { textToPng } from './canvasRaster';
import {
  resolve2018Ref,
  rowSymbolRefs,
  START_SYMBOL,
  symbolToPng,
} from './iofSymbols';
import { DESCRIPTION_BOXES, type Course, type DescriptionRow } from './ppen';

export const PAPER_WIDTHS_MM = [57, 58, 80] as const;
export type PaperWidthMm = (typeof PAPER_WIDTHS_MM)[number];

/** Safety net against an accidentally huge job; roughly 20 metres of paper. */
export const MAX_PAGES = 500;

const ROW_MM = 6;
/** Event title row plus course details row. */
const HEADER_ROWS = 2;
const COLUMNS = 8;
const THICK_MM = 0.35;
const THIN_MM = 0.15;
const SYMBOL_MM = 5.4;
/** Thick vertical rules bracketing the C-E and F-H symbol groups. */
const GROUP_COLUMNS = [3, 6];
const PAGES_PER_CHUNK = 20;

/** Page height that makes the printer's knife cut exactly at the end of the table. */
export const coursePageHeightMm = (course: Course): number =>
  (HEADER_ROWS + course.rows.length) * ROW_MM;

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
  widthMm: number;
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

  const columnWidth = widthMm / COLUMNS;
  const columnX = (index: number) => columnWidth * index;
  const centreOf = (index: number, span = 1) =>
    columnX(index) + (columnWidth * span) / 2;
  const inset = THICK_MM / 2;
  const descriptionTop = HEADER_ROWS * ROW_MM;

  const firstHeight = coursePageHeightMm(firstPage);
  const doc = new jsPDF({
    unit: 'mm',
    format: [widthMm, firstHeight],
    orientation: orientationFor(widthMm, firstHeight),
    compress: true,
  });

  const drawSymbol = (key: string, centreX: number, rowTop: number) => {
    const dataUrl = symbols.get(key);
    if (!dataUrl) return;
    doc.addImage(
      dataUrl,
      'PNG',
      centreX - SYMBOL_MM / 2,
      rowTop + (ROW_MM - SYMBOL_MM) / 2,
      SYMBOL_MM,
      SYMBOL_MM,
      // The alias makes jsPDF embed each symbol once and reference it thereafter.
      `s:${key}`,
      // Canvas PNGs carry an alpha channel, so jsPDF decodes them to raw RGB; without
      // this the bitmaps go in uncompressed and a 44 course event weighs over 20 MB.
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
    const { dataUrl, alias } = textToPng(text, cellWidth, ROW_MM, options);
    doc.addImage(
      dataUrl,
      'PNG',
      centreX - cellWidth / 2,
      rowTop,
      cellWidth,
      ROW_MM,
      alias,
      'FAST'
    );
  };

  const drawDescriptionRow = (row: DescriptionRow, rowTop: number) => {
    // Finish and map issue rows are a single symbol spanning the full width.
    if (row.allBox) {
      const key = resolve2018Ref(row.allBox);
      if (key) drawSymbol(key, widthMm / 2, rowTop);
      return;
    }

    if (row.order !== null) {
      drawText(String(row.order), centreOf(0), rowTop, columnWidth, {
        bold: true,
        sizeMm: 3.6,
      });
    } else {
      drawSymbol(START_SYMBOL, centreOf(0), rowTop);
    }

    if (row.code !== null) {
      drawText(String(row.code), centreOf(1), rowTop, columnWidth, {
        sizeMm: 3.2,
      });
    }

    DESCRIPTION_BOXES.forEach((box, index) => {
      const ref = row.boxes[box];
      if (!ref) return;
      const key = resolve2018Ref(ref);
      // Unresolved references stay blank; the form warns about them by name.
      if (key) drawSymbol(key, centreOf(index + 2), rowTop);
    });
  };

  const drawHeader = (course: Course) => {
    drawText(eventTitle, widthMm / 2, 0, widthMm, { bold: true, sizeMm: 3.2 });
    drawText(course.name, centreOf(0, 3), ROW_MM, columnWidth * 3, {
      bold: true,
      sizeMm: 3.4,
    });
    drawText(
      formatLength(course.length),
      centreOf(3, 3),
      ROW_MM,
      columnWidth * 3,
      { sizeMm: 3 }
    );
    drawText(
      formatClimb(course.climb),
      centreOf(6, 2),
      ROW_MM,
      columnWidth * 2,
      {
        sizeMm: 3,
      }
    );
  };

  const drawBorders = (course: Course, heightMm: number) => {
    doc.setLineWidth(THICK_MM);
    doc.rect(inset, inset, widthMm - THICK_MM, heightMm - THICK_MM);
    // Under the event title and under the course details.
    doc.line(inset, ROW_MM, widthMm - inset, ROW_MM);
    doc.line(inset, descriptionTop, widthMm - inset, descriptionTop);
    // Course details row: name | length | climb.
    for (const column of GROUP_COLUMNS) {
      doc.line(columnX(column), ROW_MM, columnX(column), descriptionTop);
    }

    course.rows.forEach((row, index) => {
      const rowTop = descriptionTop + index * ROW_MM;
      const rowBottom = rowTop + ROW_MM;
      const isFullWidth = Boolean(row.allBox);

      // Full-width rows (finish, map issue) are one cell, so no vertical rules cross.
      if (!isFullWidth) {
        for (let column = 1; column < COLUMNS; column += 1) {
          const isGroup = GROUP_COLUMNS.includes(column);
          doc.setLineWidth(isGroup ? THICK_MM : THIN_MM);
          doc.line(columnX(column), rowTop, columnX(column), rowBottom);
        }
      }

      // A heavy rule above a full-width row and after every third control, matching the
      // reference layout, where the CSS got it from `:nth-child(3n)` offset by the two
      // header rows.
      if (isFullWidth && index > 0) {
        doc.setLineWidth(THICK_MM);
        doc.line(inset, rowTop, widthMm - inset, rowTop);
      }
      if (index < course.rows.length - 1) {
        doc.setLineWidth(isFullWidth || index % 3 === 0 ? THICK_MM : THIN_MM);
        doc.line(inset, rowBottom, widthMm - inset, rowBottom);
      }
    });
  };

  for (const [index, course] of pages.entries()) {
    const heightMm = coursePageHeightMm(course);
    if (index > 0) {
      doc.addPage([widthMm, heightMm], orientationFor(widthMm, heightMm));
    }

    drawHeader(course);
    course.rows.forEach((row, rowIndex) =>
      drawDescriptionRow(row, descriptionTop + rowIndex * ROW_MM)
    );
    drawBorders(course, heightMm);

    if ((index + 1) % PAGES_PER_CHUNK === 0) {
      onProgress?.(index + 1);
      // Yield to the browser so the progress label repaints mid-job.
      await new Promise(resolve => setTimeout(resolve));
    }
  }

  onProgress?.(pages.length);
  return doc.output('blob');
}
