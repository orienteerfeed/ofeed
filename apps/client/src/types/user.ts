export interface User {
  id: number;
  email: string;
  firstname: string;
  lastname: string;
  organisation?: string | null;
  emergencyContact?: string | null;
  club?: string | null;
  role?: string;
  avatarUrl?: string | null;
  initials?: string;
}
