import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'
import { getSession, setSession, clearSession, type AuthSession } from '../../security/session'
import { validatePassword } from '../../utils/validation'
import { safeHandleRaw, safeHandleRawWithRole, ROLES } from '../ipc-result'

const bcrypt = require('bcryptjs')

interface User {
    id: number
    username: string
    password_hash: string
    full_name: string
    email: string
    role: string
    is_active: number
    last_login: string
    created_at: string
    updated_at?: string
}

interface UserUpdateData {
    full_name?: string
    email?: string
    role?: string
}

interface NewUser {
    username: string
    password: string
    full_name: string
    email: string
    role: string
}

// ── Login Rate Limiting ─────────────────────────────────────────
const MAX_ATTEMPTS = 5
const BASE_LOCKOUT_MS = 30_000 // 30 seconds
const MAX_LOCKOUT_MS = 15 * 60_000 // 15 minutes

interface LoginAttemptRecord {
    failedCount: number
    lastFailedAt: number
    lockoutUntil: number
}

const loginAttempts = new Map<string, LoginAttemptRecord>()

function checkRateLimit(username: string): string | null {
    const record = loginAttempts.get(username)
    if (!record) {return null}
    if (record.lockoutUntil > Date.now()) {
        const remainingSec = Math.ceil((record.lockoutUntil - Date.now()) / 1000)
        return `Too many failed attempts. Try again in ${remainingSec} seconds.`
    }
    return null
}

function recordFailedLogin(username: string): void {
    const record = loginAttempts.get(username) ?? { failedCount: 0, lastFailedAt: 0, lockoutUntil: 0 }
    record.failedCount++
    record.lastFailedAt = Date.now()
    if (record.failedCount >= MAX_ATTEMPTS) {
        const multiplier = Math.pow(2, Math.floor((record.failedCount - MAX_ATTEMPTS) / MAX_ATTEMPTS))
        record.lockoutUntil = Date.now() + Math.min(BASE_LOCKOUT_MS * multiplier, MAX_LOCKOUT_MS)
    }
    loginAttempts.set(username, record)
}

function clearFailedLogins(username: string): void {
    loginAttempts.delete(username)
}

function registerSessionHandlers(db: ReturnType<typeof getDatabase>): void {
    safeHandleRaw('auth:getSession', async (): Promise<AuthSession | null> => {
        const session = await getSession()
        if (!session?.user.id) {return null}

        const existing = db.prepare('SELECT id, is_active, username, full_name, email, role, last_login, created_at, updated_at FROM user WHERE id = ?').get(session.user.id) as User | undefined
        if (existing?.is_active !== 1) {
            await clearSession()
            return null
        }

        const { password_hash: _passwordHash, ...userData } = existing
        const refreshed: AuthSession = {
            user: { ...userData, id: Number(userData.id) },
            lastActivity: session.lastActivity,
        }
        await setSession(refreshed)
        return refreshed
    })

    safeHandleRaw('auth:setSession', async (_event, session: AuthSession): Promise<{ success: boolean; error?: string }> => {
        if (!Number.isFinite(session?.lastActivity) || session.lastActivity <= 0) {
            return { success: false, error: 'Invalid session payload' }
        }

        const existingSession = await getSession()
        if (!existingSession?.user?.id) {
            return { success: false, error: 'No active authenticated session' }
        }

        const dbUser = db.prepare('SELECT id, username, full_name, email, role, is_active, last_login, created_at, updated_at FROM user WHERE id = ?').get(existingSession.user.id) as
            User | undefined

        if (!dbUser || dbUser.is_active !== 1) {
            await clearSession()
            return { success: false, error: 'Session user is inactive or missing' }
        }

        // Prevent renderer-side user swapping by pinning to the already-authenticated identity.
        if (session?.user?.id && session.user.id !== dbUser.id) {
            return { success: false, error: 'Session user mismatch' }
        }

        if (session?.user?.role && session.user.role !== dbUser.role) {
            return { success: false, error: 'Session role mismatch' }
        }

        const { password_hash: _passwordHash, ...userData } = dbUser
        const refreshed: AuthSession = {
            user: {
                ...userData,
                id: Number(userData.id),
            },
            lastActivity: session.lastActivity
        }

        if (!refreshed.user.id || !refreshed.user.role || !refreshed.user.username) {
            return { success: false, error: 'Session user does not exist' }
        }

        await setSession(refreshed)
        return { success: true }
    })

    safeHandleRaw('auth:clearSession', async (): Promise<{ success: boolean; error?: string }> => {
        const existingSession = await getSession()
        if (!existingSession?.user?.id) {
            return { success: false, error: 'No active session to clear' }
        }
        await clearSession()
        return { success: true }
    })
}

