import { app, BrowserWindow, dialog } from './electron-env'
import type { BrowserWindow as BrowserWindowType } from 'electron'

import path from 'path'
import { fileURLToPath } from 'url'
import { initializeDatabase } from './database/index'
import { verifyMigrations } from './database/verify_migrations'
import { registerAllIpcHandlers } from './ipc/index'
import { registerServices } from './services/base/ServiceContainer'
import { BackupService } from './backup-service'
import { WindowStateManager } from './utils/windowState'
import { createApplicationMenu } from './menu/applicationMenu'
import { AutoUpdateManager } from './updates/autoUpdater'
import { reportScheduler } from './services/reports/ReportScheduler'

// ESM __dirname polyfill
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Disable GPU acceleration for better compatibility
app.disableHardwareAcceleration()

let mainWindow: BrowserWindowType | null = null

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

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
        icon: path.join(__dirname, '../../resources/icon.ico'),
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
        // Initialize Auto Updater
        new AutoUpdateManager(mainWindow)
    }

    // Show window when ready
    mainWindow!.once('ready-to-show', () => {
        mainWindow?.show()
    })

    // Pipe renderer logs to main process
    mainWindow!.webContents.on('console-message', (_event, _level, message) => {
        console.error(`[Renderer] ${message}`)
    })

    // Load the app
    if (VITE_DEV_SERVER_URL) {
        mainWindow!.loadURL(VITE_DEV_SERVER_URL)
        mainWindow!.webContents.openDevTools()
    } else {
        mainWindow!.loadFile(path.join(__dirname, '../../dist/index.html'))
    }

    mainWindow!.on('closed', () => {
        mainWindow = null
    })
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
        dialog.showErrorBox('Database Error', 'Failed to initialize database. Application will exit.')
        app.quit()
        return
    }

    // Initialize Services
    registerServices()

    // Register IPC handlers
    registerAllIpcHandlers()

    // Initialize Auto Backup Service
    BackupService.init()

    // Initialize Report Scheduler
    reportScheduler.initialize()

    // Create window
    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
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
    // In production, you might want to gracefully exit or restart
});

// Handle unhandled promise rejections
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(process as any).on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason)
    // In production, you might want to gracefully exit or restart
});










