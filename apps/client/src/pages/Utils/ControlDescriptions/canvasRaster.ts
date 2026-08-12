/**
 * Canvas rasterisation helpers for the control description PDF.
 *
 * ponytail: text is drawn to a canvas and embedded as an image rather than as PDF text,
 * because jsPDF's built-in fonts are cp1252-encoded and cannot render `ř ě č ť ů ď ň`
 * (so Czech course and event names come out as garbage). This keeps a single code path
 * for text and symbols and needs no embedded font, at the cost of text that is not
 * selectable or searchable. Embed a subset TTF via `addFileToVFS`/`addFont` if that ever
 * matters.
 */

/** Raster density, ~508 dpi: 2.5x a 203 dpi thermal print head. */
export const PX_PER_MM = 20;

const mmToPx = (mm: number) => Math.max(1, Math.round(mm * PX_PER_MM));

export interface RasterImage {
  dataUrl: string;
  /** Stable identity, so jsPDF embeds each distinct image only once. */
  alias: string;
}

const textCache = new Map<string, RasterImage>();

const createContext = (widthPx: number, heightPx: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = widthPx;
  canvas.height = heightPx;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable');

  context.fillStyle = '#fff';
  context.fillRect(0, 0, widthPx, heightPx);

  return { canvas, context };
};

export interface TextOptions {
  bold?: boolean;
  /** Font size in millimetres. */
  sizeMm?: number;
}

/**
 * Renders text centred in a cell of the given size, shrinking it to fit when too wide.
 * Results are cached, so repeated values (control codes, course names) cost one draw.
 */
export const textToPng = (
  text: string,
  widthMm: number,
  heightMm: number,
  { bold = false, sizeMm = 3 }: TextOptions = {}
): RasterImage => {
  const key = `t:${text}|${widthMm}|${heightMm}|${bold}|${sizeMm}`;
  const cached = textCache.get(key);
  if (cached) return cached;

  const widthPx = mmToPx(widthMm);
  const heightPx = mmToPx(heightMm);
  const { canvas, context } = createContext(widthPx, heightPx);

  const weight = bold ? 'bold ' : '';
  const family = 'Arial, Helvetica, sans-serif';
  const paddingPx = mmToPx(0.4);
  let fontPx = sizeMm * PX_PER_MM;

  context.font = `${weight}${fontPx}px ${family}`;
  const naturalWidth = context.measureText(text).width;
  const available = widthPx - 2 * paddingPx;
  if (naturalWidth > available) {
    fontPx *= available / naturalWidth;
    context.font = `${weight}${fontPx}px ${family}`;
  }

  context.fillStyle = '#000';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, widthPx / 2, heightPx / 2);

  const image: RasterImage = {
    dataUrl: canvas.toDataURL('image/png'),
    alias: key,
  };
  textCache.set(key, image);
  return image;
};

/** Rasterises an SVG asset URL to a PNG data URL of the given size. */
export const svgUrlToPng = async (
  url: string,
  widthMm: number,
  heightMm: number
): Promise<string> => {
  const image = new Image();
  image.src = url;
  await image.decode();

  const widthPx = mmToPx(widthMm);
  const heightPx = mmToPx(heightMm);
  const { canvas, context } = createContext(widthPx, heightPx);
  context.drawImage(image, 0, 0, widthPx, heightPx);

  return canvas.toDataURL('image/png');
};
