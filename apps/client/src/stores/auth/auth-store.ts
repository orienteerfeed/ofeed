import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AuthStore, User } from './types';

const initialState = {
  token: null,
  user: null,
};

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // State
      ...initialState,

      // Actions
      signin: ({ token, user }: { token: string; user: User }) => {
        set({ token, user });
      },

      signout: () => {
        set(initialState);
      },

      // Utility functions
      isAuthenticated: () => {
        const { token, user } = get();
        return !!token && !!user && !!user.id && !!user.email;
      },

      hasRole: (role: string) => {
        const { user } = get();
        return user?.role === role;
      },
    }),
    {
      name: 'orienteerfeed-auth',
      storage: createJSONStorage(() => localStorage),
      // Optional: migrate old storage format
      migrate: (persistedState: any, version: number) => {
        if (version === 0) {
          // Migrace z předchozí verze pokud potřebujete
          return persistedState;
        }
        return persistedState;
      },
    }
  )
);

// Selectors pro optimalizaci re-renderů
export const useToken = () => useAuthStore(state => state.token);
export const useUser = () => useAuthStore(state => state.user);
export const useIsAuthenticated = () =>
  useAuthStore(state => state.isAuthenticated());
export const useAuthActions = () =>
  useAuthStore(state => ({ signin: state.signin, signout: state.signout }));
