import {
  useAuthActions,
  useIsAuthenticated,
  useToken,
  useUser,
} from '@/stores/auth';

/**
 * Main auth hook that provides authentication state and actions
 */
export const useAuth = () => {
  const token = useToken();
  const user = useUser();
  const isAuthenticated = useIsAuthenticated();
  const { signin, signout } = useAuthActions();

  return {
    token,
    user,
    isAuthenticated,
    signin,
    signout,
    // Utility functions
    hasRole: (role: string) => user?.role === role,
    isAdmin: () => user?.role === 'admin',
  };
};

/**
 * Hook specifically for useRequest to avoid unnecessary re-renders
 */
export const useAuthForRequest = () => {
  const token = useToken();
  const { signout } = useAuthActions();

  return {
    token,
    logout: signout,
  };
};

export {
  useAuthActions,
  useAuthStore,
  useIsAuthenticated,
  useToken,
  useUser,
} from '@/stores/auth';
