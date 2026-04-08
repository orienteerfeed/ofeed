type CompetitorResultLike = {
  status: string;
  time?: number;
};

export function hasNumericResultTime(value: number | undefined): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

export function isValidSplitResultCompetitor(
  competitor: CompetitorResultLike,
): boolean {
  return competitor.status === 'OK' && hasNumericResultTime(competitor.time);
}

export function filterValidSplitResultCompetitors<T extends CompetitorResultLike>(
  competitors: readonly T[],
): T[] {
  return competitors.filter(isValidSplitResultCompetitor);
}
