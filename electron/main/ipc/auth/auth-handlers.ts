import { createRequire } from 'node:module'
import { z } from 'zod'

const require = createRequire(import.meta.url)

import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'
import { getSession, setSession, clearSession, type AuthSession } from '../../security/session'
import { validatePassword } from '../../utils/validation'
import { ROLES } from '../ipc-result'
import { AuthSessionSchema, ChangePasswordSchema, LoginSchema, SetupAdminSchema } from '../schemas/auth-schemas'
import { UserCreateSchema, UserUpdateSchema, UserToggleStatusSchema, UserResetPasswordSchema } from '../schemas/user-schemas'
import { validatedHandler, validatedHandlerMulti } from '../validated-handler'

const bcrypt = require('bcryptjs')

interface User {
    id: number
    username: string
    password_hash: string
    full_name: string
    email: string
    role: "ADMIN" | "ACCOUNTS_CLERK" | "AUDITOR" | "PRINCIPAL" | "DEPUTY_PRINCIPAL" | "TEACHER"
    is_active: number
    last_login: string
    created_at: string
    updated_at?: string
}

// ── Login Rate Limiting ─────────────────────────────────────────
const MAX_ATTEMPTS = 5
const BASE_LOCKOUT_MS = 30_000 // 30 seconds
const MAX_LOCKOUT_MS = 15 * 60_000 // 15 minutes

function checkRateLimit(db: ReturnType<typeof getDatabase>, username: string): string | null {
    const record = db.prepare('SELECT failed_count, last_failed_at, lockout_until FROM login_attempt WHERE username = ?').get(username) as { failed_count: number; last_failed_at: number; lockout_until: number } | undefined
    if (!record) { return null }
    if (record.lockout_until > Date.now()) {
        const remainingSec = Math.ceil((record.lockout_until - Date.now()) / 1000)
        return `Too many failed attempts. Try again in ${remainingSec} seconds.`
    }
    return null
}

function recordFailedLogin(db: ReturnType<typeof getDatabase>, username: string): void {
    const record = db.prepare('SELECT failed_count, last_failed_at, lockout_until FROM login_attempt WHERE username = ?').get(username) as { failed_count: number; last_failed_at: number; lockout_until: number } | undefined

    const failedCount = (record?.failed_count ?? 0) + 1
    let lockoutUntil = record?.lockout_until ?? 0
    const lastFailedAt = Date.now()

    if (failedCount >= MAX_ATTEMPTS) {
        const multiplier = Math.pow(2, Math.floor((failedCount - MAX_ATTEMPTS) / MAX_ATTEMPTS))
        lockoutUntil = Date.now() + Math.min(BASE_LOCKOUT_MS * multiplier, MAX_LOCKOUT_MS)
    }

    db.prepare(`
        INSERT INTO login_attempt (username, failed_count, last_failed_at, lockout_until)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(username) DO UPDATE SET
            failed_count = excluded.failed_count,
            last_failed_at = excluded.last_failed_at,
            lockout_until = excluded.lockout_until
    `).run(username, failedCount, lastFailedAt, lockoutUntil)
}

function clearFailedLogins(db: ReturnType<typeof getDatabase>, username: string): void {
    db.prepare('DELETE FROM login_attempt WHERE username = ?').run(username)
}

