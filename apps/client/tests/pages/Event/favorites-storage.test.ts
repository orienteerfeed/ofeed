import { beforeEach, describe, expect, it } from 'vitest';
import {
  guestFavoritesKey,
  readGuestFavorites,
} from '@/pages/Event/EventFavoritesProvider';
beforeEach(() => localStorage.clear());
describe('guest favorite storage', () => {
  it('keeps selections separate by event and ignores malformed values', () => {
    localStorage.setItem(
      guestFavoritesKey('race'),
      JSON.stringify([1, 2, 2, '3', -1, 0, null, 1.2, 999999999999])
    );
    expect(readGuestFavorites('race')).toEqual([1, 2]);
    expect(readGuestFavorites('other')).toEqual([]);
    localStorage.setItem(guestFavoritesKey('race'), '{broken');
    expect(readGuestFavorites('race')).toEqual([]);
  });
  it('bounds persisted selections before sending them to the public API', () => {
    localStorage.setItem(
      guestFavoritesKey('race'),
      JSON.stringify(Array.from({ length: 120 }, (_, i) => i + 1))
    );
    expect(readGuestFavorites('race')).toHaveLength(100);
  });
});
