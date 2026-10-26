import { create } from 'zustand';
import type { AuthStore } from './types';

export const useAuthStore = create<AuthStore>()((set, get) => ({
  token: null,
  user: null,
  signin: ({ token, user }) => set({ token, user }),
  signout: () => {
    set({ token: null, user: null });
    if (typeof window !== 'undefined')
      window.dispatchEvent(new Event('ofeed-signout'));
  },
  isAuthenticated: () =>
    Boolean(get().token && get().user?.id && get().user?.email),
  hasRole: role => get().user?.role === role,
}));
export const useToken = () => useAuthStore(state => state.token);
export const useUser = () => useAuthStore(state => state.user);
export const useIsAuthenticated = () =>
  useAuthStore(state =>
    Boolean(state.token && state.user?.id && state.user?.email)
  );
export const useSignin = () => useAuthStore(state => state.signin);
export const useSignout = () => useAuthStore(state => state.signout);
