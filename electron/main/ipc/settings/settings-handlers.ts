import { getDatabase } from '../../database'
import { app } from '../../electron-env'
import { container } from '../../services/base/ServiceContainer'
import { ConfigService } from '../../services/ConfigService'
import { type SystemMaintenanceService } from '../../services/SystemMaintenanceService'
import { safeHandleRawWithRole, ROLES, resolveActorId } from '../ipc-result'

export function registerSettingsHandlers(): void {
    const db = getDatabase()

    // ======== SCHOOL SETTINGS ========
    safeHandleRawWithRole('settings:get', ROLES.STAFF, () => {
        return db.prepare('SELECT * FROM school_settings WHERE id = 1').get()
    })

    safeHandleRawWithRole('settings:update', ROLES.MANAGEMENT, (_event, data: unknown) => {
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
    safeHandleRawWithRole('settings:getSecure', ROLES.ADMIN_ONLY, (_event, key: string) => {
        const val = ConfigService.getConfig(key)
        if (!val) {return null}
        return val
    })

    safeHandleRawWithRole('settings:saveSecure', ROLES.ADMIN_ONLY, (_event, key: string, value: string) => {
        return ConfigService.saveConfig(key, value, true)
    })

    safeHandleRawWithRole('settings:getAllConfigs', ROLES.ADMIN_ONLY, () => {
        return ConfigService.getAllConfigs()
    })

    // ======== SYSTEM MAINTENANCE ========
    safeHandleRawWithRole('system:resetAndSeed', ROLES.ADMIN_ONLY, (event, legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) {
            return { success: false, error: actor.error }
        }
        if (app.isPackaged) {
            return { success: false, error: 'Database reset is disabled in production builds.' }
        }
        const maintenanceService = container.resolve('SystemMaintenanceService') as SystemMaintenanceService
        return maintenanceService.resetAndSeed2026(actor.actorId)
    })

    safeHandleRawWithRole('system:normalizeCurrencyScale', ROLES.ADMIN_ONLY, (event, legacyUserId?: number) => {
        const actor = resolveActorId(event, legacyUserId)
        if (!actor.success) {
            return { success: false, error: actor.error }
        }
        const maintenanceService = container.resolve('SystemMaintenanceService') as SystemMaintenanceService
        return maintenanceService.normalizeCurrencyScale(actor.actorId)
    })
}


















