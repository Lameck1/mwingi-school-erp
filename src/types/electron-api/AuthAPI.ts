export interface User {
  id: number
  username: string
  full_name: string
  email: string
  role: 'ADMIN' | 'ACCOUNTS_CLERK' | 'AUDITOR' | 'PRINCIPAL' | 'DEPUTY_PRINCIPAL' | 'TEACHER'
  is_active: boolean
  last_login: string
  created_at: string
  updated_at: string
}

export interface AuthSession {
  user: User
  lastActivity: number
}

export interface AuthAPI {
  login: (_username: string, _password: string) => Promise<{ success: boolean; user?: User; error?: string }>
  changePassword: (_userId: number, _oldPassword: string, _newPassword: string) => Promise<{ success: boolean; error?: string }>
  hasUsers: () => Promise<boolean>
  setupAdmin: (data: { username: string; password: string; full_name: string; email: string }) => Promise<{ success: boolean; id?: number; error?: string }>
  getSession: () => Promise<AuthSession | null>
  setSession: (session: AuthSession) => Promise<{ success: boolean }>
  clearSession: () => Promise<{ success: boolean }>
}
