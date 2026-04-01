import type { UserRole as SharedUserRole } from '@repo/shared';

export interface User {
  id: number;
  email: string;
  firstname: string;
  lastname: string;
  organisation?: string | null;
  emergencyContact?: string | null;
  club?: string | null;
  role?: UserRole;
  avatarUrl?: string | null;
  initials?: string;
}

export type UserRole = SharedUserRole;
