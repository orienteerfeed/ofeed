// A4 layout constants for multi-column control description sheets
export const A4_PAGE_WIDTH_MM = 210;
export const A4_PAGE_HEIGHT_MM = 297;
export const A4_PAGE_MARGIN_MM = 10;
export const A4_COLUMN_SPACING_MM = 8;
export const A4_ROW_SPACING_MM = 8;

export const getColumnsPerPage = (tableWidthMm: number): number =>
  Math.floor(
    (A4_PAGE_WIDTH_MM - A4_PAGE_MARGIN_MM * 2 + A4_COLUMN_SPACING_MM) /
      (tableWidthMm + A4_COLUMN_SPACING_MM)
  );
