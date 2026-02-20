import { z } from 'zod'

import { getDatabase } from '../../database'
import { app } from '../../electron-env'
import { container } from '../../services/base/ServiceContainer'
import { ConfigService } from '../../services/ConfigService'
import { type SystemMaintenanceService } from '../../services/SystemMaintenanceService'
import { saveImageFromDataUrl, getImageAsBase64DataUrl, deleteImage } from '../../utils/image-utils'
import { ROLES } from '../ipc-result'
import { SettingsUpdateSchema, SecureConfigKeySchema, SecureConfigPairSchema, LogoUploadSchema } from '../schemas/settings-schemas'
import { validatedHandler, validatedHandlerMulti } from '../validated-handler'

export function registerSettingsHandlers(): void {
    const db = getDatabase()

    // ======== SCHOOL SETTINGS ========
    validatedHandler('settings:get', ROLES.STAFF, z.void(), (_event, _data, actor) => {
        const row = db.prepare('SELECT * FROM school_settings WHERE id = 1').get() as Record<string, unknown> | undefined
        if (!row) { return row }
        // Mask sensitive API credentials for non-ADMIN roles
        if (actor.role !== 'ADMIN') {
            if (row['sms_api_key']) { row['sms_api_key'] = '********' }
            if (row['sms_api_secret']) { row['sms_api_secret'] = '********' }
        }
        return row
    })

    validatedHandler('settings:update', ROLES.MANAGEMENT, SettingsUpdateSchema, (_event, settings) => {
        // Use explicit UPDATE statement instead of dynamic builder for maximum security
        // settings is Record<string, unknown>
        const stmt = db.prepare(`
            UPDATE school_settings 
            SET school_name = COALESCE(?, school_name),
                school_motto = COALESCE(?, school_motto),
                address = COALESCE(?, address),
                phone = COALESCE(?, phone),
                email = COALESCE(?, email),
                logo_path = COALESCE(?, logo_path),
                mpesa_paybill = COALESCE(?, mpesa_paybill),
                sms_sender_id = COALESCE(?, sms_sender_id),
                updated_at = CURRENT_TIMESTAMP 
            WHERE id = 1
        `)

        stmt.run(
            settings['school_name'], settings['school_motto'], settings['address'], settings['phone'],
            settings['email'], settings['logo_path'], settings['mpesa_paybill'], settings['sms_sender_id']
        )

        // Route SMS credentials through encrypted ConfigService (F03 remediation)
        if (typeof settings['sms_api_key'] === 'string' && settings['sms_api_key']) {
            ConfigService.saveConfig('sms_api_key', settings['sms_api_key'], true)
        }
        if (typeof settings['sms_api_secret'] === 'string' && settings['sms_api_secret']) {
            ConfigService.saveConfig('sms_api_secret', settings['sms_api_secret'], true)
        }
        if (typeof settings['sms_sender_id'] === 'string' && settings['sms_sender_id']) {
            ConfigService.saveConfig('sms_sender_id', settings['sms_sender_id'], false)
        }

        return { success: true }
    })

    validatedHandler('settings:uploadLogo', ROLES.MANAGEMENT, LogoUploadSchema, async (_event, dataUrl) => {
        try {
            console.warn('[IPC] settings:uploadLogo - Processing upload...')
            // Save image to userData/images/logos/
            const filePath = saveImageFromDataUrl(dataUrl, 'logos', 'school_logo')
            console.warn('[IPC] settings:uploadLogo - Saved to:', filePath)

            // Update DB
            db.prepare('UPDATE school_settings SET logo_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1')
                .run(filePath)

            return { success: true, filePath }
        } catch (error) {
            console.error('[IPC] settings:uploadLogo - Error:', error)
            return { success: false, error: error instanceof Error ? error.message : 'Failed to upload logo' }
        }
    })

    validatedHandler('settings:removeLogo', ROLES.MANAGEMENT, z.void(), async () => {
        try {
            const row = db.prepare('SELECT logo_path FROM school_settings WHERE id = 1').get() as { logo_path?: string } | undefined
            if (row?.logo_path) {
                deleteImage(row.logo_path)
            }
            db.prepare('UPDATE school_settings SET logo_path = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run()
            return { success: true }
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Failed to remove logo' }
        }
    })

    validatedHandler('settings:getLogoDataUrl', ROLES.STAFF, z.void(), async () => {
        const row = db.prepare('SELECT logo_path FROM school_settings WHERE id = 1').get() as { logo_path?: string } | undefined
        if (!row?.logo_path) { return null }
        return getImageAsBase64DataUrl(row.logo_path)
    })


    // ======== SECURE CONFIG ========
    validatedHandler('settings:getSecure', ROLES.ADMIN_ONLY, SecureConfigKeySchema, (_event, key) => {
        const val = ConfigService.getConfig(key)
        if (!val) { return null }
        return val
    })

    validatedHandlerMulti('settings:saveSecure', ROLES.ADMIN_ONLY, SecureConfigPairSchema, (_event, [key, value]) => {
        return ConfigService.saveConfig(key, value, true)
    })

    validatedHandler('settings:getAllConfigs', ROLES.ADMIN_ONLY, z.void(), () => {
        return ConfigService.getAllConfigs()
    })

    // ======== SYSTEM MAINTENANCE ========
    validatedHandler('system:resetAndSeed', ROLES.ADMIN_ONLY, z.number().optional(), (_event, legacyUserId, actor) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            return { success: false, error: "Unauthorized: renderer user mismatch" }
        }
        if (app.isPackaged) {
            return { success: false, error: 'Database reset is disabled in production builds.' }
        }
        const maintenanceService = container.resolve('SystemMaintenanceService') as SystemMaintenanceService
        return maintenanceService.resetAndSeed2026(actor.id)
    })

    validatedHandler('system:normalizeCurrencyScale', ROLES.ADMIN_ONLY, z.number().optional(), (_event, legacyUserId, actor) => {
        if (legacyUserId !== undefined && legacyUserId !== actor.id) {
            return { success: false, error: "Unauthorized: renderer user mismatch" }
        }
        const maintenanceService = container.resolve('SystemMaintenanceService') as SystemMaintenanceService
        return maintenanceService.normalizeCurrencyScale(actor.id)
    })

    validatedHandler('system:seedExams', ROLES.ADMIN_ONLY, z.void(), (_event, _data, actor) => {
        if (app.isPackaged) {
            return { success: false, error: 'Standalone exam seeding is disabled in production builds.' }
        }
        const maintenanceService = container.resolve('SystemMaintenanceService') as SystemMaintenanceService
        return maintenanceService.seedExamsOnly(actor.id)
    })
}
