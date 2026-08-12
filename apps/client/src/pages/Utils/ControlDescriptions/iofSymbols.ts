import { svgUrlToPng } from './canvasRaster';
import { DESCRIPTION_BOXES, type Course, type DescriptionRow } from './ppen';

/**
 * Lookup for the bundled IOF 2018 control description symbols.
 *
 * `?url` keeps the 180 SVGs as separate hashed assets, so they cost nothing in the
 * bundle and only the handful a given event uses is ever fetched.
 */
export const SYMBOL_URLS: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob('@/assets/iof-symbols/*.svg', {
      query: '?url',
      import: 'default',
      eager: true,
    }) as Record<string, string>
  ).map(([path, url]) => [symbolKeyFromPath(path), url])
);

/**
 * The filename's first space-delimited token is the symbol reference:
 * `0.1E Eastern.svg` -> `0.1E`, `Start.svg` -> `Start`.
 *
 * The Python original instead pulled the number out with `/(\d+(\.\d+)?)/`, which drops
 * the direction letter, collapsing `0.1E`/`0.1N`/`0.1S`/`0.1W` onto one key so column C
 * printed an arbitrary direction.
 */
function symbolKeyFromPath(path: string): string {
  const fileName = path.split('/').pop() ?? path;
  return fileName.replace(/\.svg$/, '').split(' ')[0]!;
}

/** Start triangle, drawn in the sequence column of a start row. */
export const START_SYMBOL = 'Start';

/**
 * Purple Pen stores IOF **2004** symbol references (attribute `iof-2004-ref`) even when
 * the file declares `description="2018"`. Columns C to F are numbered identically in
 * both standards, so those references match the 2018 filenames directly; column G (2004
 * `11.x`) and column H (2004 `12.x`-`14.x`) were renumbered and need this table.
 *
 * Every entry below was verified by matching the reference PNG set: the hand-added
 * `11.x kopie.png` files in the upstream `png-white-background` directory are
 * md5-identical to the 2018 images named here.
 *
 * Consulted before an exact filename match, because the two standards reuse the same
 * strings for different symbols — 2004 `14.1` is a finish symbol while 2018 `14.1` is
 * "Timed start to start triangle", and an exact match would print the wrong one.
 *
 * ponytail: 2004 `11.3`, `11.5`, `11.7`, `11.9`, `11.10`, `11.12` and the `13.x`
 * taped-route group are deliberately missing — their 2018 targets could not be verified,
 * and a wrong column G symbol sends runners to the wrong side of a feature. They resolve
 * to null and are reported as warnings instead. Add a row here once confirmed against
 * Purple Pen.
 */
export const IOF_2004_TO_2018: Record<string, string> = {
  // Column G - location of the control flag
  '11.1': '12.1', // side (directional)
  '11.2': '12.2', // edge (directional)
  '11.4': '12.4', // corner, inside (directional)
  '11.6': '12.6', // tip (directional)
  '11.8': '12.7', // end (directional)
  '11.11': '12.10', // top
  '11.13': '12.11', // foot
  '11.14': '12.12', // foot (directional)
  '11.15': '12.14', // between
  // Column H - other information
  '12.1': '13.1', // first aid post
  '12.2': '13.2', // refreshment point
  '12.3': '13.3', // control check
  // Column H - finish and route to the finish
  '14.1': '16.1', // taped route to finish
  '14.2': '16.2', // navigate to finish funnel
  '14.3': '16.3', // navigate to finish, no tapes
};

const DIRECTIONAL_REF = /^(\d+\.\d+)([NSEW]{1,2})?$/;

const hasSymbol = (key: string) => key in SYMBOL_URLS;

/**
 * Resolves an IOF 2004 reference from a `.ppen` file to a bundled 2018 symbol key, or
 * null when it cannot be mapped with confidence. Never falls back to an approximate
 * symbol: an unmapped reference is reported to the user instead.
 */
export const resolve2018Ref = (ref: string): string | null => {
  const match = ref.match(DIRECTIONAL_REF);
  const mapped = match ? IOF_2004_TO_2018[match[1]!] : undefined;

  if (mapped) {
    const suffix = match?.[2] ?? '';
    const target = mapped + suffix;
    // A renumbered group whose target is absent stays unresolved rather than dropping
    // the direction and printing, say, "Bend" where "north side" was meant.
    return hasSymbol(target) ? target : null;
  }

  return hasSymbol(ref) ? ref : null;
};

/** Every symbol reference a row draws, in column order. */
export const rowSymbolRefs = (row: DescriptionRow): string[] =>
  row.allBox
    ? [row.allBox]
    : DESCRIPTION_BOXES.map(box => row.boxes[box]).filter(
        (ref): ref is string => Boolean(ref)
      );

export interface UnmappedSymbol {
  ref: string;
  /** How many cells across all given courses are affected. */
  count: number;
}

/**
 * Reports references that cannot be mapped to a bundled symbol, so the organiser sees
 * which cells will print blank before they use the PDF at an event.
 */
export const collectUnmappedSymbols = (courses: Course[]): UnmappedSymbol[] => {
  const unmapped = new Map<string, UnmappedSymbol>();

  for (const course of courses) {
    for (const row of course.rows) {
      for (const ref of rowSymbolRefs(row)) {
        if (resolve2018Ref(ref)) continue;

        const existing = unmapped.get(ref);
        if (existing) existing.count += 1;
        else unmapped.set(ref, { ref, count: 1 });
      }
    }
  }

  return [...unmapped.values()];
};

const pngCache = new Map<string, Promise<string>>();

/** Rasterises a symbol to a PNG data URL, once per symbol and size. */
export const symbolToPng = (
  key: string,
  widthMm: number,
  heightMm: number
): Promise<string> => {
  const cacheKey = `${key}|${widthMm}|${heightMm}`;
  const cached = pngCache.get(cacheKey);
  if (cached) return cached;

  const url = SYMBOL_URLS[key];
  if (!url) return Promise.reject(new Error(`Unknown IOF symbol: ${key}`));

  const png = svgUrlToPng(url, widthMm, heightMm);
  pngCache.set(cacheKey, png);
  return png;
};
