import log from 'electron-log'
import { autoUpdater, type UpdateInfo, type ProgressInfo } from 'electron-updater'
import { z } from 'zod'

import { dialog } from '../electron-env'
import { ROLES } from '../ipc/ipc-result'
import { validatedHandler } from '../ipc/validated-handler'

import type { BrowserWindow } from 'electron'

type UpdateCommandResult =
    | { success: true; message?: string }
    | { success: false; error: string }

type UpdateStatusSnapshot = {
    isAvailable: boolean
    downloadProgress: number
    status: 'disabled' | 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
    reason?: string
}

const UPDATE_STATUS_CHANNEL = 'update-status'
let updateIpcRegistered = false

// Configure logging
autoUpdater.logger = log

export function registerDisabledUpdateHandlers(reason: string = 'Auto-update is only available in packaged builds'): void {
    if (updateIpcRegistered) {
        return
    }
    updateIpcRegistered = true

    validatedHandler('check-for-updates', ROLES.MANAGEMENT, z.void(), (): UpdateCommandResult => ({ success: false, error: reason }))
    validatedHandler('download-update', ROLES.MANAGEMENT, z.void(), (): UpdateCommandResult => ({ success: false, error: reason }))
    validatedHandler('install-update', ROLES.MANAGEMENT, z.void(), (): UpdateCommandResult => ({ success: false, error: reason }))
    validatedHandler('get-update-status', ROLES.MANAGEMENT, z.void(), (): UpdateStatusSnapshot => ({
        isAvailable: false,
        downloadProgress: 0,
        status: 'disabled',
        reason
    }))
}

export class AutoUpdateManager {
    private readonly mainWindow: BrowserWindow
    private isUpdateAvailable = false
    private downloadProgress = 0
    private status: UpdateStatusSnapshot['status'] = 'idle'

    constructor(mainWindow: BrowserWindow) {
        this.mainWindow = mainWindow
        this.setupAutoUpdater()
        this.setupIPC()
    }

    private setupAutoUpdater(): void {
        autoUpdater.autoDownload = false
        autoUpdater.autoInstallOnAppQuit = true

        setTimeout(() => {
            void this.checkForUpdates(true)
        }, 5000)

        setInterval(() => {
            void this.checkForUpdates(true)
        }, 4 * 60 * 60 * 1000)

        autoUpdater.on('checking-for-update', () => {
            this.status = 'checking'
            log.info('Checking for updates...')
            this.sendToRenderer(UPDATE_STATUS_CHANNEL, { status: 'checking' })
        })

        autoUpdater.on('update-available', (info: UpdateInfo) => {
            this.status = 'available'
            this.isUpdateAvailable = true
            log.info('Update available:', info.version)
            this.sendToRenderer(UPDATE_STATUS_CHANNEL, {
                status: 'available',
                version: info.version,
                releaseNotes: info.releaseNotes
            })
            this.showUpdateNotification(info)
        })

        autoUpdater.on('update-not-available', () => {
            this.status = 'not-available'
            this.isUpdateAvailable = false
            log.info('No updates available')
            this.sendToRenderer(UPDATE_STATUS_CHANNEL, { status: 'not-available' })
        })

        autoUpdater.on('download-progress', (progress: ProgressInfo) => {
            this.status = 'downloading'
            this.downloadProgress = progress.percent
            this.sendToRenderer(UPDATE_STATUS_CHANNEL, {
                status: 'downloading',
                progress: Math.round(progress.percent),
                bytesPerSecond: progress.bytesPerSecond,
                transferred: progress.transferred,
                total: progress.total
            })
        })

        autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
            this.status = 'downloaded'
            log.info('Update downloaded:', info.version)
            this.sendToRenderer(UPDATE_STATUS_CHANNEL, {
                status: 'downloaded',
                version: info.version
            })
            this.promptInstall(info)
        })

        autoUpdater.on('error', (error: Error) => {
            this.status = 'error'
            log.error('Update error:', error)
            this.sendToRenderer(UPDATE_STATUS_CHANNEL, {
                status: 'error',
                error: error.message
            })
        })
    }

    private setupIPC(): void {
        if (updateIpcRegistered) {
            return
        }
        updateIpcRegistered = true

        validatedHandler('check-for-updates', ROLES.MANAGEMENT, z.void(), (): Promise<UpdateCommandResult> => this.checkForUpdates(false))
        validatedHandler('download-update', ROLES.MANAGEMENT, z.void(), (): Promise<UpdateCommandResult> => this.downloadUpdate())
        validatedHandler('install-update', ROLES.MANAGEMENT, z.void(), (): UpdateCommandResult => this.installUpdate())
        validatedHandler('get-update-status', ROLES.MANAGEMENT, z.void(), (): UpdateStatusSnapshot => ({
            isAvailable: this.isUpdateAvailable,
            downloadProgress: this.downloadProgress,
            status: this.status
        }))
    }

    async checkForUpdates(silent: boolean = true): Promise<UpdateCommandResult> {
        try {
            if (process.env['NODE_ENV'] === 'development') {
                return { success: false, error: 'Auto-update checks are disabled in development mode.' }
            }
            await autoUpdater.checkForUpdates()
            return { success: true }
        } catch (error) {
            const errorMessage = 'Failed to check for updates. Please try again later.'
            if (!silent) {
                dialog.showErrorBox('Update Error', errorMessage)
            }
            log.error('Failed to check for updates:', error)
            return { success: false, error: errorMessage }
        }
    }

    async downloadUpdate(): Promise<UpdateCommandResult> {
        if (!this.isUpdateAvailable) {
            return { success: false, error: 'No update is available to download.' }
        }

        try {
            await autoUpdater.downloadUpdate()
            return { success: true }
        } catch (error) {
            this.status = 'error'
            log.error('Failed to download update:', error)
            this.sendToRenderer(UPDATE_STATUS_CHANNEL, {
                status: 'error',
                error: 'Download failed'
            })
            return { success: false, error: 'Download failed' }
        }
    }

    installUpdate(): UpdateCommandResult {
        if (!this.isUpdateAvailable) {
            return { success: false, error: 'No downloaded update is available to install.' }
        }
        autoUpdater.quitAndInstall(false, true)
        return { success: true, message: 'Update install initiated' }
    }

    private showUpdateNotification(info: UpdateInfo): void {
        if (this.mainWindow.isDestroyed()) {return}

        dialog.showMessageBox(this.mainWindow, {
            type: 'info',
            title: 'Update Available',
            message: `A new version (${info.version}) is available!`,
            detail: 'Would you like to download it now?',
            buttons: ['Download', 'Later'],
            defaultId: 0
        }).then(({ response }: { response: number }) => {
            if (response === 0) {
                return this.downloadUpdate()
            }
            return null
        }).catch((error: unknown) => {
            log.error('Failed to show update notification dialog:', error)
        })
    }

    private promptInstall(info: UpdateInfo): void {
        if (this.mainWindow.isDestroyed()) {return}

        dialog.showMessageBox(this.mainWindow, {
            type: 'info',
            title: 'Update Ready',
            message: `Version ${info.version} has been downloaded.`,
            detail: 'The application will restart to install the update.',
            buttons: ['Install Now', 'Install on Exit'],
            defaultId: 0
        }).then(({ response }: { response: number }) => {
            if (response === 0) {
                this.installUpdate()
            }
            return null
        }).catch((error: unknown) => {
            log.error('Failed to show install prompt dialog:', error)
        })
    }

    private sendToRenderer(channel: string, data: unknown): void {
        if (!this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send(channel, data)
        }
    }
}
