import type { TFunction } from 'i18next';

export function formatCompetitorStatus(
  status: string | null | undefined,
  t: TFunction
): string {
  const labels = t('Favorites.Status', { returnObjects: true });
  return status && Object.hasOwn(labels, status)
    ? labels[status as keyof typeof labels]
    : (status ?? '—');
}
