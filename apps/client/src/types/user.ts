export interface User {
  id: number;
  email: string;
  firstname: string;
  lastname: string;
  club?: string | null;
  role?: string;
  avatarUrl?: string | null;
  initials?: string;
}
