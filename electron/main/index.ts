
import path from 'path'
import { fileURLToPath } from 'url'

import { BackupService } from './backup-service'
import { initializeDatabase } from './database'
import { verifyMigrations } from './database/verify_migrations'
import { app, BrowserWindow, dialog } from './electron-env'
import { registerAllIpcHandlers } from './ipc/index'
import { createApplicationMenu } from './menu/applicationMenu'
import { registerServices } from './services/base/ServiceContainer'
import { reportScheduler } from './services/reports/ReportScheduler'
import { WindowStateManager } from './utils/windowState'

import type { BrowserWindow as BrowserWindowType } from 'electron'

// ESM __dirname polyfill
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Disable GPU acceleration for better compatibility
app.disableHardwareAcceleration()

let mainWindow: BrowserWindowType | null = null

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

async function initializeAutoUpdater(window: BrowserWindowType): Promise<unknown> {
    if (!app.isPackaged) {
        return null
    }

    const { AutoUpdateManager } = await import('./updates/autoUpdater')
    return new AutoUpdateManager(window)
}

function createWindow() {
    const windowState = new WindowStateManager('main')
    const state = windowState.getState()

    mainWindow = new BrowserWindow({
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
        },
        show: false,
        titleBarStyle: 'default',
    })

    if (mainWindow) {
        windowState.manage(mainWindow)
        createApplicationMenu(mainWindow)
        // Initialize Auto Updater (packaged only)
        initializeAutoUpdater(mainWindow).catch((error) => {
            console.error('Failed to initialize auto updater:', error)
        })
    }

    // Show window when ready
    mainWindow!.once('ready-to-show', () => {
        mainWindow?.show()
    })

    // Pipe renderer logs to main process using the current Electron event payload shape.
    mainWindow!.webContents.on('console-message', (_event, details: unknown) => {
        if (!details || typeof details !== 'object' || !('message' in details)) {
            return
        }
        const message = String((details as { message?: unknown }).message ?? '')
        if (message.length > 0) {
            console.error(`[Renderer] ${message}`)
        }
    })

    // Load the app
    if (VITE_DEV_SERVER_URL) {
        void mainWindow!.loadURL(VITE_DEV_SERVER_URL)
        mainWindow!.webContents.openDevTools()
    } else {
        void mainWindow!.loadFile(path.join(__dirname, '../../dist/index.html'))
    }

    mainWindow!.on('closed', () => {
        mainWindow = null
    })
}

function sendDbError(message: string) {
    if (!mainWindow || mainWindow.isDestroyed()) {return}
    mainWindow.webContents.send('db-error', message)
}

// App lifecycle
app.whenReady().then(async () => {
    // Initialize database
    try {
        await initializeDatabase()
        // console.error('Database initialized successfully')
        
        // Verify migrations
        verifyMigrations()
    } catch (error) {
        console.error('Failed to initialize database:', error)
        sendDbError(error instanceof Error ? error.message : 'Database initialization failed')
        dialog.showErrorBox('Database Error', 'Failed to initialize database. Application will exit.')
        app.quit()
        return
    }

    // Initialize Services
    registerServices()

    // Register IPC handlers
    registerAllIpcHandlers()

    // Initialize Auto Backup Service
    try {
        await BackupService.init()
    } catch (error) {
        console.error('Failed to initialize backup service:', error)
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

    return null
}).catch((error) => {
    console.error('Application startup failed:', error)
    dialog.showErrorBox('Startup Error', 'Failed to start application.')
    app.quit()
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
});

// Handle uncaught exceptions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(process as any).on('uncaughtException', (error: Error) => {
    console.error('Uncaught Exception:', error)
    sendDbError(error.message || 'Unexpected error')
    // In production, you might want to gracefully exit or restart
});

// Handle unhandled promise rejections
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(process as any).on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason)
    sendDbError(reason instanceof Error ? reason.message : 'Unhandled promise rejection')
});






