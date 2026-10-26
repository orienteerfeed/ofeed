import type { User } from '../../types/user';
import { useAuthStore } from './auth-store';
import { bootstrapSession } from './session-manager';
export type Session = { user: User } | null;
export async function getSession(): Promise<Session> {
  await bootstrapSession();
  const user = useAuthStore.getState().user;
  return user ? { user } : null;
}
