import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { CartEntryItem, CartStore } from './types';
import { isStartSlotInCart } from './cart-start-slots';

const initialState = {
  items: [] as CartEntryItem[],
};

export const useCartStore = create<CartStore>()(
  persist(
    set => ({
      ...initialState,

      addItem: (item, options) => {
        let added = false;
        set(state => {
          if (
            options?.exclusiveStartSlot &&
            isStartSlotInCart(state.items, item)
          ) {
            return state;
          }
          added = true;
          return {
            items: [...state.items, { ...item, id: crypto.randomUUID() }],
          };
        });
        return added;
      },

      removeItem: id => {
        set(state => ({ items: state.items.filter(item => item.id !== id) }));
      },

      clearEvent: eventId => {
        set(state => ({
          items: state.items.filter(item => item.eventId !== eventId),
        }));
      },

      clear: () => {
        set(initialState);
      },
    }),
    {
      name: 'ofeed-entry-cart',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

// Selectors to keep re-renders minimal
export const useCartItems = () => useCartStore(state => state.items);
export const useCartCount = () => useCartStore(state => state.items.length);
export const useAddCartItem = () => useCartStore(state => state.addItem);
export const useRemoveCartItem = () => useCartStore(state => state.removeItem);
export const useClearCartEvent = () => useCartStore(state => state.clearEvent);
export const useClearCart = () => useCartStore(state => state.clear);
