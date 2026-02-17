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

function isValidAuthSession(value: unknown): value is AuthSession {
  if (typeof value !== 'object' || value === null) {return false}
  const obj = value as Record<string, unknown>
  if (typeof obj['lastActivity'] !== 'number' || !Number.isFinite(obj['lastActivity'])) {return false}
  if (typeof obj['user'] !== 'object' || obj['user'] === null) {return false}
  const user = obj['user'] as Record<string, unknown>
  return (
    typeof user['id'] === 'number' && Number.isFinite(user['id']) &&
    typeof user['username'] === 'string' && user['username'].length > 0 &&
    typeof user['role'] === 'string' && user['role'].length > 0 &&
    typeof user['full_name'] === 'string' &&
    (typeof user['email'] === 'string' || user['email'] === null) &&
    typeof user['created_at'] === 'string' &&
    (typeof user['is_active'] === 'number' || typeof user['is_active'] === 'boolean')
  )
}

export async function getSession(): Promise<AuthSession | null> {
  try {
    const raw = await keytar.getPassword(SERVICE, ACCOUNT)
    if (!raw) {return null}
    const parsed: unknown = JSON.parse(raw)
    if (!isValidAuthSession(parsed)) {return null}
    return parsed
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
