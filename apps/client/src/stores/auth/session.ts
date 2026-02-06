import type { User } from '../../types/user';
import { useAuthStore } from './auth-store';

export type Session = { user: User } | null;

// Získá session bez React hooků (pro guards, loadery, atd.)
export async function getSession(): Promise<Session> {
  const s = useAuthStore.getState() as {
    hydrate?: () => Promise<void> | void;
    hydrated?: boolean;
  };
  if (typeof s.hydrate === 'function' && !s.hydrated) {
    await s.hydrate();
  }
  const user = useAuthStore.getState().user as User | null | undefined;
  return user ? { user } : null;
}
