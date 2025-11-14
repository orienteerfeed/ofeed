import type { User } from '@/types/user';
export interface AuthState {
  token: string | null;
  user: User | null;
}

export interface AuthStore extends AuthState {
  // Actions
  signin: (authData: { token: string; user: User }) => void;
  signout: () => void;
  // Utility functions
  isAuthenticated: () => boolean;
  hasRole: (role: string) => boolean;
}
