import type { User } from '../../types/user';
import { useAuthStore } from './auth-store';

export type Session = { user: User } | null;

// Získá session bez React hooků (pro guards, loadery, atd.)
export async function getSession(): Promise<Session> {
  const s = useAuthStore.getState();
  if (typeof (s as any).hydrate === 'function' && !(s as any).hydrated) {
    await (s as any).hydrate();
  }
  const user = useAuthStore.getState().user as User | null | undefined;
  return user ? { user } : null;
}
