import { beforeEach, describe, expect, it } from 'vitest';
import { useCartStore, type CartEntryItem } from '@/stores/cart';

const slot = {
  eventId: 'event-1',
  eventName: 'Test event',
  currencyCode: 'CZK',
  classId: 10,
  className: 'H21',
  firstname: 'Jan',
  lastname: 'Novák',
  cardRental: true,
  startTime: '2026-10-27T08:00:00.000Z',
  fee: 100,
  cardRentalFee: 0,
} satisfies Omit<CartEntryItem, 'id'>;
const exclusive = { exclusiveStartSlot: true };

describe('cart start slots', () => {
  beforeEach(() => {
    useCartStore.getState().clear();
    localStorage.clear();
  });

  it.each(['2026-10-27T08:00:00.000Z', '2026-10-27T09:00:00+01:00'])(
    'rejects another exclusive claim for the same instant (%s)',
    startTime => {
      expect(useCartStore.getState().addItem(slot, exclusive)).toBe(true);
      expect(
        useCartStore.getState().addItem({ ...slot, startTime }, exclusive)
      ).toBe(false);
      expect(useCartStore.getState().items).toHaveLength(1);
    }
  );

  it.each([
    { eventId: 'event-2' },
    { classId: 11 },
    { startTime: '2026-10-27T08:02:00Z' },
  ])('allows distinct slots: %j', changes => {
    useCartStore.getState().addItem(slot, exclusive);
    expect(
      useCartStore.getState().addItem({ ...slot, ...changes }, exclusive)
    ).toBe(true);
    expect(useCartStore.getState().items).toHaveLength(2);
  });

  it('allows shared times in modes that do not require an exclusive slot', () => {
    useCartStore.getState().addItem(slot);
    expect(useCartStore.getState().addItem(slot)).toBe(true);
    expect(useCartStore.getState().items).toHaveLength(2);
  });

  it('allows the slot again after removing its previous cart item', () => {
    useCartStore.getState().addItem(slot, exclusive);
    useCartStore.getState().removeItem(useCartStore.getState().items[0]!.id);
    expect(useCartStore.getState().addItem(slot, exclusive)).toBe(true);
  });

  it('recognizes slots restored from the existing persisted cart format', async () => {
    localStorage.setItem(
      'ofeed-entry-cart',
      JSON.stringify({
        state: { items: [{ ...slot, id: 'existing-item' }] },
        version: 0,
      })
    );
    await useCartStore.persist.rehydrate();
    expect(useCartStore.getState().addItem(slot, exclusive)).toBe(false);
    expect(useCartStore.getState().items[0]!.id).toBe('existing-item');
  });
});
