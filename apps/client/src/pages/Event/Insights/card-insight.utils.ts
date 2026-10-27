import type { CardInsightCompetitor, EventCardInsight } from '@repo/shared';

export type CardInsightFilters = { search: string; classId: string };

const compareCompetitors = (
  a: CardInsightCompetitor,
  b: CardInsightCompetitor
) =>
  a.className.localeCompare(b.className) ||
  a.lastname.localeCompare(b.lastname) ||
  a.firstname.localeCompare(b.firstname) ||
  a.id - b.id;

export function filterCardInsight(
  report: EventCardInsight,
  filters: CardInsightFilters
): EventCardInsight {
  const search = filters.search.trim().toLocaleLowerCase();
  const matches = (row: CardInsightCompetitor) =>
    (!filters.classId || String(row.classId) === filters.classId) &&
    (!search ||
      `${row.firstname} ${row.lastname} ${row.firstname} ${row.registration} ${row.bibNumber ?? ''} ${row.organisation ?? ''} ${row.card ?? ''}`
        .toLocaleLowerCase()
        .includes(search));
  return {
    missingCards: report.missingCards.filter(matches).sort(compareCompetitors),
    duplicateCards: report.duplicateCards
      .filter(group => group.competitors.some(matches))
      .map(group => ({
        ...group,
        competitors: [...group.competitors].sort(compareCompetitors),
      }))
      .sort((a, b) => a.card - b.card),
  };
}

export function summarizeCardInsight(report: EventCardInsight) {
  return {
    missing: report.missingCards.length,
    duplicateNumbers: report.duplicateCards.length,
    duplicateCompetitors: report.duplicateCards.reduce(
      (sum, group) => sum + group.competitors.length,
      0
    ),
  };
}

export function cardInsightClasses(report: EventCardInsight) {
  const classes = new Map<number, string>();
  for (const row of [
    ...report.missingCards,
    ...report.duplicateCards.flatMap(group => group.competitors),
  ]) {
    classes.set(row.classId, row.className);
  }
  return [...classes].sort((a, b) => a[1].localeCompare(b[1]) || a[0] - b[0]);
}

export const escapeInsightHtml = (value: string | number) =>
  String(value).replace(
    /[&<>"']/g,
    char =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ] ?? char
  );

export function cardInsightPrintHtml(
  title: string,
  language: string,
  sections: (string | number)[][][]
) {
  const table = (rows: (string | number)[][]) =>
    `<table>${rows.map((row, index) => `<tr>${row.map(value => `<${index === 0 ? 'th' : 'td'}>${escapeInsightHtml(value)}</${index === 0 ? 'th' : 'td'}>`).join('')}</tr>`).join('')}</table>`;
  return `<!doctype html><html lang="${escapeInsightHtml(language)}"><head><meta charset="utf-8"><title>${escapeInsightHtml(title)}</title><style>@page{size:landscape;margin:12mm}body{font:12px Arial,sans-serif;color:#111}table{border-collapse:collapse;width:100%;margin:16px 0}th,td{border:1px solid #ccc;text-align:left;padding:6px;overflow-wrap:anywhere}tr{break-inside:avoid}th{background:#eee}</style></head><body><h1>${escapeInsightHtml(title)}</h1>${sections.map((rows, index) => (index === 0 ? table(rows) : `<h2>${escapeInsightHtml(rows[0]?.[0] ?? '')}</h2>${table(rows.slice(1))}`)).join('')}</body></html>`;
}
