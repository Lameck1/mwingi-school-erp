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


    // ======== SECURE CONFIG ========
    ipcMain.handle('settings:getSecure', async (_event: IpcMainInvokeEvent, key: string) => {
        // Return masked value if encrypted
        const val = ConfigService.getConfig(key)
        if (!val) return null
        // If it looks encrypted/sensitive, maybe we mask it here? 
        // Logic in Service says getConfig returns decrypted. 
        // UI should decide to mask or Service getAllConfigs does.
        // For individual get, we return decrypted so "Test Connection" works.
        // Wait, for UI display we generally want Masked. 
        // Let's rely on getAllConfigs for bulk display and getSecure for internal use?
        // Actually, let's expose getAll for UI.
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

















