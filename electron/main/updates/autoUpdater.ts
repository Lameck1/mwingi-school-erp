import log from 'electron-log'
import { autoUpdater, type UpdateInfo, type ProgressInfo } from 'electron-updater'

import { dialog, ipcMain } from '../electron-env'

import type { BrowserWindow } from 'electron'

// Configure logging
autoUpdater.logger = log
// log.transports.file.level = 'info' // Commented out to avoid type error if log types mismatch

const UPDATE_STATUS_CHANNEL = 'update-status'

export class AutoUpdateManager {
    private readonly mainWindow: BrowserWindow
    private isUpdateAvailable = false
    private downloadProgress = 0

    constructor(mainWindow: BrowserWindow) {
        this.mainWindow = mainWindow
        this.setupAutoUpdater()
        this.setupIPC()
    }

    private setupAutoUpdater(): void {
        // Disable auto-download, we'll control it manually
        autoUpdater.autoDownload = false
        autoUpdater.autoInstallOnAppQuit = true

        // Check for updates on app start (after 5 seconds)
        setTimeout(() => {
            void this.checkForUpdates(true)
        }, 5000)

        // Check for updates every 4 hours
        setInterval(() => {
            void this.checkForUpdates(true)
        }, 4 * 60 * 60 * 1000)

        // Event handlers
        autoUpdater.on('checking-for-update', () => {
            log.info('Checking for updates...')
            this.sendToRenderer(UPDATE_STATUS_CHANNEL, { status: 'checking' })
        })

        autoUpdater.on('update-available', (info: UpdateInfo) => {
            log.info('Update available:', info.version)
            this.isUpdateAvailable = true
            this.sendToRenderer(UPDATE_STATUS_CHANNEL, {
                status: 'available',
                version: info.version,
                releaseNotes: info.releaseNotes
            })

            // Show notification to user
            this.showUpdateNotification(info)
        })

        autoUpdater.on('update-not-available', () => {
            log.info('No updates available')
            this.sendToRenderer(UPDATE_STATUS_CHANNEL, { status: 'not-available' })
        })

        autoUpdater.on('download-progress', (progress: ProgressInfo) => {
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
            log.info('Update downloaded:', info.version)
            this.sendToRenderer(UPDATE_STATUS_CHANNEL, {
                status: 'downloaded',
                version: info.version
            })

            // Prompt user to install
            this.promptInstall(info)
        })

        autoUpdater.on('error', (error: Error) => {
            log.error('Update error:', error)
            this.sendToRenderer(UPDATE_STATUS_CHANNEL, {
                status: 'error',
                error: error.message
            })
        })
    }

    private setupIPC(): void {
        ipcMain.handle('check-for-updates', () => this.checkForUpdates(false))
        ipcMain.handle('download-update', () => this.downloadUpdate())
        ipcMain.handle('install-update', () => this.installUpdate())
        ipcMain.handle('get-update-status', () => ({
            isAvailable: this.isUpdateAvailable,
            downloadProgress: this.downloadProgress
        }))
    }

    async checkForUpdates(silent: boolean = true): Promise<void> {
        try {
            if (process.env.NODE_ENV === 'development') {
                console.error('[Dev] Keeping auto-update check skipped.')
                return
            }
            await autoUpdater.checkForUpdates()
        } catch (error) {
            if (!silent) {
                dialog.showErrorBox('Update Error', 'Failed to check for updates. Please try again later.')
            }
            log.error('Failed to check for updates:', error)
        }
    }

    async downloadUpdate(): Promise<void> {
        if (!this.isUpdateAvailable) {return}

        try {
            await autoUpdater.downloadUpdate()
        } catch (error) {
            log.error('Failed to download update:', error)
            this.sendToRenderer(UPDATE_STATUS_CHANNEL, {
                status: 'error',
                error: 'Download failed'
            })
        }
    }

    installUpdate(): void {
        autoUpdater.quitAndInstall(false, true)
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