function registerSessionHandlers(db: ReturnType<typeof getDatabase>): void {
    validatedHandler('auth:getSession', ROLES.PUBLIC, z.void(), async (): Promise<AuthSession | null> => {
        const session = await getSession()
        if (!session?.user.id) { return null }

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

    validatedHandler('auth:setSession', ROLES.ALL_AUTHENTICATED, AuthSessionSchema, async (_event, session): Promise<{ success: boolean; error?: string }> => {
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

    validatedHandler('auth:clearSession', ROLES.ALL_AUTHENTICATED, z.void(), async (): Promise<{ success: boolean; error?: string }> => {
        const existingSession = await getSession()
        if (!existingSession?.user?.id) {
            return { success: false, error: 'No active session to clear' }
        }
        await clearSession()
        return { success: true }
    })
}

function registerUserManagementHandlers(db: ReturnType<typeof getDatabase>): void {
    validatedHandlerMulti('user:update', ROLES.ADMIN_ONLY, UserUpdateSchema, (_event, [id, data], _actor): { success: boolean; error?: string } => {
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

    validatedHandler('user:getAll', ROLES.MANAGEMENT, z.void(), (): Omit<User, 'password_hash'>[] => {
        return db.prepare('SELECT id, username, full_name, email, role, is_active, last_login, created_at FROM user').all() as Omit<User, 'password_hash'>[]
    })

    validatedHandler('user:create', ROLES.ADMIN_ONLY, UserCreateSchema, async (_event, data, _actor): Promise<{ success: boolean; id?: number; error?: string }> => {
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

    validatedHandlerMulti('user:toggleStatus', ROLES.ADMIN_ONLY, UserToggleStatusSchema, (_event, [id, isActive], _actor): { success: boolean } => {
        db.prepare('UPDATE user SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(isActive ? 1 : 0, id)
        return { success: true }
    })

    validatedHandlerMulti('user:resetPassword', ROLES.ADMIN_ONLY, UserResetPasswordSchema, async (_event, [id, newPassword], _actor): Promise<{ success: boolean; error?: string }> => {
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

    validatedHandler('auth:hasUsers', ROLES.PUBLIC, z.void(), (): boolean => {
        const row = db.prepare('SELECT id FROM user WHERE is_active = 1 LIMIT 1').get() as { id: number } | undefined
        return Boolean(row?.id)
    })

    validatedHandler('auth:setupAdmin', ROLES.PUBLIC, SetupAdminSchema, async (_event, data, _actor): Promise<{ success: boolean; id?: number; error?: string }> => {
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
    // ======== AUTH ========
    validatedHandlerMulti('auth:login', ROLES.PUBLIC, LoginSchema, async (_event, [username, password], _actor): Promise<{ success: boolean; user?: Omit<User, 'password_hash'>; error?: string }> => {
        const rateLimitError = checkRateLimit(db, username)
        if (rateLimitError) {
            logAudit(0, 'LOGIN_RATE_LIMITED', 'auth', null, null, { username, action_status: 'FAILURE' })
            return { success: false, error: rateLimitError }
        }

        const user = db.prepare('SELECT * FROM user WHERE username = ? AND is_active = 1').get(username) as User | undefined

        if (!user) {
            recordFailedLogin(db, username)
            logAudit(0, 'LOGIN_FAILED', 'auth', null, null, { username, detail: 'Invalid credentials' })
            return { success: false, error: 'Invalid username or password' }
        }

        try {
            const valid = await bcrypt.compare(password, user.password_hash)

            if (!valid) {
                recordFailedLogin(db, username)
                logAudit(user.id, 'LOGIN_FAILED', 'auth', user.id, null, { username, detail: 'Invalid credentials' })
                return { success: false, error: 'Invalid username or password' }
            }

            clearFailedLogins(db, username)
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

    validatedHandlerMulti('auth:changePassword', ROLES.ALL_AUTHENTICATED, ChangePasswordSchema, async (_event, [legacyUserId, oldPassword, newPassword], _actor): Promise<{ success: boolean; error?: string }> => {
        const session = await getSession()
        const sessionUserId = Number(session?.user?.id)
        if (!Number.isInteger(sessionUserId) || sessionUserId <= 0) {
            return { success: false, error: 'No active authenticated session' }
        }
        if (legacyUserId && legacyUserId !== sessionUserId) {
            return { success: false, error: 'Session user mismatch' }
        }

        const user = db.prepare('SELECT password_hash FROM user WHERE id = ?').get(sessionUserId) as { password_hash: string } | undefined
        if (!user) { return { success: false, error: 'User not found' } }

        const valid = await bcrypt.compare(oldPassword, user.password_hash)
        if (!valid) { return { success: false, error: 'Current password is incorrect' } }

        const pwCheck = validatePassword(newPassword)
        if (!pwCheck.success) { return { success: false, error: pwCheck.error } }

        const hash = await bcrypt.hash(newPassword, 10)
        db.prepare('UPDATE user SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hash, sessionUserId)
        await clearSession()
        return { success: true }
    })

    registerUserManagementHandlers(db)
}















