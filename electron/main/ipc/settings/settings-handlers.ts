import { ipcMain } from '../../electron-env'
import type { IpcMainInvokeEvent } from 'electron'
import { getDatabase } from '../../database/index'
import { ConfigService } from '../../services/ConfigService'
import { container } from '../../services/base/ServiceContainer'
import { SystemMaintenanceService } from '../../services/SystemMaintenanceService'

export function registerSettingsHandlers(): void {
    const db = getDatabase()

    // ======== SCHOOL SETTINGS ========
    ipcMain.handle('settings:get', async () => {
        return db.prepare('SELECT * FROM school_settings WHERE id = 1').get()
    })

    ipcMain.handle('settings:update', async (_event: IpcMainInvokeEvent, data: unknown) => {
        // Use explicit UPDATE statement instead of dynamic builder for maximum security
        const settings = data as Record<string, unknown>
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
            settings.school_name, settings.school_motto, settings.address, settings.phone,
            settings.email, settings.logo_path, settings.mpesa_paybill, settings.sms_api_key,
            settings.sms_api_secret, settings.sms_sender_id
        )
        return { success: true }
    })


    // ======== SECURE CONFIG ========
    ipcMain.handle('settings:getSecure', async (_event: IpcMainInvokeEvent, key: string) => {
        // Return masked value if encrypted
        const val = ConfigService.getConfig(key)
        if (!val) return null
        return val
    })

    ipcMain.handle('settings:saveSecure', async (_event: IpcMainInvokeEvent, key: string, value: string) => {
        return ConfigService.saveConfig(key, value, true)
    })

    ipcMain.handle('settings:getAllConfigs', async () => {
        return ConfigService.getAllConfigs()
    })

    // ======== SYSTEM MAINTENANCE ========
    ipcMain.handle('system:resetAndSeed', async (_event: IpcMainInvokeEvent, userId: number) => {
        const maintenanceService = container.resolve<SystemMaintenanceService>('SystemMaintenanceService')
        return maintenanceService.resetAndSeed2026(userId)
    })
}

















