export type UserRole = 'ADMIN' | 'ACCOUNTS_CLERK' | 'AUDITOR'

export interface User {
  id: number;
  username: string;
  full_name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  last_login: string;
  created_at: string;
  updated_at: string;
}

export interface CreateUserData {
  username: string;
  full_name: string;
  email: string;
  password: string;
  role: UserRole;
}

export interface UpdateUserData {
  username?: string;
  full_name?: string;
  email?: string;
  role?: UserRole;
}

export interface UserAPI {
  getUsers(): Promise<User[]>;
  createUser(data: CreateUserData): Promise<{ success: boolean; id: number }>;
  updateUser(id: number, data: UpdateUserData): Promise<{ success: boolean }>;
  toggleUserStatus(id: number, isActive: boolean): Promise<{ success: boolean }>;
  resetUserPassword(id: number, password: string): Promise<{ success: boolean }>;
}
