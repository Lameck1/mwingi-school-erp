import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { closeDatabase, initializeDatabase } from './database'
import { verifyMigrations } from './database/verify_migrations'
import { app, BrowserWindow, dialog } from './electron-env'
import { registerAllIpcHandlers } from './ipc/index'
import { createApplicationMenu } from './menu/applicationMenu'
import { verifySystemAccounts } from './services/accounting/SystemAccounts'
import { BackupService } from './services/BackupService'
import { registerServices } from './services/base/ServiceContainer'
import { reportScheduler } from './services/reports/ReportScheduler'
// Initialize logger FIRST — explicit log.xxx() calls work immediately;
// console overrides are installed after app.whenReady() below.
import { installConsoleOverrides, log } from './utils/logger'
import { WindowStateManager } from './utils/windowState'

import type { BrowserWindow as BrowserWindowType, Event as ElectronEvent, HandlerDetails } from 'electron'

// ESM __dirname polyfill
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Disable GPU acceleration for better compatibility
app.disableHardwareAcceleration()

// Prevent multiple instances — concurrent SQLite writes cause corruption
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
    app.quit()
}

let mainWindow: BrowserWindowType | null = null

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

async function initializeAutoUpdater(window: BrowserWindowType): Promise<unknown> {
    if (!app.isPackaged) {
        const { registerDisabledUpdateHandlers } = await import('./updates/autoUpdater')
        registerDisabledUpdateHandlers('Auto-update is unavailable in development mode')
        return null
    }

    const { AutoUpdateManager } = await import('./updates/autoUpdater')
    return new AutoUpdateManager(window)
}

function createWindow() {
    const windowState = new WindowStateManager('main')
    const state = windowState.getState()

    const win = new BrowserWindow({
        x: state.x,
        y: state.y,
        width: state.width,
        height: state.height,
        minWidth: 1200,
        minHeight: 700,
        icon: path.join(app.isPackaged ? process.resourcesPath : path.join(__dirname, '../../'), 'assets', 'icon.ico'),
        webPreferences: {
            preload: path.join(__dirname, '../preload/index.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            // Content Security Policy for renderer security
            webSecurity: true,
            allowRunningInsecureContent: false,
            experimentalFeatures: false,
            plugins: true
        },
        show: false,
        titleBarStyle: 'default',
    })
    mainWindow = win

    windowState.manage(win)
    createApplicationMenu(win)
    // Initialize Auto Updater (packaged only)
    initializeAutoUpdater(win).catch((error) => {
        log.error('Failed to initialize auto updater:', error)
    })

    // Show window when ready
    win.once('ready-to-show', () => {
        win.show()
    })

    // Pipe renderer logs to main process using the Event object API.
    win.webContents.on('console-message', (event: ElectronEvent & { message: string }) => {
        const message = event.message
        if (message && message.length > 0) {
            log.warn(`[Renderer] ${message}`)
        }
    })

    // Security: Block external navigation attempts
    win.webContents.on('will-navigate', (event: ElectronEvent, url: string) => {
        // Allow navigation to local files and dev server only
        const isLocalFile = url.startsWith('file://')
        const isDevServer = VITE_DEV_SERVER_URL && url.startsWith(VITE_DEV_SERVER_URL)
        if (!isLocalFile && !isDevServer) {
            log.warn(`Blocked navigation to external URL: ${url}`)
            event.preventDefault()
        }
    })

    // Security: Block new window creation (popups)
    win.webContents.setWindowOpenHandler(({ url }: HandlerDetails) => {
        log.warn(`Blocked popup window request for: ${url}`)
        return { action: 'deny' }
    })

    // Load the app
    if (VITE_DEV_SERVER_URL) {
        win.loadURL(VITE_DEV_SERVER_URL).catch((err: Error) => log.error('Failed to load dev URL:', err.message))
        win.webContents.openDevTools()
    } else {
        win.loadFile(path.join(__dirname, '../../dist/index.html')).catch((err: Error) => log.error('Failed to load file:', err.message))
    }

    win.on('closed', () => {
        mainWindow = null
    })
}

function sendDbError(message: string) {
    if (!mainWindow || mainWindow.isDestroyed()) { return }
    mainWindow.webContents.send('db-error', message)
}

// ── Application startup ─────────────────────────────────────────
// Wrapped in an async function (NOT top-level await) to avoid
// deadlocking the Electron event loop during ESM module evaluation.
// With top-level `await`, Node pauses module evaluation which can
// prevent Electron's 'ready' event from firing in bundled builds.
async function bootstrap(): Promise<void> {
    await app.whenReady()

    // Now that Electron is ready, redirect console.error/warn to log file
    installConsoleOverrides()

    // Set Content Security Policy
    const { session } = await import('electron')
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [
                    VITE_DEV_SERVER_URL
                        ? "default-src 'self' 'unsafe-inline' 'unsafe-eval'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' ws: http: https:; object-src 'none'; frame-src 'self' blob:"
                        : "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; img-src 'self' data:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://api.africastalking.com https://api.twilio.com https://api.sendgrid.com; object-src 'none'; frame-src 'self' blob:"
                ]
            }
        })
    })

    // Initialize database
    let dbReady = false
    try {
        await initializeDatabase()

        // Verify migrations
        verifyMigrations()

        // Verify System Accounts
        verifySystemAccounts()

        dbReady = true
    } catch (error) {
        log.error('Failed to initialize database:', error)
        sendDbError(error instanceof Error ? error.message : 'Database initialization failed')
        dialog.showErrorBox('Database Error', 'Failed to initialize database. Application will exit.')
        app.quit()
    }

    if (dbReady) {
        // Initialize Services
        registerServices()

        // Register IPC handlers
        registerAllIpcHandlers()

        // Initialize Auto Backup Service
        try {
            await BackupService.init()
        } catch (error) {
            log.error('Failed to initialize backup service:', error)
        }

        // Initialize Report Scheduler
        reportScheduler.initialize()

        // Create window
        createWindow()

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createWindow()
            }
        })
    }
}

// Top-level await deadlocks Electron in bundled ESM — must use .catch()
void bootstrap().catch((error: unknown) => { // NOSONAR — top-level await deadlocks Electron ESM
    log.error('Application startup failed:', error)
    dialog.showErrorBox('Startup Error', 'Failed to start application.')
    app.quit()
})

// Focus existing window when a second instance is launched
app.on('second-instance', () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) { mainWindow.restore() }
        mainWindow.focus()
    }
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('before-quit', () => {
    reportScheduler.shutdown()
    closeDatabase()
})

let shutdownScheduled = false
function scheduleGracefulShutdown(): void {
    if (shutdownScheduled) { return }
    shutdownScheduled = true
    setTimeout(() => {
        log.warn('Shutting down after critical error...')
        app.quit()
    }, 3000)
}

process.on('uncaughtException', (error: Error) => {
    log.error('Uncaught Exception:', error)
    sendDbError(error.message || 'Unexpected error')
    scheduleGracefulShutdown()
})

process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
    log.error('Unhandled Rejection at:', promise, 'reason:', reason)
    sendDbError(reason instanceof Error ? reason.message : 'Unhandled promise rejection')
    scheduleGracefulShutdown()
})