function registerUserManagementHandlers(db: ReturnType<typeof getDatabase>): void {
    safeHandleRawWithRole('user:update', ROLES.ADMIN_ONLY, (_event, id: number, data: UserUpdateData): { success: boolean; error?: string } => {
        const stmt = db.prepare(`
            UPDATE user 
            SET full_name = COALESCE(?, full_name),
                email = COALESCE(?, email),
                role = COALESCE(?, role),
                updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `)

        stmt.run(data.full_name, data.email, data.role, id)
        return { success: true }
    })

    safeHandleRawWithRole('user:getAll', ROLES.MANAGEMENT, (): Omit<User, 'password_hash'>[] => {
        return db.prepare('SELECT id, username, full_name, email, role, is_active, last_login, created_at FROM user').all() as Omit<User, 'password_hash'>[]
    })

    safeHandleRawWithRole('user:create', ROLES.ADMIN_ONLY, async (_event, data: NewUser): Promise<{ success: boolean; id?: number; error?: string }> => {
        const pwCheck = validatePassword(data.password)
        if (!pwCheck.success) {
            return { success: false, error: pwCheck.error }
        }

        const existing = db.prepare('SELECT id FROM user WHERE username = ?').get(data.username) as { id: number } | undefined
        if (existing) {
            return { success: false, error: 'Username already exists' }
        }

        const hash = await bcrypt.hash(data.password, 10)
        const stmt = db.prepare('INSERT INTO user (username, password_hash, full_name, email, role) VALUES (?, ?, ?, ?, ?)')
        const result = stmt.run(data.username, hash, data.full_name, data.email, data.role)
        return { success: true, id: result.lastInsertRowid as number }
    })

    safeHandleRawWithRole('user:toggleStatus', ROLES.ADMIN_ONLY, (_event, id: number, isActive: boolean): { success: boolean } => {
        db.prepare('UPDATE user SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(isActive ? 1 : 0, id)
        return { success: true }
    })

    safeHandleRawWithRole('user:resetPassword', ROLES.ADMIN_ONLY, async (_event, id: number, newPassword: string): Promise<{ success: boolean; error?: string }> => {
        const pwCheck = validatePassword(newPassword)
        if (!pwCheck.success) {
            return { success: false, error: pwCheck.error }
        }

        const hash = await bcrypt.hash(newPassword, 10)
        db.prepare('UPDATE user SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hash, id)
        return { success: true }
    })
}

export function registerAuthHandlers(): void {
    const db = getDatabase()

    safeHandleRaw('auth:hasUsers', (): boolean => {
        const row = db.prepare('SELECT id FROM user WHERE is_active = 1 LIMIT 1').get() as { id: number } | undefined
        return Boolean(row?.id)
    })

    safeHandleRaw('auth:setupAdmin', async (_event, data: { username: string; password: string; full_name: string; email: string }): Promise<{ success: boolean; id?: number; error?: string }> => {
        const existing = db.prepare('SELECT id FROM user WHERE is_active = 1 LIMIT 1').get() as { id: number } | undefined
        if (existing) {
            return { success: false, error: 'Admin setup is only available on first run' }
        }

        const duplicateUser = db.prepare('SELECT id FROM user WHERE username = ?').get(data.username) as { id: number } | undefined
        if (duplicateUser) {
            return { success: false, error: 'Username already exists' }
        }

        const pwCheck = validatePassword(data.password)
        if (!pwCheck.success) {
            return { success: false, error: pwCheck.error }
        }

        const hash = await bcrypt.hash(data.password, 10)
        const stmt = db.prepare('INSERT INTO user (username, password_hash, full_name, email, role) VALUES (?, ?, ?, ?, ?)')
        const result = stmt.run(data.username, hash, data.full_name, data.email, 'ADMIN')
        return { success: true, id: result.lastInsertRowid as number }
    })

    // ======== AUTH ========
    safeHandleRaw('auth:login', async (_event, username: string, password: string): Promise<{ success: boolean; user?: Omit<User, 'password_hash'>; error?: string }> => {
        const rateLimitError = checkRateLimit(username)
        if (rateLimitError) {
            return { success: false, error: rateLimitError }
        }

        const user = db.prepare('SELECT * FROM user WHERE username = ? AND is_active = 1').get(username) as User | undefined

        if (!user) {
            recordFailedLogin(username)
            return { success: false, error: 'Invalid username or password' }
        }

        try {
            const valid = await bcrypt.compare(password, user.password_hash)

            if (!valid) {
                recordFailedLogin(username)
                return { success: false, error: 'Invalid username or password' }
            }

            clearFailedLogins(username)
            db.prepare('UPDATE user SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id)
            logAudit(user.id, 'LOGIN', 'user', user.id, null, { action: 'Login' })

            const { password_hash, ...userData } = user
            const normalizedUser = { ...userData, id: Number(userData.id) }
            await setSession({
                user: normalizedUser,
                lastActivity: Date.now()
            })
            return { success: true, user: normalizedUser }
        } catch (err) {
            console.error('Bcrypt comparison error:', err)
            throw err
        }
    })

    registerSessionHandlers(db)

    safeHandleRaw('auth:changePassword', async (_event, legacyUserId: number, oldPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> => {
        const session = await getSession()
        const sessionUserId = Number(session?.user?.id)
        if (!Number.isInteger(sessionUserId) || sessionUserId <= 0) {
            return { success: false, error: 'No active authenticated session' }
        }
        if (legacyUserId && legacyUserId !== sessionUserId) {
            return { success: false, error: 'Session user mismatch' }
        }

        const user = db.prepare('SELECT password_hash FROM user WHERE id = ?').get(sessionUserId) as { password_hash: string } | undefined
        if (!user) {return { success: false, error: 'User not found' }}

        const valid = await bcrypt.compare(oldPassword, user.password_hash)
        if (!valid) {return { success: false, error: 'Current password is incorrect' }}

        const pwCheck = validatePassword(newPassword)
        if (!pwCheck.success) {return { success: false, error: pwCheck.error }}

        const hash = await bcrypt.hash(newPassword, 10)
        db.prepare('UPDATE user SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hash, sessionUserId)
        await clearSession()
        return { success: true }
    })

    registerUserManagementHandlers(db)
}















