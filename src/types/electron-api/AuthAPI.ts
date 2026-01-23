export interface User {
  id: number
  username: string
  full_name: string
  email: string
  role: 'ADMIN' | 'ACCOUNTS_CLERK' | 'AUDITOR'
  is_active: boolean
  last_login: string
  created_at: string
  updated_at: string
}

export interface AuthAPI {
  login: (_username: string, _password: string) => Promise<{ success: boolean; user?: User; error?: string }>
  changePassword: (_userId: number, _oldPassword: string, _newPassword: string) => Promise<{ success: boolean; error?: string }>
}