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
  if (typeof value !== 'object' || value === null) { return false }
  const obj = value as Record<string, unknown>

  // Strict validation of lastActivity - must be recent (within 24 hours)
  const now = Date.now()
  const maxAge = 24 * 60 * 60 * 1000 // 24 hours
  if (typeof obj['lastActivity'] !== 'number' || !Number.isFinite(obj['lastActivity'])) { return false }
  if (obj['lastActivity'] < (now - maxAge) || obj['lastActivity'] > now + 60000) { return false } // Not too old or future

  if (typeof obj['user'] !== 'object' || obj['user'] === null) { return false }
  const user = obj['user'] as Record<string, unknown>

  // Validate user object structure and types
  if (!isValidUserObject(user)) {
    return false
  }

  return true
}

function isValidUserObject(user: Record<string, unknown>): boolean {
  // Basic type and structure validation
  if (!isValidUserBasicFields(user)) {
    return false
  }

  // Validate role
  if (!isValidUserRole(user['role'])) {
    return false
  }

  // Validate email if present
  if (user['email'] !== null && !isValidEmail(user['email'])) {
    return false
  }

  // Validate dates
  if (!isValidDateString(user['created_at'])) {
    return false
  }

  if (user['updated_at'] !== undefined && !isValidDateString(user['updated_at'])) {
    return false
  }

  return true
}

function isValidUserBasicFields(user: Record<string, unknown>): boolean {
  return (
    typeof user['id'] === 'number' &&
    Number.isFinite(user['id']) &&
    user['id'] > 0 &&
    typeof user['username'] === 'string' &&
    user['username'].length > 0 &&
    user['username'].length <= 255 &&
    typeof user['role'] === 'string' &&
    user['role'].length > 0 &&
    user['role'].length <= 50 &&
    typeof user['full_name'] === 'string' &&
    user['full_name'].length > 0 &&
    user['full_name'].length <= 255 &&
    typeof user['created_at'] === 'string' &&
    (typeof user['is_active'] === 'number' || typeof user['is_active'] === 'boolean') &&
    (user['email'] === null || typeof user['email'] === 'string') &&
    (user['updated_at'] === undefined || typeof user['updated_at'] === 'string')
  )
}

function isValidUserRole(role: unknown): boolean {
  const validRoles = ['ADMIN', 'ACCOUNTS_CLERK', 'AUDITOR', 'PRINCIPAL', 'DEPUTY_PRINCIPAL', 'TEACHER']
  return typeof role === 'string' && validRoles.includes(role)
}

function isValidEmail(email: unknown): boolean {
  if (typeof email !== 'string' || email.length === 0 || email.length > 255) {
    return false
  }

  // Simple email validation - just check for basic structure without complex regex
  const parts = email.split('@')
  if (parts.length !== 2) {
    return false
  }

  const local = parts[0]
  const domain = parts[1]
  if (!local || !domain) {
    return false
  }

  // Basic domain validation - must have at least one dot
  if (!domain.includes('.')) {
    return false
  }

  return true
}

function isValidDateString(dateStr: unknown): boolean {
  if (typeof dateStr !== 'string') {
    return false
  }

  // Flexible ISO/SQLite date format validation
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/
  return isoDateRegex.test(dateStr)
}

export async function getSession(): Promise<AuthSession | null> {
  try {
    const raw = await keytar.getPassword(SERVICE, ACCOUNT)
    if (!raw) { return null }
    const parsed: unknown = JSON.parse(raw)
    if (!isValidAuthSession(parsed)) { return null }
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
