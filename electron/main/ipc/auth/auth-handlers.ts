import { IpcMainInvokeEvent } from 'electron'
import { ipcMain, bcrypt } from '../../electron-env'
import { getDatabase } from '../../database/index'
import { logAudit } from '../../database/utils/audit'

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
    [key: string]: unknown
}

interface NewUser {
    username: string
    password: string
    full_name: string
    email: string
    role: string
}

export function registerAuthHandlers(): void {
    const db = getDatabase()

    // ======== AUTH ========
    ipcMain.handle('auth:login', async (_event: IpcMainInvokeEvent, username: string, password: string): Promise<{ success: boolean; user?: Omit<User, 'password_hash'>; error?: string }> => {
        // console.log('Login attempt for:', username)
        const user = db.prepare('SELECT * FROM user WHERE username = ? AND is_active = 1').get(username) as User | undefined

        if (!user) {
            // console.log('User not found:', username)
            return { success: false, error: 'Invalid username or password' }
        }

        // console.log('User found, comparing password...')
        try {
            const valid = await bcrypt.compare(password, user.password_hash)
            // console.log('Password valid:', valid)

            if (!valid) return { success: false, error: 'Invalid username or password' }

            db.prepare('UPDATE user SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id)
            logAudit(user.id, 'LOGIN', 'user', user.id, null, { action: 'Login' })

            const { password_hash, ...userData } = user // eslint-disable-line no-unused-vars
            return { success: true, user: userData }
        } catch (err) {
            console.error('Bcrypt comparison error:', err)
            throw err
        }
    })

    ipcMain.handle('auth:changePassword', async (_event: IpcMainInvokeEvent, userId: number, oldPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> => {
        const user = db.prepare('SELECT password_hash FROM user WHERE id = ?').get(userId) as { password_hash: string } | undefined
        if (!user) return { success: false, error: 'User not found' }

        const valid = await bcrypt.compare(oldPassword, user.password_hash)
        if (!valid) return { success: false, error: 'Current password is incorrect' }

        const hash = await bcrypt.hash(newPassword, 10)
        db.prepare('UPDATE user SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hash, userId)
        return { success: true }
    })

    // ======== USER MANAGEMENT ========
    ipcMain.handle('user:update', async (_event: IpcMainInvokeEvent, id: number, data: UserUpdateData): Promise<{ success: boolean; error?: string }> => {
        // Explicit UPDATE statement for security
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

    ipcMain.handle('user:getAll', async (_event: IpcMainInvokeEvent): Promise<Omit<User, 'password_hash'>[]> => {
        return db.prepare('SELECT id, username, full_name, email, role, is_active, last_login, created_at FROM user').all() as Omit<User, 'password_hash'>[]
    })

    ipcMain.handle('user:create', async (_event: IpcMainInvokeEvent, data: NewUser): Promise<{ success: boolean; id?: number }> => {
        const hash = await bcrypt.hash(data.password, 10)
        const stmt = db.prepare('INSERT INTO user (username, password_hash, full_name, email, role) VALUES (?, ?, ?, ?, ?)')
        const result = stmt.run(data.username, hash, data.full_name, data.email, data.role)
        return { success: true, id: result.lastInsertRowid as number }
    })

    ipcMain.handle('user:toggleStatus', async (_event: IpcMainInvokeEvent, id: number, isActive: boolean): Promise<{ success: boolean }> => {
        db.prepare('UPDATE user SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(isActive ? 1 : 0, id)
        return { success: true }
    })

    ipcMain.handle('user:resetPassword', async (_event: IpcMainInvokeEvent, id: number, newPassword: string): Promise<{ success: boolean }> => {
        const hash = await bcrypt.hash(newPassword, 10)
        db.prepare('UPDATE user SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hash, id)
        return { success: true }
    })
}
















