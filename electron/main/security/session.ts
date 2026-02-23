import keytar from 'keytar'
import { z } from 'zod'

const UserRoleSchema = z.enum(['ADMIN', 'ACCOUNTS_CLERK', 'AUDITOR', 'PRINCIPAL', 'DEPUTY_PRINCIPAL', 'TEACHER'])
const DateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/)

export const AuthSessionSchema = z.object({
  user: z.object({
    id: z.number().int().positive(),
    username: z.string().min(1).max(255),
    full_name: z.string().min(1).max(255),
    email: z.string().email().max(255).nullish(),
    role: UserRoleSchema,
    is_active: z.union([z.number(), z.boolean()]),
    last_login: z.string().nullish(),
    created_at: DateStringSchema,
    updated_at: DateStringSchema.nullish()
  }),
  lastActivity: z.number().refine((val) => {
    const now = Date.now()
    const maxAge = 24 * 60 * 60 * 1000 // 24 hours
    return val >= now - maxAge && val <= now + 60000
  }, { message: "Session expired or invalid timeline" })
})

export type AuthSession = z.infer<typeof AuthSessionSchema>

const SERVICE = 'mwingi-school-erp'
const ACCOUNT = 'session'

export async function getSession(): Promise<AuthSession | null> {
  try {
    const raw = await keytar.getPassword(SERVICE, ACCOUNT)
    if (!raw) { return null }
    const parsed = JSON.parse(raw)
    const result = AuthSessionSchema.safeParse(parsed)
    if (!result.success) {
      console.warn('Session Validation Failed:', result.error)
      return null
    }
    return result.data
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
