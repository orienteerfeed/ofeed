import type { CartEntryItem } from './types';

/** Compare instants, not ISO strings (offsets and milliseconds can differ). */
export function isStartSlotInCart(
  items: CartEntryItem[],
  candidate: Pick<CartEntryItem, 'eventId' | 'classId' | 'startTime'>
): boolean {
  const time = Date.parse(candidate.startTime ?? '');
  if (!Number.isFinite(time)) return false;
  return items.some(
    item =>
      item.eventId === candidate.eventId &&
      item.classId === candidate.classId &&
      Date.parse(item.startTime ?? '') === time
  );
}
