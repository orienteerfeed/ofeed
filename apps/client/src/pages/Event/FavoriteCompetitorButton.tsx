import { Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useEventFavorites } from './EventFavoritesProvider';

export function FavoriteCompetitorButton({
  competitorId,
}: {
  competitorId: number | string;
}) {
  const favorites = useEventFavorites();
  const { t } = useTranslation();
  const id = Number(competitorId);
  if (!favorites || !Number.isSafeInteger(id) || id <= 0) return null;
  const selected = favorites.ids.has(id);
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={selected ? t('Favorites.Remove') : t('Favorites.Add')}
      title={selected ? t('Favorites.Remove') : t('Favorites.Add')}
      disabled={favorites.loading || favorites.pending}
      className={cn(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50',
        selected && 'text-amber-600 dark:text-amber-400'
      )}
      onClick={event => {
        event.stopPropagation();
        void favorites.toggle(id);
      }}
    >
      <Star className={cn('h-4 w-4', selected && 'fill-current')} />
    </button>
  );
}
