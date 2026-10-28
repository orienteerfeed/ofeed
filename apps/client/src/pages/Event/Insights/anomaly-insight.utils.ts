import { anomalyTypes, type EventAnomalyInsight } from '@repo/shared';

export type AnomalyFilters = { search: string; classId: string; type: string };
export function filterAnomalyInsight(
  report: EventAnomalyInsight,
  filters: AnomalyFilters
) {
  const search = filters.search.trim().toLocaleLowerCase();
  return report.competitors
    .filter(
      row =>
        (!filters.classId || String(row.classId) === filters.classId) &&
        (!filters.type ||
          row.findings.some(finding => finding.type === filters.type)) &&
        (!search ||
          `${row.firstname} ${row.lastname} ${row.firstname} ${row.registration} ${row.bibNumber ?? ''} ${row.organisation ?? ''} ${row.card ?? ''}`
            .toLocaleLowerCase()
            .includes(search))
    )
    .sort(
      (a, b) =>
        a.className.localeCompare(b.className) ||
        a.lastname.localeCompare(b.lastname) ||
        a.firstname.localeCompare(b.firstname) ||
        a.id - b.id
    );
}
export function summarizeAnomalies(rows: EventAnomalyInsight['competitors']) {
  return anomalyTypes.map(type => ({
    type,
    count: rows.filter(row =>
      row.findings.some(finding => finding.type === type)
    ).length,
  }));
}
