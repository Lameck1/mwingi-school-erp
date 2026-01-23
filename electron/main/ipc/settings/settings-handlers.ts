import { ipcMain } from '../../electron-env'
import type { IpcMainInvokeEvent } from 'electron'
import { getDatabase } from '../../database/index'

export function registerSettingsHandlers(): void {
    const db = getDatabase()

    // ======== SCHOOL SETTINGS ========
    ipcMain.handle('settings:get', async () => {
        return db.prepare('SELECT * FROM school_settings WHERE id = 1').get()
    })

    ipcMain.handle('settings:update', async (_event: IpcMainInvokeEvent, data: any) => {
        // Use explicit UPDATE statement instead of dynamic builder for maximum security
        const stmt = db.prepare(`
            UPDATE school_settings 
            SET school_name = COALESCE(?, school_name),
                school_motto = COALESCE(?, school_motto),
                address = COALESCE(?, address),
                phone = COALESCE(?, phone),
                email = COALESCE(?, email),
                logo_path = COALESCE(?, logo_path),
                mpesa_paybill = COALESCE(?, mpesa_paybill),
                sms_api_key = COALESCE(?, sms_api_key),
                sms_api_secret = COALESCE(?, sms_api_secret),
                sms_sender_id = COALESCE(?, sms_sender_id),
                updated_at = CURRENT_TIMESTAMP 
            WHERE id = 1
        `)

        stmt.run(
            data.school_name, data.school_motto, data.address, data.phone,
            data.email, data.logo_path, data.mpesa_paybill, data.sms_api_key,
            data.sms_api_secret, data.sms_sender_id
        )
        return { success: true }
    })
}

















