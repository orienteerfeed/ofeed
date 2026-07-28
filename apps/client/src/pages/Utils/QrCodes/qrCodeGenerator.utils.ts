export const MAX_QR_CODES = 1000;

export interface BibRange {
  teamFrom: number;
  teamTo: number;
  legFrom: number;
  legTo: number;
}

export interface BibLabel {
  team: number;
  leg: number;
  code: string;
}

export const encodeBibCode = (team: number, leg: number): string =>
  String(team * 100 + leg).padStart(6, '0');

export const countBibLabels = (range: BibRange): number => {
  if (range.teamFrom > range.teamTo || range.legFrom > range.legTo) return 0;
  return (
    (range.teamTo - range.teamFrom + 1) * (range.legTo - range.legFrom + 1)
  );
};

export const generateBibLabels = (range: BibRange): BibLabel[] => {
  const labels: BibLabel[] = [];
  for (let team = range.teamFrom; team <= range.teamTo; team++) {
    for (let leg = range.legFrom; leg <= range.legTo; leg++) {
      labels.push({ team, leg, code: encodeBibCode(team, leg) });
    }
  }
  return labels;
};
