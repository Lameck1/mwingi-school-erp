import keytar from 'keytar'

export interface AuthSession {
  user: {
    id: number
    username: string
    full_name: string
    email: string
    role: string
    is_active: number | boolean
    last_login: string | null
    created_at: string
    updated_at?: string
  }
  lastActivity: number
}

const SERVICE = 'mwingi-school-erp'
const ACCOUNT = 'session'

export async function getSession(): Promise<AuthSession | null> {
  try {
    const raw = await keytar.getPassword(SERVICE, ACCOUNT)
    if (!raw) {return null}
    return JSON.parse(raw) as AuthSession
  } catch (error) {
    console.warn('Failed to load session from keytar:', error)
    return null
  }
}

export async function setSession(session: AuthSession): Promise<void> {
  try {
    await keytar.setPassword(SERVICE, ACCOUNT, JSON.stringify(session))
  } catch (error) {
    console.warn('Failed to save session to keytar:', error)
  }
}

export async function clearSession(): Promise<void> {
  try {
    await keytar.deletePassword(SERVICE, ACCOUNT)
  } catch (error) {
    console.warn('Failed to clear session from keytar:', error)
  }
}
